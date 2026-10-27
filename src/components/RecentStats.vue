<template>
  <div v-if="games.length" class="recent-stats">
    <div class="recent-main">
      <div class="recent-headline">
        <span class="recent-title">{{ titleText }}</span>
        <template v-if="sample.length">
          <span class="recent-wl"><b class="w">{{ wins }}</b>胜<b class="l">{{ losses }}</b>负</span>
          <span v-if="remakes" class="recent-remake">（重开 {{ remakes }}）</span>
          <span class="recent-wr" :title="'胜率 = 胜 /（胜 + 负），重开不计入分母'">{{ winRate }}% 胜率</span>
          <span class="recent-kda" :title="'KDA =（击杀 + 助攻）/ 死亡；样本：' + titleText">{{ avgKda }} KDA</span>
          <span v-if="streak" class="recent-streak" :class="{ 'recent-streak--lose': firstIsLose }">{{ streak }}</span>
        </template>
      </div>
      <div class="mode-filter recent-modes" role="group" aria-label="选择统计模式">
        <button v-for="option in MODE_OPTIONS" :key="String(option.key)" type="button"
          class="mode-filter-tab" :class="{ 'mode-filter-tab--cur': selectedMode === option.key }"
          :aria-pressed="selectedMode === option.key"
          @click="selectMode(option.key)">{{ option.label }}</button>
      </div>
      <template v-if="sample.length">
        <div class="recent-strip" :title="stripTitle">
          <button v-for="(g, index) in recentGames" :key="g.game_id" type="button"
            class="strip-block strip-block--btn" :class="{ 'strip-block--cur': g.game_id === activeGameId }"
            :aria-pressed="g.game_id === activeGameId" :aria-label="stripAriaLabel(g, index)" :title="stripBlockTitle(g, index)"
            @click="$emit('focusGame', g)">
            <span class="strip-bar" :class="'strip-bar--' + classifyBattle(g)"></span>
          </button>
        </div>
        <div class="recent-bottom">
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
      </template>
      <p v-else class="recent-empty">{{ emptyText }}</p>
    </div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import GameIcon from "./GameIcon.vue";
import { useAsyncData } from "../composables/useAsyncData";
import { toRqOptions } from "../composables/useUserInfo";
import { lolBattleApi } from "../api/client";
import { championName, ensureChampionNames } from "../api/staticData";
import type { BattleSummary } from "../api/types";
import { battleResultLabel, classifyBattle } from "../const/wins";
import { MODE_FILTER_OPTIONS, type ModeFilter } from "../const/modes";
import type { DaysFilter } from "../composables/useBattleList";

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
/** 原始页缓存：切换模式时只补拉缺少的页，不重复请求 */
const pageCache = new Map<number, BattleSummary[]>();

function matchesMode(b: BattleSummary, mode: ModeFilter): boolean {
  if (mode === "all") return true;
  if (mode === "mvp") return Number(b.was_mvp) === 1 || Number(b.was_svp) === 1;
  return Number(b.game_queue_id) === Number(mode);
}

function withinDays(b: BattleSummary, days: DaysFilter): boolean {
  if (!days) return true;
  const start = Number(b.game_start_time);
  if (!Number.isFinite(start) || start <= 0) return true;
  return start >= Date.now() - days * DAY_MS;
}

function matchesSample(b: BattleSummary, mode: ModeFilter, days: DaysFilter): boolean {
  return matchesMode(b, mode) && withinDays(b, days);
}

const task = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  const mode = selectedMode.value;
  const days = selectedDays.value;
  // 全部模式且不限时间：只取最近 20 场；否则扩大回看范围以凑够样本
  const windowed = mode === "all" && !days;
  const maxPages = windowed ? ALL_MODE_PAGES : MODE_PAGES_MAX;
  const target = windowed ? RECENT_WINDOW : MODE_SAMPLE_TARGET;
  const collected: BattleSummary[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (signal.aborted) break;
    let items = pageCache.get(pageIndex);
    if (!items) {
      items = await lolBattleApi.getBattleList(rq, { count: 10, offset: pageIndex * 10 }, { signal });
      pageCache.set(pageIndex, items);
    }
    collected.push(...items);
    if (items.length < 10) break;
    if (collected.filter((item) => matchesSample(item, mode, days)).length >= target) break;
  }
  return collected;
});

onMounted(() => {
  void ensureChampionNames();
  void task.run();
});

// 父组件（与列表联动）改模式/时间范围时同步刷新统计
watch(
  () => props.mode,
  (value) => {
    if (value === undefined || value === internalMode.value) return;
    internalMode.value = value;
    void task.run();
  }
);
watch(
  () => props.days,
  () => { void task.run(); }
);

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

/** 切换模式：通知外部（若受控），并优先复用已缓存的原始页、只补拉缺少的部分 */
function selectMode(mode: ModeFilter): void {
  if (selectedMode.value === mode) return;
  internalMode.value = mode;
  emit("modeChange", mode);
  void task.run();
}

