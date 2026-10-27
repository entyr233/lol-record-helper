<template>
  <div v-if="games.length" class="recent-stats">
    <div class="recent-headline">
      <span class="recent-title">最近 {{ games.length }} 场</span>
      <span class="recent-wl"><b class="w">{{ wins }}</b>胜<b class="l">{{ losses }}</b>负</span>
      <span class="recent-wr">{{ winRate }}% 胜率</span>
      <span class="recent-kda">{{ avgKda }} KDA</span>
      <span v-if="streak" class="recent-streak">{{ streak }}</span>
    </div>
    <div class="recent-strip" :title="stripTitle">
      <span v-for="g in games.slice().reverse()" :key="g.game_id" class="strip-block" :class="g.win === 'Win' ? 'strip-win' : 'strip-lose'" />
    </div>
    <div class="recent-champs">
      <span class="recent-champs-label">常用英雄</span>
      <span v-for="c in topChampions" :key="c.id" class="recent-champ">
        <GameIcon kind="champion" :id="c.id" />
        <span class="recent-champ-meta">{{ c.count }}场 {{ c.wins }}胜</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import GameIcon from "./GameIcon.vue";
import { useAsyncData } from "../composables/useAsyncData";
import { toRqOptions } from "../composables/useUserInfo";
import { lolBattleApi } from "../api/client";
import type { BattleSummary } from "../api/types";

const props = defineProps<{ area: string; accountType: string; id: string }>();

const task = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  // 最近 20 场 = 前两页（第二页失败不影响主体）
  const page1 = await lolBattleApi.getBattleList(rq, { count: 10, offset: 0 }, { signal });
  const page2 = await lolBattleApi.getBattleList(rq, { count: 10, offset: 10 }, { signal }).catch(() => [] as BattleSummary[]);
  return [...page1, ...page2];
});

onMounted(() => {
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
const stripTitle = computed(() => "从左到右：由远到近（" + wins.value + "胜" + losses.value + "负）");
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
