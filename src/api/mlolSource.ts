import { ApiError } from "./errors";
import { gmGet } from "./transport";
import type { BattleSummary } from "./types";

/**
 * 掌盟源（mlol.qt.qq.com）：搜索结果自带服务器现签的 scene（访问凭证），
 * 凭 scene 可查该玩家的战绩列表/详情——即使对方在 WeGame 侧隐藏了战绩。
 * 全部经由 lol.qq.com 桥（postMessage）传输。
 */
const MLOL_SEARCH_PATH = "customize_search/search_type_keyword";
const MLOL_LIST_PATH = "battle_info/get_battle_list";
const MLOL_PROFILE_PATH = "mine/person/tab_lite_common";
const MLOR_ORIGIN = "https://lol.qq.com";

export interface MlolPlayerCard {
  uuid: string;
  scene: string;
  name: string;
  icon: string;
  desc: string;
}

interface BridgeRequest {
  type: "lol-tft-mlol-request";
  id: string;
  path: string;
  method: "GET" | "POST";
  body: Record<string, string | number>;
}

let bridgeWindow: Window | null = null;
let bridgeReadyPromise: Promise<Window> | null = null;
const pending = new Map<string, { resolve: (text: string) => void; reject: (error: unknown) => void }>();

export function ensureMlolBridge(): Promise<Window> {
  if (bridgeReadyPromise) return bridgeReadyPromise;
  bridgeReadyPromise = new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = MLOR_ORIGIN + "/__lol_tft_bridge__";
    const timer = setTimeout(() => {
      iframe.remove();
      reject(new ApiError("BRIDGE_TIMEOUT", "MlolRequest", "掌盟桥接超时"));
    }, 15000);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== MLOR_ORIGIN) return;
      const data = event.data as { type?: string; id?: string; text?: string; status?: number } | null;
      if (!data) return;
      if (data.type === "lol-tft-bridge-ready") {
        clearTimeout(timer);
        bridgeWindow = iframe.contentWindow as Window;
        resolve(bridgeWindow);
      } else if (data.type === "lol-tft-mlol-response" && data.id) {
        const entry = pending.get(data.id);
        if (entry) {
          pending.delete(data.id);
          entry.resolve(String(data.text ?? "") + "\u0000" + String(data.status ?? 0));
        }
      }
    };
    globalThis.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
  return bridgeReadyPromise;
}

/** 任意掌盟接口（桥传输）；返回解析后的 JSON */
export async function mlolRequest(path: string, body: Record<string, string | number> = {}, method: "GET" | "POST" = "POST", signal?: AbortSignal): Promise<Record<string, unknown>> {
  const win = await ensureMlolBridge();
  const id = "mlol-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const payloadPromise = new Promise<string>((resolve, reject) => {
    pending.set(id, {
      resolve: (text) => { if (timer) clearTimeout(timer); resolve(text); },
      reject: (error) => { if (timer) clearTimeout(timer); reject(error); }
    });
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new ApiError("BRIDGE_TIMEOUT", "MlolRequest", "掌盟桥接响应超时"));
      }
    }, 15000);
  });
  signal?.addEventListener("abort", () => { pending.delete(id); }, { once: true });
  const request: BridgeRequest = { type: "lol-tft-mlol-request", id, path, method, body };
  win.postMessage(request, MLOR_ORIGIN);
  const raw = await payloadPromise;
  const sep = raw.lastIndexOf("\u0000");
  const text = sep >= 0 ? raw.slice(0, sep) : raw;
  const status = Number(sep >= 0 ? raw.slice(sep + 1) : 0) || 0;
  if (!text) {
    throw new ApiError("MLOL_EMPTY", "MlolRequest", "掌盟返回空响应（HTTP " + status + "）——可能被风控或需要更完整的登录态");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ApiError("MLOL_BAD_JSON", "MlolRequest", "掌盟响应非 JSON（HTTP " + status + "），头部: " + text.slice(0, 160));
  }
  return parsed;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** 从 lol.qq.com 掌盟页链接里提取 scene 令牌 */
export function parseSceneFromLink(url: string): string {
  const match = url.match(/[?&]scene=([A-Za-z0-9_-]+)/);
  return match ? match[1] : "";
}

