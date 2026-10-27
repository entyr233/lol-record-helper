import { ApiError } from "./errors";
import { hasGmTransport, postForm } from "./transport";
import type { BattleDetail, PlayerDetail, TeamDetail } from "./types";

const MLOL_DETAIL_URL = "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5";
const BRIDGE_ORIGIN = "https://lol.qq.com";
const BRIDGE_URL = BRIDGE_ORIGIN + "/__lol_tft_bridge__";

export interface MlolDetailInput {
  gameId: string;
  areaId: number | string;
  startTime?: number | string;
  uuid?: string;
}

interface MlolPlayer { [key: string]: unknown }

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function mapPlayer(p: MlolPlayer): PlayerDetail {
  const gameLevelRaw = p.game_level as { tier?: unknown; league_points?: unknown } | undefined;
  return {
    openid: String(p.puuid ?? p.uuid ?? ""),
    name: String(p.name ?? ""),
    championId: num(p.champion_id),
    level: num(p.level),
    teamId: String(p.team_id ?? ""),
    teamMadeSize: 1,
    championsKilled: num(p.champions_killed),
    numDeaths: num(p.num_deaths),
    assists: num(p.assists),
    gameScore: num(p.game_score),
    totalDamageToChampions: num(p.total_damage_dealt_to_champions),
    totalDamageTaken: num(p.total_damage_taken),
    magicDamageToChampions: num(p.magic_damage_dealt_to_champions),
    physicalDamageToChampions: num(p.physical_damage_dealt_to_champions),
    trueDemageToChampions: num(p.true_damage_to_champions),
    item0: num(p.item0), item1: num(p.item1), item2: num(p.item2), item3: num(p.item3),
    item4: num(p.item4), item5: num(p.item5), item6: num(p.item6),
    keystoneId: 0,
    perkSubStyle: num(p.perkSubStyle),
    summonSpell1Id: num(p.summon_spell1_id),
    summonSpell2Id: num(p.summon_spell2_id),
    battleHonour: { isMvp: !!p.is_mvp, isSvp: !!p.is_svp },
    gameLevel: gameLevelRaw ? { tier: num(gameLevelRaw.tier, 255), leaguePoints: String(gameLevelRaw.league_points ?? "") } : undefined,
    perkStyleUrl: p.perk_style_url ? String(p.perk_style_url) : undefined
  } as PlayerDetail;
}

function teamSummary(players: MlolPlayer[], totals: MlolPlayer | undefined, win: boolean): TeamDetail {
  const totalKills = num(totals?.champions_killed) || players.reduce((sum, p) => sum + num(p.champions_killed), 0);
  const totalDeaths = num(totals?.total_deaths ?? totals?.num_deaths) || players.reduce((sum, p) => sum + num(p.num_deaths), 0);
  const totalAssists = players.reduce((sum, p) => sum + num(p.assists), 0);
  return {
    teamId: String(players[0]?.team_id ?? "0"),
    win: win ? "Win" : "Fail",
    teamElo: 0,
    totalKills,
    totalDeaths,
    totalAssists
  };
}

interface MlolPayload {
  data?: { info?: Record<string, unknown> };
  result?: number;
  msg?: string;
  err_msg?: string;
}

function mapPayload(payload: MlolPayload): BattleDetail {
  const info = payload.data?.info;
  if (!info) {
    const code = payload.result ?? "MLOL_EMPTY";
    const message = String(payload.msg ?? payload.err_msg ?? "");
    if (String(code) === "1001") {
      throw new ApiError(code, "GetBattleDetail(mlol)", "需要 QQ 侧登录态：请在浏览器登录 lol.qq.com 官网后重试");
    }
    throw new ApiError(code, "GetBattleDetail(mlol)", message || "掌盟详情无数据");
  }
  const match = info.match as { my_team?: MlolPlayer[]; opponent_team?: MlolPlayer[] } | undefined;
  const myTeam = match?.my_team ?? [];
  const opponentTeam = match?.opponent_team ?? [];
  const win = !!info.win;
  return {
    area_id: "",
    game_id: String(info.game_id ?? ""),
    game_start_time: String(info.start_time_ts ?? ""),
    game_time_played: num(info.duration_ts),
    map_id: num(info.battle_map_id),
    game_queue_id: num(info.game_queue_id),
    team_details: [
      teamSummary(myTeam, info.my_team as MlolPlayer | undefined, win),
      teamSummary(opponentTeam, info.opponent_team as MlolPlayer | undefined, !win)
    ],
    player_details: [...myTeam, ...opponentTeam].map(mapPlayer)
  };
}

function buildForm(input: MlolDetailInput): FormData {
  const form = new FormData();
  form.append("uuid", input.uuid ?? "");
  form.append("area_id", String(input.areaId));
  form.append("game_id", String(input.gameId));
  // 掌盟接口的 start_time 是秒；列表里是毫秒
  const raw = Number(input.startTime);
  form.append("start_time", Number.isFinite(raw) && raw > 1e12 ? String(Math.floor(raw / 1000)) : input.startTime !== undefined ? String(input.startTime) : "");
  return form;
}

