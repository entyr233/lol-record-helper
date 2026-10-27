<template>
  <div v-if="games.length" class="recent-stats">
    <div class="recent-headline">
      <span class="recent-title">全部模式 · 最近 {{ games.length }} 场</span>
      <span class="recent-wl"><b class="w">{{ wins }}</b>胜<b class="l">{{ losses }}</b>负</span>
      <span class="recent-wr">{{ winRate }}% 胜率</span>
      <span class="recent-kda">{{ avgKda }} KDA</span>
      <span v-if="streak" class="recent-streak" :class="{ 'recent-streak--lose': firstIsLose }">{{ streak }}</span>
    </div>
    <div class="recent-strip" :title="stripTitle">
      <button v-for="(g, index) in games.slice().reverse()" :key="g.game_id" type="button"
        class="strip-block strip-block--btn" :class="g.win === 'Win' ? 'strip-win' : 'strip-lose'"
        :title="(games.length - index) + '：' + (g.win === 'Win' ? '胜利' : '失败') + ' · 点击定位'"
        @click="$emit('focusGame', g)" />
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

const props = defineProps<{ area: string; accountType: string; id: string; activeChampion?: number | null }>();
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
const wins = computed(() => games.value.filter((g) => g.win === "Win").length);
const losses = computed(() => games.value.length - wins.value);
const winRate = computed(() => (games.value.length ? Math.round((wins.value / games.value.length) * 100) : 0));
const avgKda = computed(() => {
  const totals = games.value.reduce(
    (acc, g) => ({ k: acc.k + (g.kills ?? 0), d: acc.d + (g.deaths ?? 0), a: acc.a + (g.assists ?? 0) }),
    { k: 0, d: 0, a: 0 }
  );
  if (!totals.d && !totals.k) return "0.00";
  return ((totals.k + totals.a) / Math.max(1, totals.d)).toFixed(2);
});
const firstIsLose = computed(() => games.value[0]?.win !== "Win");
const streak = computed(() => {
  if (!games.value.length) return "";
  const first = games.value[0].win;
  let count = 0;
  for (const g of games.value) {
    if (g.win !== first) break;
    count += 1;
  }
  const word = first === "Win" ? "连胜" : "连败";
  return count >= 2 ? count + word : "";
});
const stripTitle = computed(() => "从左到右：由远到近（" + wins.value + "胜" + losses.value + "负），点击色块定位对局");
const topChampions = computed(() => {
  const byId = new Map<number, { id: number; count: number; wins: number }>();
  for (const g of games.value) {
    const entry = byId.get(g.champion_id) ?? { id: g.champion_id, count: 0, wins: 0 };
    entry.count += 1;
    if (g.win === "Win") entry.wins += 1;
    byId.set(g.champion_id, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, 3);
});
</script>