/** 三分类计数：重开单列，不计入胜率分母 */
const resultCounts = computed(() => {
  let winCount = 0;
  let loseCount = 0;
  let remakeCount = 0;
  for (const g of sample.value) {
    const result = classifyBattle(g);
    if (result === "win") winCount += 1;
    else if (result === "lose") loseCount += 1;
    else remakeCount += 1;
  }
  return { winCount, loseCount, remakeCount };
});
const wins = computed(() => resultCounts.value.winCount);
const losses = computed(() => resultCounts.value.loseCount);
const remakes = computed(() => resultCounts.value.remakeCount);
const winRate = computed(() => {
  const total = wins.value + losses.value;
  return total ? Math.round((wins.value / total) * 100) : 0;
});
const avgKda = computed(() => {
  const totals = sample.value.reduce(
    (acc, g) => ({ k: acc.k + (g.kills ?? 0), d: acc.d + (g.deaths ?? 0), a: acc.a + (g.assists ?? 0) }),
    { k: 0, d: 0, a: 0 }
  );
  if (!totals.d && !totals.k) return "0.00";
  return ((totals.k + totals.a) / Math.max(1, totals.d)).toFixed(2);
});
/** 场均击杀/死亡/助攻 + 荣誉/时长等摘要，填住近期表现下方原本的空区 */
const sampleAverages = computed(() => {
  const size = sample.value.length;
  if (!size) return { kills: "0.0", deaths: "0.0", assists: "0.0" };
  const totals = sample.value.reduce(
    (acc, g) => ({ k: acc.k + (g.kills ?? 0), d: acc.d + (g.deaths ?? 0), a: acc.a + (g.assists ?? 0) }),
    { k: 0, d: 0, a: 0 }
  );
  const round = (value: number) => (value / size).toFixed(1);
  return { kills: round(totals.k), deaths: round(totals.d), assists: round(totals.a) };
});
const avgKills = computed(() => sampleAverages.value.kills);
const avgDeaths = computed(() => sampleAverages.value.deaths);
const avgAssists = computed(() => sampleAverages.value.assists);
const honorCount = computed(
  () => sample.value.filter((g) => Number(g.was_mvp) === 1 || Number(g.was_svp) === 1).length
);
const pentaCount = computed(() => sample.value.reduce((sum, g) => sum + Number(g.penta_kills ?? 0), 0));
/** 平均时长：秒 → m:ss */
const avgDuration = computed(() => {
  const size = sample.value.length;
  if (!size) return "0:00";
  const total = sample.value.reduce((sum, g) => sum + Number(g.game_time_played ?? 0), 0);
  const seconds = Math.round(total / size);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
});
/** 连胜连败：跳过重开取第一场非重开结果，之后连续相同结果计数（重开不打断） */
const streakState = computed(() => {
  const list = sample.value;
  const firstIndex = list.findIndex((g) => classifyBattle(g) !== "remake");
  if (firstIndex < 0) return { count: 0, lose: false };
  const first = classifyBattle(list[firstIndex]);
  let count = 0;
  for (let i = firstIndex; i < list.length; i += 1) {
    const result = classifyBattle(list[i]);
    if (result === "remake") continue;
    if (result !== first) break;
    count += 1;
  }
  return { count, lose: first === "lose" };
});
const firstIsLose = computed(() => streakState.value.lose);
const streak = computed(() => {
  const state = streakState.value;
  if (state.count < 2) return "";
  return state.count + (state.lose ? "连败" : "连胜");
});
/** 色块顺序：由远到近（左旧右新），与文案“从左到右：由远到近”一致 */
const recentGames = computed(() => sample.value.slice().reverse());
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
const topChampions = computed(() => {
  const byId = new Map<number, { id: number; count: number; wins: number }>();
  for (const g of sample.value) {
    const entry = byId.get(g.champion_id) ?? { id: g.champion_id, count: 0, wins: 0 };
    entry.count += 1;
    if (classifyBattle(g) === "win") entry.wins += 1;
    byId.set(g.champion_id, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, 5);
});

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

interface TrendPoint {
  key: string;
  label: string;
  winRate: number;
  x: number;
  y: number;
}

const TREND_WIDTH = 196;
const TREND_PADDING = 4;

function dateLabelOf(g: BattleSummary): string {
  const ts = Number(g.game_start_time);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
}

/**
 * 累计胜率趋势：按时间从旧到新逐场累计，画成迷你折线。
 * 不按天聚合，这样一天打了很多场或隔几天才打一场时也能看到走势。
 */
const trend = computed<TrendPoint[]>(() => {
  const list = sample.value.slice().reverse();
  if (list.length < 2) return [];
  let wins = 0;
  let losses = 0;
  const points: Array<{ key: string; label: string; winRate: number }> = [];
  for (const g of list) {
    const result = classifyBattle(g);
    if (result === "win") wins += 1;
    else if (result === "lose") losses += 1;
    const decided = wins + losses;
    points.push({ key: g.game_id, label: dateLabelOf(g), winRate: decided ? Math.round((wins / decided) * 100) : 0 });
  }
  const step = (TREND_WIDTH - TREND_PADDING * 2) / Math.max(1, points.length - 1);
  return points.map((point, index) => ({
    ...point,
    x: TREND_PADDING + index * step,
    y: 38 - (point.winRate / 100) * 34
  }));
});
const trendPoints = computed(() => trend.value.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" "));
const trendFirstLabel = computed(() => trend.value[0]?.label ?? "");
const trendLastLabel = computed(() => trend.value[trend.value.length - 1]?.label ?? "");
const trendTitle = computed(() => "胜率趋势：最近 " + trend.value.length + " 场累计胜率（左旧右新）");
function trendPointTitle(point: TrendPoint): string {
  return point.label + " · 累计 " + point.winRate + "% 胜率";
}

/** 主动刷新（“刷新战绩”按钮联动）：清掉页缓存后按当前模式重新统计 */
function reload(): Promise<void> {
  pageCache.clear();
  return task.run();
}
defineExpose({ reload });
</script>