async function requestDirect(input: MlolDetailInput, signal?: AbortSignal): Promise<BattleDetail> {
  const response = await postForm(MLOL_DETAIL_URL, buildForm(input), { signal });
  return mapPayload((await response.json()) as MlolPayload);
}

// ---------- postMessage 桥：借 lol.qq.com 页面做同源请求 ----------
interface BridgeRequest {
  type: "lol-tft-detail-request";
  id: string;
  gameId: string;
  areaId: string;
  startTime: string;
  uuid: string;
}

let bridgeReadyPromise: Promise<Window> | null = null;
const bridgePending = new Map<string, { resolve: (text: string) => void; reject: (error: unknown) => void }>();

/**
 * 桥接页（userscript/lol-tft.template.js 的 installBridge）回传的响应类型。
 * 历史上存在两套命名（detail-response / mlol-response），两端必须保持同步；
 * 这里两种都接受，避免「远端已返回、面板却一直等到超时」。
 */
export const BRIDGE_RESPONSE_TYPES = ["lol-tft-detail-response", "lol-tft-mlol-response"] as const;

function isBridgeResponse(type: string | undefined): boolean {
  return type !== undefined && (BRIDGE_RESPONSE_TYPES as readonly string[]).includes(type);
}

function ensureBridge(): Promise<Window> {
  if (bridgeReadyPromise) return bridgeReadyPromise;
  const pending = new Promise<Window>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = BRIDGE_URL;

    const timer = setTimeout(() => {
      globalThis.removeEventListener("message", onMessage);
      iframe.remove();
      reject(new ApiError("BRIDGE_TIMEOUT", "GetBattleDetail(mlol)", "掌盟桥接超时"));
    }, 15000);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BRIDGE_ORIGIN) return;
      const data = event.data as { type?: string; id?: string; text?: string; error?: string } | null;
      if (!data) return;
      if (data.type === "lol-tft-bridge-ready") {
        clearTimeout(timer);
        resolve(iframe.contentWindow as Window);
        return;
      }
      if (!isBridgeResponse(data.type) || !data.id) return;
      const entry = bridgePending.get(data.id);
      if (!entry) return;
      bridgePending.delete(data.id);
      // 失败响应也要结束等待，不能只处理成功
      if (data.error) {
        entry.reject(new ApiError("BRIDGE_ERROR", "GetBattleDetail(mlol)", String(data.error)));
        return;
      }
      entry.resolve(String(data.text ?? ""));
    };
    globalThis.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
  bridgeReadyPromise = pending;
  // 桥接初始化失败后允许下一次重试（否则一次超时会永久复用失败的 Promise）
  pending.catch(() => {
    if (bridgeReadyPromise === pending) bridgeReadyPromise = null;
  });
  return bridgeReadyPromise;
}

function abortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}

/** 让「等待桥接就绪」这类没有 signal 参数的等待也能被取消结束 */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function requestViaBridge(input: MlolDetailInput, signal?: AbortSignal): Promise<BattleDetail> {
  if (signal?.aborted) throw abortError();
  const win = await raceAbort(ensureBridge(), signal);
  if (signal?.aborted) throw abortError();
  const id = "req-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const payloadPromise = new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (timer) clearTimeout(timer);
      finish();
    };
    const onAbort = () => settle(() => {
      bridgePending.delete(id);
      reject(abortError());
    });
    bridgePending.set(id, {
      resolve: (text) => settle(() => resolve(text)),
      reject: (error) => settle(() => reject(error))
    });
    timer = setTimeout(() => settle(() => {
      bridgePending.delete(id);
      reject(new ApiError("BRIDGE_TIMEOUT", "GetBattleDetail(mlol)", "掌盟桥接响应超时"));
    }), 15000);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
  const request: BridgeRequest = {
    type: "lol-tft-detail-request",
    id,
    gameId: String(input.gameId),
    areaId: String(input.areaId),
    startTime: String(buildForm(input).get("start_time") ?? ""),
    uuid: input.uuid ?? ""
  };
  win.postMessage(request, BRIDGE_ORIGIN);
  const text = await payloadPromise;
  return mapPayload(JSON.parse(text) as MlolPayload);
}

/**
 * 掌盟详情：先直连（GM 环境可能直接带 cookie），被拒（1001）再走 lol.qq.com 桥。
 */
export async function fetchMlolBattleDetail(input: MlolDetailInput, signal?: AbortSignal): Promise<BattleDetail> {
  if (hasGmTransport()) {
    try {
      return await requestDirect(input, signal);
    } catch (error) {
      if (error instanceof ApiError && String(error.code) === "1001" && typeof document !== "undefined") {
        return requestViaBridge(input, signal);
      }
      throw error;
    }
  }
  if (typeof document !== "undefined" && globalThis.location?.host !== "lol.qq.com") {
    return requestViaBridge(input, signal);
  }
  return requestDirect(input, signal);
}
