<template>
  <div class="battle-detail">
    <p v-if="loading" class="state-text">加载对局详情…</p>
    <div v-else-if="error" class="state-text state-text--error detail-error">
      <p class="detail-error-title">{{ toErrorMessage(error) }}</p>
      <p class="detail-error-hint">{{ errorHint }}</p>
      <div class="detail-error-actions">
        <button type="button" class="link-button" :disabled="loggingIn" @click="run">重试</button>
        <button v-if="errorKind === 'captcha'" type="button" class="link-button" @click="openHelper">去 LOL 助手页</button>
        <button v-if="errorKind === 'auth'" type="button" class="link-button" :disabled="loggingIn" @click="retryLogin">重新登录</button>
      </div>
      <details class="detail-error-debug">
        <summary>查看数据来源诊断</summary>
        <pre class="detail-error-trail">{{ debugText }}</pre>
      </details>
    </div>
    <template v-else-if="detail">
      <div class="detail-summary">
        <GameIcon v-if="viewedPlayer" kind="champion" :id="viewedChampionId" />
        <span v-if="viewedTeam" class="detail-summary-result" :class="'detail-summary-result--' + viewedTeam.resultClass">{{ viewedTeam.resultLabel }}</span>
        <span v-if="viewedPlayer" class="detail-summary-name">{{ decodedPlayerName(viewedPlayer) }}</span>
        <span class="detail-summary-meta">{{ summaryMeta }}</span>
        <span v-if="detailSource" class="detail-source" :class="'detail-source--' + detailSource" :title="sourceTitle">{{ sourceText }}</span>
        <span v-if="detailSource === 'mlol'" class="detail-source-note" title="掌盟源不返回玩家 openid，昵称不可点击跳转">不可跳转玩家</span>
      </div>
      <div class="detail-toolbar">
        <div class="mode-switch">
          <button v-for="m in MODES" :key="m" type="button" class="mode-button" :class="{ active: currentMode === m }" @click="currentMode = m">{{ m }}</button>
        </div>
        <select class="sort-select" :value="sortBy" @change="onSortChange">
          <option value="default">默认排序</option>
          <option value="damage">按输出</option>
          <option value="taken">按承伤</option>
          <option value="gold">按经济</option>
          <option value="participation">按参团率</option>
        </select>
      </div>
      <section v-for="team in teams" :key="team.teamId" class="detail-team" :class="team.resultClass">
        <header class="detail-team-head">
          <span class="team-state">{{ team.resultLabel }}</span>
          <span class="team-side">({{ sideLabel(team.teamId) }})</span>
          <span class="team-kda">{{ team.totalKills }} / {{ team.totalDeaths }} / {{ team.totalAssists }}</span>
          <span class="team-spacer"></span>
          <span v-if="team.teamElo" class="team-elo" title="ELO 评分">{{ team.teamElo }}</span>
        </header>
        <BattleDetailPlayer
          v-for="player in teamPlayers(team.players)"
          :key="player.openid"
          :player="player"
          :players="detail.player_details"
          :mode="currentMode"
          :hex-aram="isHexAram"
          :ranked="rankedQueue"
          :rank-info="rankOf(team.players, player, sortBy)"
          :is-self="canOpenPlayer && player.openid === viewedOpenid"
          @open-summoner="canOpenPlayer && $emit('openSummoner', $event)"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import GameIcon from "./GameIcon.vue";
import BattleDetailPlayer from "./BattleDetailPlayer.vue";
import { lolBattleApi } from "../api/client";
import { ApiError, toErrorMessage } from "../api/errors";
import { fetchMlolBattleDetail } from "../api/mlolDetail";
import { needsCaptcha, lastCaptchaAttempt } from "../api/captcha";
import type { BattleDetail, PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useAsyncData } from "../composables/useAsyncData";
import { useLoginAction } from "../composables/useLoginAction";
import { triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { getResultClass, getResultLabel } from "../const/wins";
import { formatDateTime, formatDuration } from "../utils/format";
import { getQueueName, isRankedQueue } from "../const/queues";

const diag = lastCaptchaAttempt;
/** 详情数据来源：wegame = 官方接口（含搜索定位后的重试），mlol = 掌盟公开数据 */
type DetailSource = "wegame" | "mlol";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  gameId: string | null;
  startTime?: number | string;
  /** 选中对局的队列 id（2400 = 海克斯大乱斗：无符文，行内直接显示海克斯强化） */
  queueId?: number | string;
  mode?: "概要" | "技能" | "伤害";
}>();

const isHexAram = computed(() => Number(props.queueId) === 2400);
/** 排位类队列：组队标签用「单排/双排」，其他模式用「单人/双人开黑」 */
const rankedQueue = computed(() => isRankedQueue(props.queueId ?? 0));

