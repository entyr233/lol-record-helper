<template>
  <div v-if="games.length" class="recent-stats">
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
    </template>
    <p v-else class="recent-empty">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import GameIcon from "./GameIcon.vue";
import { useAsyncData } from "../composables/useAsyncData";
import { toRqOptions } from "../composables/useUserInfo";
import { lolBattleApi } from "../api/client";
import { championName, ensureChampionNames } from "../api/staticData";
import type { BattleSummary } from "../api/types";
import { battleResultLabel, classifyBattle } from "../const/wins";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  activeChampion?: number | null;
  activeGameId?: string | null;
}>();
defineEmits<{ focusGame: [game: BattleSummary]; filterChampion: [id: number | null] }>();

/** 统计模式：全部 或某个队列（420 单双排 / 440 灵活组排 / 450 大乱斗 / 430 匹配 / 2400 海克斯大乱斗） */
type OverviewMode = "all" | number;
const MODE_OPTIONS: Array<{ key: OverviewMode; label: string }> = [
  { key: "all", label: "全部" },
  { key: 420, label: "单双排" },
  { key: 440, label: "灵活组排" },
  { key: 450, label: "大乱斗" },
  { key: 430, label: "匹配" },
  { key: 2400, label: "海克斯大乱斗" }
];
/** 展示/统计窗口：最近多少场（指定模式同样截断到这么多场） */
const RECENT_WINDOW = 20;
/** 全部模式只取最近 20 场（1 页 10 场） */
const ALL_MODE_PAGES = 2;
/** 指定模式最多回看多少页（60 场），尽量凑够样本 */
const MODE_PAGES_MAX = 6;
/** 指定模式的目标样本量 */
const MODE_SAMPLE_TARGET = 10;

const selectedMode = ref<OverviewMode>("all");
/** 原始页缓存：切换模式时只补拉缺少的页，不重复请求 */
const pageCache = new Map<number, BattleSummary[]>();

function matchesMode(b: BattleSummary, mode: OverviewMode): boolean {
  return mode === "all" || Number(b.game_queue_id) === Number(mode);
}

const task = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  const mode = selectedMode.value;
  const maxPages = mode === "all" ? ALL_MODE_PAGES : MODE_PAGES_MAX;
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
    if (mode === "all") {
      if (collected.length >= RECENT_WINDOW) break;
    } else if (collected.filter((item) => matchesMode(item, mode)).length >= MODE_SAMPLE_TARGET) {
      break;
    }
  }
  return collected;
});

onMounted(() => {
  void ensureChampionNames();
  void task.run();
});

const games = computed(() => task.data.value ?? []);
/** 当前模式下的样本（最近 RECENT_WINDOW 场以内的匹配对局） */
const sample = computed(() => {
  const list = selectedMode.value === "all"
    ? games.value
    : games.value.filter((item) => matchesMode(item, selectedMode.value));
  return list.slice(0, RECENT_WINDOW);
});
const modeLabel = computed(() => MODE_OPTIONS.find((option) => option.key === selectedMode.value)?.label ?? "全部");
const titleText = computed(() => {
  if (selectedMode.value === "all") return "全部模式 · 最近 " + sample.value.length + " 场";
  return modeLabel.value + " · 最近 " + games.value.length + " 场中 " + sample.value.length + " 场";
});
const emptyText = computed(() => modeLabel.value + "：最近 " + games.value.length + " 场里没有该模式的对局");

/** 切换模式：优先复用已缓存的原始页，只补拉缺少的部分 */
function selectMode(mode: OverviewMode): void {
  if (selectedMode.value === mode) return;
  selectedMode.value = mode;
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
  return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, 3);
});

/** 主动刷新（“刷新战绩”按钮联动）：清掉页缓存后按当前模式重新统计 */
function reload(): Promise<void> {
  pageCache.clear();
  return task.run();
}
defineExpose({ reload });
</script>
