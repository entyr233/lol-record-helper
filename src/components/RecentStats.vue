<template>
  <div v-if="games.length" class="recent-stats">
    <div class="recent-headline">
      <span class="recent-title">{{ titleText }}</span>
      <span v-if="remakes" class="recent-remake">重开 {{ remakes }} 场，不计入胜率</span>
    </div>
    <div v-if="mode === undefined" class="mode-filter recent-modes" role="group" aria-label="选择统计模式">
      <button v-for="option in MODE_OPTIONS" :key="String(option.key)" type="button"
        class="mode-filter-tab" :class="{ 'mode-filter-tab--cur': selectedMode === option.key }"
        :aria-pressed="selectedMode === option.key"
        @click="selectMode(option.key)">{{ option.label }}</button>
    </div>
    <Teleport v-if="sample.length && kpiTarget" :to="kpiTarget">
      <RecentKpis
        :win-rate="winRate"
        :avg-kda="avgKda"
        :wins="wins"
        :losses="losses"
        :streak="streak"
        :first-is-lose="firstIsLose"
        :title-text="titleText"
      />
    </Teleport>
    <RecentKpis
      v-else-if="sample.length"
      :win-rate="winRate"
      :avg-kda="avgKda"
      :wins="wins"
      :losses="losses"
      :streak="streak"
      :first-is-lose="firstIsLose"
      :title-text="titleText"
    />
    <p v-else class="recent-empty">
      {{ emptyText }}
      <button v-if="selectedMode !== 'all'" type="button" class="link-button" @click="selectMode('all')">查看全部模式</button>
    </p>
    <div v-if="sample.length" class="recent-expanded">
      <div class="recent-strip-wrap">
        <span class="strip-end">最早 {{ stripOldestLabel }}</span>
        <div class="recent-strip" :title="stripTitle">
          <button v-for="(g, index) in recentGames" :key="g.game_id" type="button"
            class="strip-block strip-block--btn" :class="{ 'strip-block--cur': g.game_id === activeGameId }"
            :aria-pressed="g.game_id === activeGameId" :aria-label="stripAriaLabel(g, index)" :title="stripBlockTitle(g, index)"
            @click="$emit('focusGame', g)">
            <span class="strip-bar" :class="'strip-bar--' + classifyBattle(g)"></span>
          </button>
        </div>
        <span class="strip-end">最新 {{ stripNewestLabel }}</span>
      </div>
      <div class="recent-analysis-grid">
        <div v-if="trend.length" class="recent-side" :title="trendTitle">
          <p class="recent-side-title">胜率趋势（累计）</p>
          <div class="recent-trend">
            <span class="recent-trend-chart">
              <svg width="196" height="46" viewBox="0 0 196 46" aria-hidden="true">
                <line x1="4" y1="24" x2="192" y2="24" class="trend-baseline" />
                <polyline class="trend-line" :points="trendPoints" />
                <circle v-for="point in trend" :key="point.key" class="trend-dot" :cx="point.x" :cy="point.y" r="1.9">
                  <title>{{ trendPointTitle(point) }}</title>
                </circle>
              </svg>
            </span>
          </div>
          <span class="recent-trend-dates">{{ trendFirstLabel }} → {{ trendLastLabel }}</span>
        </div>
        <div v-if="queueStats.length" class="recent-queues">
          <p class="recent-queues-title">模式分布</p>
          <div v-for="q in queueStats" :key="q.id" class="recent-queue-row">
            <span class="recent-queue-name">{{ q.label }}</span>
            <span class="recent-queue-track">
              <span class="recent-queue-fill" :style="{ width: q.percent + '%' }"></span>
            </span>
            <span class="recent-queue-count">{{ q.count }} 场</span>
          </div>
        </div>
        <div class="recent-champs">
          <span class="recent-champs-label">常用英雄（点击筛选）</span>
          <button v-for="c in topChampions" :key="c.id" type="button" class="recent-champ"
            :title="c.count + '场 ' + c.wins + '胜 · 点击筛选该英雄战绩'"
            @click="$emit('filterChampion', c.id)">
            <GameIcon kind="champion" :id="c.id" />
            <span class="recent-champ-meta">{{ c.count }}场 {{ c.wins }}胜</span>
          </button>
          <button v-if="activeChampion" type="button" class="recent-champ-filter-clear" @click="$emit('filterChampion', null)">
            清除筛选：{{ championName(activeChampion) }} ×
          </button>
        </div>
        <div v-if="teamStats.length" class="recent-teams">
          <p class="recent-teams-title">组队情况</p>
          <div v-for="item in teamStats" :key="item.id" class="recent-queue-row">
            <span class="recent-queue-name">{{ item.label }}</span>
            <span class="recent-queue-track">
              <span class="recent-queue-fill" :style="{ width: item.percent + '%' }"></span>
            </span>
            <span class="recent-queue-count">{{ item.count }} 场</span>
          </div>
        </div>
        <div class="recent-metrics">
          <p class="recent-metrics-title">近 {{ sample.length }} 场场均</p>
          <div class="recent-metrics-grid">
            <span class="recent-metric"><b>{{ avgKills }}</b>场均击杀</span>
            <span class="recent-metric"><b>{{ avgDeaths }}</b>场均死亡</span>
            <span class="recent-metric"><b>{{ avgAssists }}</b>场均助攻</span>
            <span class="recent-metric"><b>{{ honorCount }}</b>MVP/SVP</span>
            <span class="recent-metric"><b>{{ avgDuration }}</b>平均时长</span>
            <span class="recent-metric"><b>{{ pentaCount }}</b>五杀</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <p v-if="taskError" class="state-text state-text--error recent-error" title="数据来源：WeGame 战绩接口" role="alert">
    <span v-if="games.length">刷新失败，当前展示上次数据：</span>
    {{ toErrorMessage(taskError) }}
    <button type="button" class="link-button" @click="reload()">重试</button>
  </p>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import GameIcon from "./GameIcon.vue";
