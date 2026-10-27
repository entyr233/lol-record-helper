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
          :partial="detailSource === 'mlol'"
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
import { toErrorMessage } from "../api/errors";
import type { PlayerDetail } from "../api/types";
import { useBattleDetail } from "../composables/useBattleDetail";
import { getResultClass, getResultLabel } from "../const/wins";
import { formatDateTime, formatDuration } from "../utils/format";
import { getQueueName, isRankedQueue } from "../const/queues";

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

// 取数/多来源回退/来源与错误分类都在 composable 里，组件只保留展示与排序
const {
  detail,
  loading,
  error,
  run,
  detailSource,
  sourceText,
  sourceTitle,
  errorKind,
  errorHint,
  debugText,
  loggingIn,
  retryLogin,
  openHelper,
  canOpenPlayer,
  selfOpenid
} = useBattleDetail({ props });

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
