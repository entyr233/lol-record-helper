<template>
  <div v-if="games.length" class="recent-stats">
    <div class="recent-headline">
      <span class="recent-title">全部模式 · 最近 {{ games.length }} 场</span>
      <span class="recent-wl"><b class="w">{{ wins }}</b>胜<b class="l">{{ losses }}</b>负</span>
      <span v-if="remakes" class="recent-remake">（重开 {{ remakes }}）</span>
      <span class="recent-wr">{{ winRate }}% 胜率</span>
      <span class="recent-kda">{{ avgKda }} KDA</span>
      <span v-if="streak" class="recent-streak" :class="{ 'recent-streak--lose': firstIsLose }">{{ streak }}</span>
    </div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
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

const task = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  const page1 = await lolBattleApi.getBattleList(rq, { count: 10, offset: 0 }, { signal });
  const page2 = await lolBattleApi.getBattleList(rq, { count: 10, offset: 10 }, { signal }).catch(() => [] as BattleSummary[]);
  return [...page1, ...page2];
});

onMounted(() => {
  void ensureChampionNames();
  void task.run();
});


const games = computed(() => task.data.value ?? []);
/** 三分类计数：重开单列，不计入胜率分母 */
const resultCounts = computed(() => {
  let winCount = 0;
  let loseCount = 0;
  let remakeCount = 0;
  for (const g of games.value) {
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
  const totals = games.value.reduce(
    (acc, g) => ({ k: acc.k + (g.kills ?? 0), d: acc.d + (g.deaths ?? 0), a: acc.a + (g.assists ?? 0) }),
    { k: 0, d: 0, a: 0 }
  );
  if (!totals.d && !totals.k) return "0.00";
  return ((totals.k + totals.a) / Math.max(1, totals.d)).toFixed(2);
});
/** 连胜连败：跳过重开取第一场非重开结果，之后连续相同结果计数（重开不打断） */
const streakState = computed(() => {
  const list = games.value;
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
const recentGames = computed(() => games.value.slice().reverse());
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
  for (const g of games.value) {
    const entry = byId.get(g.champion_id) ?? { id: g.champion_id, count: 0, wins: 0 };
    entry.count += 1;
    if (classifyBattle(g) === "win") entry.wins += 1;
    byId.set(g.champion_id, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, 3);
});

/** 主动刷新（“刷新战绩”按钮联动；保留当前英雄筛选展示） */
function reload(): Promise<void> {
  return task.run();
}
defineExpose({ reload });
</script>