import RecentKpis from "./RecentKpis.vue";
import { useAsyncData } from "../composables/useAsyncData";
import { toErrorMessage } from "../api/errors";
import { championName, ensureChampionNames } from "../api/staticData";
import type { BattleSummary } from "../api/types";
import { battleResultLabel, classifyBattle } from "../const/wins";
import { matchesBattleMode, MODE_FILTER_OPTIONS, type ModeFilter } from "../const/modes";
import type { DaysFilter } from "../composables/useBattleList";
import { useBattleFeed, type BattleRefreshOptions } from "../composables/useBattleFeed";
import { summarizeRecentBattles } from "../utils/recentStats";
import type { RecentTrendPoint } from "../utils/recentStats";
import { formatBattleDate } from "../utils/format";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  activeChampion?: number | null;
  activeGameId?: string | null;
  /** 与对局列表共享的模式筛选（受控；不传时组件内部自管） */
  mode?: ModeFilter;
  /** 与对局列表共享的时间范围：0 / 7 / 30 天 */
  days?: DaysFilter;
  /** 由父级提供的 KPI 投放位置；为空时留在原组件内（便于独立使用/测试）。 */
  kpiTarget?: HTMLElement | null;
}>();
const emit = defineEmits<{
  focusGame: [game: BattleSummary];
  filterChampion: [id: number | null];
  modeChange: [mode: ModeFilter];
}>();

const MODE_OPTIONS = MODE_FILTER_OPTIONS;
/** 展示/统计窗口：最近多少场（指定模式同样截断到这么多场） */
const RECENT_WINDOW = 20;
/** 全部模式只取最近 20 场（1 页 10 场） */
const ALL_MODE_PAGES = 2;
/** 指定模式最多回看多少页（60 场），尽量凑够样本 */
const MODE_PAGES_MAX = 6;
/** 指定模式的目标样本量 */
const MODE_SAMPLE_TARGET = 10;
const DAY_MS = 86400000;

/** 受控 prop 优先；父组件没接管时用内部状态，便于单独使用/测试 */
const internalMode = ref<ModeFilter>(props.mode ?? "all");
const selectedMode = computed<ModeFilter>(() => props.mode ?? internalMode.value);
const selectedDays = computed<DaysFilter>(() => props.days ?? 0);
/** 与对局列表共享同一份「当前玩家」的原始战绩页缓存与在途请求（键区分大区/账号类型/玩家） */
const feed = useBattleFeed(() => ({
  area: String(props.area),
  accountType: String(props.accountType),
  id: String(props.id)
}));

function withinDays(b: BattleSummary, days: DaysFilter): boolean {
  if (!days) return true;
  const start = Number(b.game_start_time);
  if (!Number.isFinite(start) || start <= 0) return true;
  return start >= Date.now() - days * DAY_MS;
}

function matchesSample(b: BattleSummary, mode: ModeFilter, days: DaysFilter): boolean {
  return matchesBattleMode(b, mode) && withinDays(b, days);
}

const task = useAsyncData(async (signal) => {
  const mode = selectedMode.value;
  const days = selectedDays.value;
  // 全部模式且不限时间：只取最近 20 场；否则扩大回看范围以凑够样本
  const windowed = mode === "all" && !days;
  const maxPages = windowed ? ALL_MODE_PAGES : MODE_PAGES_MAX;
  const target = windowed ? RECENT_WINDOW : MODE_SAMPLE_TARGET;
  const collected: BattleSummary[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (signal.aborted) break;
    // 原始页与列表共用：命中共享缓存时不会再发请求
    const page = await feed.getPage(pageIndex, { signal });
    collected.push(...page.data);
    if (!page.hasMore) break;
    if (collected.filter((item) => matchesSample(item, mode, days)).length >= target) break;
  }
  return collected;
});

onMounted(() => {
  void ensureChampionNames();
  void task.run();
});