/** 模式页签内化到详情头部（左侧列表负责选比赛，右侧负责看详情） */
const MODES = ["概要", "伤害", "技能"] as const;
const currentMode = ref<(typeof MODES)[number]>(props.mode ?? "概要");
watch(() => props.mode, (m) => {
  if (m) currentMode.value = m;
});
const summaryMeta = computed(() => {
  const d = detail.value;
  if (!d) return "";
  const parts: string[] = [];
  const modeName = d.game_mode || queueNameById(d.game_queue_id);
  if (modeName) parts.push(modeName);
  const start = Number(d.game_start_time);
  if (Number.isFinite(start) && start > 0) parts.push(formatDateTime(start > 1e12 ? start : start * 1000));
  if (d.game_time_played) parts.push(formatDuration(d.game_time_played));
  return parts.join(" · ");
});
function decodedPlayerName(player: PlayerDetail | null): string {
  if (!player) return "";
  try { return decodeURIComponent(player.name || ""); } catch { return player.name || ""; }
}
/** 队伍阵营文案（team 100 = 蓝方） */
function sideLabel(teamId: string): string {
  return teamId === "100" ? "蓝方" : "红方";
}
function queueNameById(queueId: number): string {
  return getQueueName(Number(queueId)) || "";
}
function onSortChange(event: Event): void {
  sortBy.value = (event.target as HTMLSelectElement).value as SortKey;
}
type SortKey = "default" | "damage" | "taken" | "gold" | "participation";
const sortBy = ref<SortKey>("default");
function participationOf(p: PlayerDetail, teamKills: number): number {
  if (!teamKills) return 0;
  return (p.championsKilled + p.assists) / teamKills;
}
function teamKillCount(players: PlayerDetail[]): number {
  return players.reduce((sum, p) => sum + (p.championsKilled || 0), 0);
}
function sortPlayers(players: PlayerDetail[], key: SortKey): PlayerDetail[] {
  if (key === "default") return players;
  const teamKills = teamKillCount(players);
  const sorted = players.slice().sort((a, b) => {
    if (key === "damage") return (b.totalDamageToChampions || 0) - (a.totalDamageToChampions || 0);
    if (key === "taken") return (b.totalDamageTaken || 0) - (a.totalDamageTaken || 0);
    if (key === "gold") return (b.goldEarned || 0) - (a.goldEarned || 0);
    return participationOf(b, teamKills) - participationOf(a, teamKills);
  });
  return sorted;
}
/** 行内名次（排序时显示第 N 名 + 该项数值） */
function rankOf(players: PlayerDetail[], player: PlayerDetail, key: SortKey): { rank: number; label: string } | null {
  if (key === "default") return null;
  const teamKills = teamKillCount(players);
  const sorted = sortPlayers(players, key);
  const rank = sorted.indexOf(player) + 1;
  let label = "";
  if (key === "damage") label = (player.totalDamageToChampions || 0) + " 伤害";
  else if (key === "taken") label = (player.totalDamageTaken || 0) + " 承伤";
  else if (key === "gold") label = (player.goldEarned || 0) + " 经济";
  else label = "参团 " + Math.round(participationOf(player, teamKills) * 100) + "%";
  return { rank, label };
}
/** 排序后的队伍（模板用） */
function teamPlayers(players: PlayerDetail[]): PlayerDetail[] {
  return sortPlayers(players, sortBy.value);
}

defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const request = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  const trail: string[] = [];
  const codeOf = (error: unknown): string => {
    if (error instanceof ApiError) return String(error.code) + (error.serverMessage ? " " + error.serverMessage : "");
    return error instanceof Error ? error.message.slice(0, 40) : String(error);
  };

  try {
    // 首选：wegame 同源详情
    const result = await lolBattleApi.getBattleDetail(rq, String(props.gameId), { signal });
    return { ...result, source: "wegame" as DetailSource };
  } catch (error) {
    trail.push("wegame详情:" + codeOf(error));
    if (!(error instanceof ApiError) || signal.aborted) throw error;
    // 回退一：详情接口对 account_type=2+openid 的口径可能仍开放——
    // 用召唤师名字搜索自己的 openid，换口径重试（仅 self 场景）
    if (String(rq.account_type) === "1") {
      try {
        const summoner = await lolBattleApi.getSummonerInfo(rq, { signal });
        const players = await lolBattleApi.searchPlayer(summoner.name, { signal });
        const match = players.find((p) => Number(p.area) === Number(props.area));
        trail.push("搜索:" + (match ? "ok" : "无匹配"));
        if (match) {
          const found = await lolBattleApi.getBattleDetail(
            { ...rq, account_type: 2, id: match.openid },
            String(props.gameId),
            { signal }
          );
          return { ...found, source: "wegame" as DetailSource };
        }
      } catch (error) {
        trail.push("搜索:" + codeOf(error));
      }
    }
    // 回退二：掌盟公开详情（桥）
    try {
      const mlol = await fetchMlolBattleDetail({
        gameId: String(props.gameId),
        areaId: props.area,
        startTime: props.startTime
      }, signal);
      trail.push("掌盟:ok");
      if (mlol.player_details.length > 0) {
        const wrapped: GetBattleDetailLike = { battle_detail: mlol, openid: null, source: "mlol" };
        return wrapped;
      }
      trail.push("掌盟:空数据");
    } catch (error) {
      trail.push("掌盟:" + codeOf(error));
    }
    throw new ApiError("DETAIL_ALL_FAILED", "GetBattleDetail", "全部详情来源失败 [" + trail.join(" | ") + "]");
  }
});

