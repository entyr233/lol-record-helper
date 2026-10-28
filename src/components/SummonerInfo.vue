<template>
  <div class="summoner-info">
    <Panel title="玩家总览">
      <p v-if="hidden" class="hidden-tip">战绩已隐藏</p>
      <p v-else-if="authExpired" class="state-text state-text--error">
        登录状态已失效，请重新登录
        <button type="button" class="link-button" :disabled="loggingIn" @click="relogin">重新登录</button>
      </p>
      <p v-else-if="loading" class="state-text">加载中…</p>
      <p v-else-if="error" class="state-text state-text--error">
        {{ toErrorMessage(error) }}
        <button type="button" class="link-button" @click="reload">重试</button>
        <button v-if="needsCaptcha" type="button" class="link-button" @click="openHelper">去 LOL 助手页</button>
        <button v-if="authExpired" type="button" class="link-button" @click="relogin">立即登录</button>
      </p>
      <div v-else-if="summoner" class="summoner">
        <div class="summoner-identity">
          <GameIcon class="summoner-avatar" kind="user" :id="summoner.icon_id" />
          <div class="summoner-base">
            <p class="summoner-name">
              <span class="summoner-display-name">{{ summoner.name }}</span>
              <button type="button" class="copy-name" @click="copyName">{{ copied ? "已复制" : "复制昵称" }}</button>
              <button
                type="button"
                class="fav-star"
                :class="{ 'fav-star--on': isFavorite }"
                :title="isFavorite ? '取消收藏' : '收藏到首页'"
                :aria-label="isFavorite ? '取消收藏' : '收藏到首页'"
                @click="toggleFavorite"
              >
                <StarIcon :filled="isFavorite" />
              </button>
            </p>
            <p v-if="favoriteNotice" class="list-notice favorite-notice" role="status">{{ favoriteNotice }}</p>
            <p v-if="tierText" class="count-row count-row--tier">
              <span class="count-label">段位：</span>
              <span class="count-tier">{{ tierText }}</span>
            </p>
            <p class="summoner-line">{{ getAreaName(Number(area)) }} · 等级 {{ summoner.level }}</p>
          </div>
        </div>
        <div ref="kpiHost" class="summoner-kpis"></div>
        <div class="summoner-stats">
          <p class="summoner-stats-title">场次统计与资料 <span v-if="reportError" class="state-text--error">· 加载失败</span></p>
          <p class="summoner-line summoner-extra">经验 {{ summoner.experience }} · 赞 {{ summoner.praise }} · 黑 {{ summoner.discredit }}</p>
          <div class="summoner-stat-grid">
            <p v-if="reportLoading" class="summoner-report">统计加载中…</p>
            <p v-else-if="reportError" class="summoner-report summoner-report--error">
              统计加载失败：{{ toErrorMessage(reportError) }}
              <button type="button" class="link-button" @click="retryReport">重试统计</button>
            </p>
            <template v-else>
              <p v-for="row in countRows" :key="row.label" class="count-row count-row--stat">
                <span class="count-label">{{ row.label }}</span>
                <span class="count-total">{{ row.total }}</span>
                <span class="count-win">{{ row.win }}</span>
                <span class="count-lose">{{ row.lose }}</span>
                <span class="count-rate">{{ rateOf(row) }}% 胜率</span>
              </p>
            </template>
          </div>
        </div>
      </div>
      <div class="summoner-recent">
        <RecentStats ref="recentRef" :area="area" :account-type="accountType" :id="id" :active-champion="activeChampion"
          :active-game-id="activeGameId" :mode="activeMode" :days="activeDays" :kpi-target="kpiHost"
          @focus-game="(g: BattleSummary) => emit('focusGame', g)" @filter-champion="(id: number | null) => emit('filterChampion', id)"
          @mode-change="(mode: ModeFilter) => emit('modeChange', mode)" />
      </div>
      <p v-if="loginError" class="state-text state-text--error" role="alert">{{ loginError }}</p>
      <button v-if="loggingIn" type="button" class="link-button" @click="cancel">取消等待</button>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Panel from "./Panel.vue";
import GameIcon from "./GameIcon.vue";
import StarIcon from "./StarIcon.vue";
import RecentStats from "./RecentStats.vue";
import { lolBattleApi } from "../api/client";
import type { BattleSummary } from "../api/types";
import { ApiError, toErrorMessage } from "../api/errors";
import { useAsyncData } from "../composables/useAsyncData";
import { toPlayerQueryParams } from "../composables/usePlayerParams";
import { triggerLogin, waitForLogin } from "../utils/wegameLogin";
import { useLoginAction } from "../composables/useLoginAction";
import { MAX_FAVORITES, favoriteKey, useFavorites } from "../composables/useFavorites";
import { useRecentPlayers } from "../composables/useRecentPlayers";
import { tierLabel, tierOrder } from "../const/tiers";
import { getAreaName } from "../const/areas";
import type { BattleRefreshOptions } from "../composables/useBattleFeed";
import type { ModeFilter } from "../const/modes";
import type { DaysFilter } from "../composables/useBattleList";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  activeChampion?: number | null;
  activeGameId?: string | null;
  /** 与列表共享的模式筛选（透传给近期表现） */
  activeMode?: ModeFilter;
  /** 与列表共享的时间范围（透传给近期表现） */
  activeDays?: DaysFilter;
}>();

const emit = defineEmits<{
  focusGame: [game: BattleSummary];
  filterChampion: [id: number | null];
  modeChange: [mode: ModeFilter];
}>();