// 模式和时间范围生效后再读取数据，父页面与组件内部的操作共用同一入口。
watch([selectedMode, selectedDays], () => { void task.run(); });

const taskError = task.error;
const games = computed(() => task.data.value ?? []);
/** 当前模式 + 时间范围下的样本（最近 RECENT_WINDOW 场以内的匹配对局） */
const sample = computed(() => {
  const mode = selectedMode.value;
  const days = selectedDays.value;
  const list = mode === "all" && !days ? games.value : games.value.filter((item) => matchesSample(item, mode, days));
  return list.slice(0, RECENT_WINDOW);
});
const modeLabel = computed(() => MODE_OPTIONS.find((option) => option.key === selectedMode.value)?.label ?? "全部");
const daysLabel = computed(() => (selectedDays.value ? "近 " + selectedDays.value + " 天" : ""));
const titleText = computed(() => {
  const scope = selectedMode.value === "all" ? "全部模式" : modeLabel.value;
  const range = daysLabel.value ? " · " + daysLabel.value : "";
  if (scope === "全部模式" && !range) return "全部模式 · 最近 " + sample.value.length + " 场";
  return scope + range + " · 最近 " + games.value.length + " 场中 " + sample.value.length + " 场";
});
const emptyText = computed(() => {
  const scope = selectedMode.value === "all" ? "全部模式" : modeLabel.value;
  const range = daysLabel.value ? " · " + daysLabel.value : "";
  return scope + range + "：最近 " + games.value.length + " 场里没有符合条件的对局";
});

/** 父页面提供模式时由父页面更新参数；独立使用时更新内部模式。 */
function selectMode(mode: ModeFilter): void {
  if (selectedMode.value === mode) return;
  if (props.mode === undefined) internalMode.value = mode;
  emit("modeChange", mode);
}

/** 统计与趋势统一由纯函数模块计算，组件只负责展示与交互 */
const stats = computed(() => summarizeRecentBattles(sample.value));
const wins = computed(() => stats.value.wins);
const losses = computed(() => stats.value.losses);
const remakes = computed(() => stats.value.remakes);
const winRate = computed(() => stats.value.winRate);
const avgKda = computed(() => stats.value.avgKda);
const avgKills = computed(() => stats.value.averages.kills);
const avgDeaths = computed(() => stats.value.averages.deaths);
const avgAssists = computed(() => stats.value.averages.assists);
const avgDuration = computed(() => stats.value.averages.duration);
const honorCount = computed(() => stats.value.honorCount);
const pentaCount = computed(() => stats.value.pentaCount);
const queueStats = computed(() => stats.value.queues);
const teamStats = computed(() => stats.value.teams);
const topChampions = computed(() => stats.value.champions);
const firstIsLose = computed(() => stats.value.streak.lose);
const streak = computed(() => {
  const state = stats.value.streak;
  if (state.count < 2) return "";
  return state.count + (state.lose ? "连败" : "连胜");
});
/** 色块顺序：由远到近（左旧右新），与文案“从左到右：由远到近”一致 */
const recentGames = computed(() => sample.value.slice().reverse());
/** 走势色块两端的时间标签：左=最早，右=最新 */
const stripOldestLabel = computed(() => formatBattleDate(recentGames.value[0]?.game_start_time));
const stripNewestLabel = computed(() => {
  const list = recentGames.value;
  return formatBattleDate(list[list.length - 1]?.game_start_time);
});
const stripTitle = computed(() => {
  const remakeText = remakes.value ? "，重开 " + remakes.value : "";
  return "从左到右：由远到近（" + wins.value + "胜" + losses.value + "负" + remakeText + "），点击色块定位对局";
});
function stripBlockTitle(g: BattleSummary, index: number): string {
  return recentGames.value.length - index + "：" + battleResultLabel(g) + " · 点击定位";
}
function stripAriaLabel(g: BattleSummary, index: number): string {
  const current = g.game_id === props.activeGameId ? "（当前查看）" : "";
  return "第" + (recentGames.value.length - index) + "场 " + battleResultLabel(g) + current + "，点击定位";
}
/** 累计胜率趋势（纯函数模块计算坐标，组件只负责绘制） */
const trend = computed(() => stats.value.trend.points);
const trendPoints = computed(() => stats.value.trend.pointsAttr);
const trendFirstLabel = computed(() => stats.value.trend.firstLabel);
const trendLastLabel = computed(() => stats.value.trend.lastLabel);
const trendTitle = computed(() => "胜率趋势：最近 " + trend.value.length + " 场累计胜率（左旧右新）");
function trendPointTitle(point: RecentTrendPoint): string {
  return point.label + " · 累计 " + point.winRate + "% 胜率";
}

/** 主动刷新（“刷新战绩”按钮联动）：清共享页缓存后按当前模式重新统计 */
async function reload({ invalidate = true }: BattleRefreshOptions = {}): Promise<boolean> {
  if (invalidate) feed.invalidate();
  await task.run();
  return task.error.value === null;
}
defineExpose({ reload });
</script>