interface GetBattleDetailLike {
  battle_detail: BattleDetail;
  openid: string | null;
  source: DetailSource;
}

const detail = computed<BattleDetail | null>(() => request.data.value?.battle_detail ?? null);
const selfOpenid = computed(() => request.data.value?.openid ?? null);
/** 掌盟数据源的玩家没有 wegame openid，点击跳转不可用 */
const canOpenPlayer = computed(() => selfOpenid.value !== null);
/** 当前查看玩家的 openid：优先详情返回的顶层 openid；搜索/收藏进入（account_type=2）时 id 就是 openid */
const viewedOpenid = computed<string | null>(() => {
  const fromDetail = selfOpenid.value ?? detail.value?.openid;
  if (fromDetail) return String(fromDetail);
  if (String(props.accountType) === "2" && props.id) return String(props.id);
  return null;
});
/** 当前查看的玩家：只认可靠的身份对应关系（openid 严格匹配）。匹配不到就不显示个人摘要，绝不猜队友 */
const viewedPlayer = computed<PlayerDetail | null>(() => {
  const current = detail.value;
  const openid = viewedOpenid.value;
  if (!current || !openid) return null;
  return current.player_details.find((player) => player.openid === openid) ?? null;
});
const viewedChampionId = computed(() => viewedPlayer.value?.championId ?? 0);
const loading = request.loading;
const error = request.error;
const run = request.run;

/** 当前详情数据来源（成功时才有） */
const detailSource = computed<DetailSource | null>(() => request.data.value?.source ?? null);
const sourceText = computed(() => (detailSource.value === "mlol" ? "掌盟公开数据" : "数据来源：WeGame"));
const sourceTitle = computed(() =>
  detailSource.value === "mlol"
    ? "WeGame 详情接口不可用时回退到掌盟公开数据，不含玩家 openid"
    : "数据来自 WeGame 战绩接口"
);

/** 失败原因分类：决定提示文案与可执行的操作 */
type DetailErrorKind = "captcha" | "auth" | "all-failed" | "unknown";
const errorKind = computed<DetailErrorKind | null>(() => {
  const err = error.value;
  if (!err) return null;
  if (err instanceof ApiError) {
    if (err.isUnauthenticated) return "auth";
    if (needsCaptcha(err.code)) return "captcha";
    if (String(err.code) === "DETAIL_ALL_FAILED") {
      // 所有来源都失败时，原错误码只保留在尝试轨迹里，据此还原可操作的原因
      const trailText = err.serverMessage || err.message;
      if (/8000022|8000120/.test(trailText)) return "captcha";
      if (trailText.includes("8000102")) return "auth";
      return "all-failed";
    }
  }
  return "unknown";
});
const errorHint = computed(() => {
  switch (errorKind.value) {
    case "captcha":
      return "需要完成人机验证：可先去 LOL 助手页查询一次，再回来重试";
    case "auth":
      return "登录状态已失效，请重新登录后再查看";
    case "all-failed":
      return "WeGame 与掌盟两个来源都没取到这场详情，稍后可重试";
    default:
      return "网络或接口异常，请稍后重试";
  }
});
/** 失败诊断：验证码留痕 + 各来源尝试轨迹（轨迹在错误 message 里） */
const debugText = computed(() => {
  const parts: string[] = [];
  if (diag.outcome && diag.outcome !== "从未尝试") parts.push("验证码：" + (diag.at || "") + " " + diag.outcome);
  const err = error.value;
  if (err instanceof ApiError && err.serverMessage) parts.push(err.serverMessage);
  if (parts.length === 0) parts.push(toErrorMessage(err ?? new Error("未知错误")));
  return parts.join("\n");
});

const { pending: loggingIn, run: loginAction } = useLoginAction();

function openHelper(): void {
  window.open("https://www.wegame.com.cn/helper/lol/", "_blank", "noopener");
}

function retryLogin(): void {
  void loginAction(async (signal) => {
    await triggerLogin({ signal });
    await waitForLogin({ signal });
    await run();
  });
}

watch(
  () => props.gameId,
  (gameId) => {
    if (gameId) void run();
  },
  { immediate: true }
);

const teams = computed(() => {
  const current = detail.value;
  if (!current) return [];
  return current.team_details.map((team) => ({
    teamId: team.teamId,
    totalKills: team.totalKills,
    totalDeaths: team.totalDeaths,
    totalAssists: team.totalAssists,
    teamElo: team.teamElo,
    resultClass: getResultClass(team.win),
    resultLabel: getResultLabel(team.win),
    players: current.player_details
      .filter((player) => player.teamId === team.teamId)
      .slice()
      .sort((a, b) => (b.teamMadeSize || 0) - (a.teamMadeSize || 0))
  }));
});

/** 当前查看玩家所在队伍（胜负标签反查），反查不到时摘要不显示胜负 */
const viewedTeam = computed(() => {
  const player = viewedPlayer.value;
  if (!player) return null;
  return teams.value.find((team) => team.players.some((item) => item.openid === player.openid)) ?? null;
});
</script>