const { isFavorite: isFavoriteEntry, toggle: toggleFavoriteEntry, update: updateFavoriteEntry } = useFavorites();
const { remember: rememberRecentPlayer } = useRecentPlayers();
const favoriteTarget = computed(() => ({ area: props.area, accountType: props.accountType, id: props.id }));
const isFavorite = computed(() => isFavoriteEntry(favoriteTarget.value));
const favoriteNotice = ref("");

function toggleFavorite(): void {
  const result = toggleFavoriteEntry({
    name: summoner.value?.name ?? props.id,
    area: Number(props.area) || 0,
    accountType: props.accountType,
    id: props.id,
    level: summoner.value?.level
  });
  favoriteNotice.value = result === "full"
    ? `收藏已满（${MAX_FAVORITES} 位），请先在「管理收藏」中清理`
    : "";
}

const { pending: loggingIn, loginError, run, cancel } = useLoginAction();

const playerParams = computed(() => toPlayerQueryParams({ area: props.area, accountType: props.accountType, id: props.id }));

const summonerTask = useAsyncData((signal) => lolBattleApi.getSummonerInfo(playerParams.value, { signal }));
const reportTask = useAsyncData((signal) => lolBattleApi.getBattleReport(playerParams.value, { signal }));

const summoner = computed(() => summonerTask.data.value);
const counts = computed(() => reportTask.data.value);
const loading = computed(() => summonerTask.loading.value);
const error = computed(() => summonerTask.error.value);
const reportLoading = computed(() => reportTask.loading.value);
const reportError = computed(() => reportTask.error.value);
const hidden = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.isHidden;
});
const needsCaptcha = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.needsCaptcha;
});
const copied = ref(false);
const kpiHost = ref<HTMLElement | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copyName(): Promise<void> {
  const name = summoner.value?.name;
  if (!name) return;
  try {
    await navigator.clipboard.writeText(name);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 1500);
  } catch { /* 剪贴板不可用时静默 */ }
}

const authExpired = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.isUnauthenticated;
});

/** 段位：summoner.season 优先（现任接口随资料返回），season_list 兜底（数字越小段位越高） */
const tierText = computed(() => {
  const candidates: Array<{ tier?: number; win_point?: number | string; queue?: number }> = [];
  const ownSeason = summoner.value?.season;
  if (ownSeason && ownSeason.tier !== undefined) candidates.push({ tier: ownSeason.tier, win_point: ownSeason.win_point, queue: ownSeason.queue });
  for (const entry of counts.value?.season_list ?? []) candidates.push({ tier: entry.tier, win_point: entry.win_point, queue: Number(entry.queue) || 0 });
  if (candidates.length === 0) return "";
  const best = candidates.slice().sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier))[0];
  const label = tierLabel(best.tier, (best as { queue?: number }).queue);
  if (label === "未定级") return label;
  const lp = best.win_point !== undefined && best.win_point !== "" ? " · " + best.win_point + " LP" : "";
  return label + lp;
});

/** 资料加载成功后：写入最近查看，并刷新已收藏玩家的昵称/等级/段位。 */
watch(summoner, (value) => {
  if (!value) return;
  rememberRecentPlayer({
    name: value.name,
    area: Number(props.area) || 0,
    accountType: props.accountType,
    id: props.id
  });
  if (!isFavoriteEntry(favoriteTarget.value)) return;
  updateFavoriteEntry(favoriteKey(favoriteTarget.value), {
    name: value.name,
    level: value.level,
    lastRank: tierText.value,
    lastSeenAt: Date.now()
  });
});

watch(tierText, (value) => {
  if (!summoner.value || !isFavoriteEntry(favoriteTarget.value)) return;
  updateFavoriteEntry(favoriteKey(favoriteTarget.value), { lastRank: value });
});

/** 修正旧版「匹配/排位」标签取反的问题：match = 匹配, rank = 排位 */
const countRows = computed(() => {
  const value = counts.value;
  if (!value) return [];
  return [
    { label: "所有对局", total: value.total_games, win: value.total_wins, lose: value.total_losts },
    { label: "大乱斗", total: value.total_arm_games, win: value.total_arm_wins, lose: value.total_arm_losts },
    { label: "匹配", total: value.total_match_games, win: value.total_match_wins, lose: value.total_match_losts },
    { label: "排位", total: value.total_rank_games, win: value.total_rank_wins, lose: value.total_rank_losts }
  ];
});

/** 各分类胜率：分母用「胜+负」，与近期表现的口径一致 */
function rateOf(row: { win: number; lose: number }): number {
  const decided = row.win + row.lose;
  return decided ? Math.round((row.win / decided) * 100) : 0;
}

function reload(): void {
  void summonerTask.run();
  void reportTask.run();
}

function retryReport(): void {
  void reportTask.run();
}

function openHelper(): void {
  window.open("https://www.wegame.com.cn/helper/lol/", "_blank", "noopener");
}

function relogin(): Promise<void> {
  return run(async (signal) => {
    await triggerLogin({ signal });
    await waitForLogin({ signal });
    if (!signal.aborted) reload();
  });
}

onMounted(() => {
  void summonerTask.run();
  void reportTask.run();
});

/** 近期表现的刷新句柄（与“刷新战绩”按钮联动） */
const recentRef = ref<InstanceType<typeof RecentStats> | null>(null);

/** 主动刷新：召唤师资料 + 场次统计 + 近期表现一起更新 */
defineExpose({
  refresh: async (options?: BattleRefreshOptions): Promise<string[]> => {
    const [, , recentSucceeded] = await Promise.all([summonerTask.run(), reportTask.run(), recentRef.value?.reload(options)]);
    const failures: string[] = [];
    if (summonerTask.error.value) failures.push("召唤师资料");
    if (reportTask.error.value) failures.push("场次统计");
    if (recentSucceeded === false) failures.push("近期表现");
    return failures;
  }
});
</script>
