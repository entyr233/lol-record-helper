<template>
  <div class="battle-detail">
    <p v-if="loading" class="state-text">加载对局详情…</p>
    <div v-else-if="error" class="state-text state-text--error">
      {{ toErrorMessage(error) }}
      <span class="detail-diag">（验证码：{{ diag.outcome }}）</span>
      <button type="button" class="link-button" @click="run">重试</button>
    </div>
    <template v-else-if="detail">
      <div class="detail-summary">
        <GameIcon v-if="viewedPlayer" kind="champion" :id="viewedChampionId" />
        <span v-if="viewedTeam" class="detail-summary-result" :class="'detail-summary-result--' + viewedTeam.resultClass">{{ viewedTeam.resultLabel }}</span>
        <span v-if="viewedPlayer" class="detail-summary-name">{{ decodedPlayerName(viewedPlayer) }}</span>
        <span class="detail-summary-meta">{{ summaryMeta }}</span>
      </div>
      <div class="detail-toolbar">
        <div class="mode-switch">
          <button v-for="m in visibleModes" :key="m" type="button" class="mode-button" :class="{ active: currentMode === m }" @click="currentMode = m">{{ m }}</button>
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
          <span class="team-side">({{ team.teamId === "100" ? "蓝方" : "红方" }})</span>
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
import { lastCaptchaAttempt } from "../api/captcha";
import type { BattleDetail, PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useAsyncData } from "../composables/useAsyncData";
import { getResultClass, getResultLabel } from "../const/wins";
import { formatDateTime, formatDuration } from "../utils/format";
import { getQueueName } from "../const/queues";

const diag = lastCaptchaAttempt;

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  gameId: string | null;
  startTime?: number | string;
  /** 选中对局的队列 id（2400 = 海克斯大乱斗：无符文，有海克斯强化） */
  queueId?: number | string;
  mode?: "概要" | "技能" | "伤害" | "海克斯";
}>();

const isHexAram = computed(() => Number(props.queueId) === 2400);

/** 模式页签内化到详情头部（左侧列表负责选比赛，右侧负责看详情） */
const MODES = ["概要", "伤害", "技能", "海克斯"] as const;
const currentMode = ref<(typeof MODES)[number]>(props.mode ?? "概要");
watch(() => props.mode, (m) => { if (m) currentMode.value = m; });

const visibleModes = computed(() => MODES.filter((m) => m !== "海克斯" || isHexAram.value));
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
    return result;
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
          return await lolBattleApi.getBattleDetail(
            { ...rq, account_type: 2, id: match.openid },
            String(props.gameId),
            { signal }
          );
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
        const wrapped: GetBattleDetailLike = { battle_detail: mlol, openid: null };
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
/** 当前查看的玩家：先按 openid 严格匹配；掌盟类数据源没有顶层 openid 时回退为 team_details[0] 队伍的第一名玩家 */
const viewedPlayer = computed<PlayerDetail | null>(() => {
  const current = detail.value;
  if (!current) return null;
  const viewed = viewedOpenid.value
    ? current.player_details.find((player) => player.openid === viewedOpenid.value) ?? null
    : null;
  if (viewed) return viewed;
  // 详情带顶层 openid 却匹配不到：身份不可信，不猜
  if (selfOpenid.value !== null) return null;
  // 掌盟源玩家 openid 是 puuid/uuid，与 wegame openid 对不上，按 my_team（team_details[0]）兜底
  const firstTeam = current.team_details[0];
  if (!firstTeam) return null;
  return current.player_details.find((player) => player.teamId === firstTeam.teamId) ?? null;
});
const viewedChampionId = computed(() => viewedPlayer.value?.championId ?? 0);
const loading = request.loading;
const error = request.error;
const run = request.run;

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