/** 昵称搜索：返回玩家卡（uuid + 服务器现签 scene） */
export async function searchMlolPlayers(keyword: string, signal?: AbortSignal): Promise<MlolPlayerCard[]> {
  const params = {
    keyWord: keyword,
    searchType: 1,
    page: 0,
    pageSize: 10,
    gameId: "lol",
    source_game_zone: "lol",
    game_zone: "lol"
  };
  // 搜索不需要登录 cookie，但跨域被 CORS 挡——走 GM（无 CORS）；GM 不可用时退桥
  const query = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v))).join("&");
  let payload: Record<string, unknown>;
  try {
    const text = await gmGet("https://mlol.qt.qq.com/go/" + MLOL_SEARCH_PATH + "?" + query);
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch (gmError) {
    // GM 不可用（无 GM 环境）→ 桥；桥也失败 → 报告
    try {
      payload = await mlolRequest(MLOL_SEARCH_PATH, params, "GET", signal);
    } catch {
      throw gmError instanceof Error ? gmError : new Error("掌盟搜索失败");
    }
  }
  const data = record(payload.data);
  const list = Array.isArray(data.userList) ? data.userList : [];
  const cards: MlolPlayerCard[] = [];
  for (const value of list) {
    const u = record(value);
    const uuid = typeof u.userId === "string" ? u.userId : "";
    const lolIntent = typeof u.lolIntent === "string" ? u.lolIntent : "";
    const scene = parseSceneFromLink(lolIntent);
    if (!uuid || !scene) continue;
    cards.push({
      uuid,
      scene,
      name: typeof u.userName === "string" ? u.userName : "",
      icon: typeof u.userIcon === "string" ? u.userIcon : "",
      desc: typeof u.userDesc === "string" ? u.userDesc : ""
    });
  }
  return cards;
}

export interface MlolIdentity {
  uuid: string;
  scene: string;
  roleName: string;
  areaId: number;
  areaName: string;
}

/** scene -> 玩家身份（uuid/角色名/大区） */
export async function fetchMlolIdentity(scene: string, signal?: AbortSignal): Promise<MlolIdentity> {
  const payload = await mlolRequest(MLOL_PROFILE_PATH, {
    scene,
    source_game_zone: "lol",
    game_zone: "lol"
  }, "POST", signal);
  const data = record(payload.data);
  const info = record(data.user_info);
  const uuid = typeof info.uuid === "string" ? info.uuid : "";
  if (!uuid) throw new ApiError("MLOL_NO_IDENTITY", "MlolIdentity", "链接已失效，请重新从掌盟分享获取");
  return {
    uuid,
    scene: typeof info.scene === "string" && info.scene ? info.scene : scene,
    roleName: typeof info.role_name === "string" ? info.role_name : "",
    areaId: Number(info.area_id) || 0,
    areaName: typeof info.area_name === "string" ? info.area_name : ""
  };
}

/** 掌盟列表项 -> BattleSummary（game_queue_id 与 wegame 同编号空间） */
export function mapMlolBattle(raw: Record<string, unknown>): BattleSummary {
  // game_result: 1=胜 2=负（game_result_title 直接给中文，优先用）
  const title = typeof raw.game_result_title === "string" ? raw.game_result_title : "";
  const win = title.includes("胜") ? "Win" : Number(raw.game_result) === 1 ? "Win" : "Fail";
  // game_start_time 秒 -> 毫秒字符串（BattleSummary 约定毫秒）
  const startSec = Number(raw.game_start_time);
  const startMs = Number.isFinite(startSec) ? startSec * 1000 : 0;
  const battleTime = typeof raw.battle_time === "string" ? raw.battle_time : "";
  const modeName = typeof raw.game_mode_name === "string" ? raw.game_mode_name : "";
  const summary: BattleSummary = {
    game_id: String(raw.game_id ?? ""),
    game_start_time: startMs > 0 ? String(startMs) : battleTime,
    game_time_played: Number(raw.game_time_played) || 0,
    game_queue_id: Number(raw.game_queue_id) || Number(raw.game_mode_id) || 0,
    champion_id: Number(raw.champion_id) || 0,
    win,
    kills: Number(raw.champions_killed) || 0,
    deaths: Number(raw.num_deaths) || 0,
    assists: Number(raw.assists) || 0,
    was_mvp: Number(raw.is_mvp) === 1 ? 1 : 0,
    was_svp: Number(raw.is_svp) === 1 ? 1 : 0,
    game_mode_name: modeName || undefined
  };
  return summary;
}

/** 战绩列表（scene 授权） */
export async function fetchMlolBattles(scene: string, startIdx = 0, signal?: AbortSignal): Promise<{ battles: BattleSummary[]; nextIdx: number }> {
  const payload = await mlolRequest(MLOL_LIST_PATH, {
    search_type: 0,
    battle_types: "",
    target_scene: scene,
    source_game_zone: "lol",
    game_zone: "lol",
    start_idx: startIdx
  }, "POST", signal);
  const data = record(payload.data);
  if (Number(data.result) !== 0 || Number(payload.result ?? 0) !== 0) {
    throw new ApiError("MLOL_LIST_DENIED", "MlolBattles", "掌盟列表被拒: " + JSON.stringify(payload).slice(0, 160));
  }
  const list = Array.isArray(data.player_battle_brief_list) ? data.player_battle_brief_list : [];
  return {
    battles: list.map((item) => mapMlolBattle(record(item))),
    nextIdx: Number(data.next_start_idx) || startIdx
  };
}
