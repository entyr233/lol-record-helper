<template>
  <div class="page page--summary">
    <SummonerInfo :area="area" :account-type="accountType" :id="id"
      @focus-game="focusGame" @filter-champion="filterChampion" />
    <RecentStats class="summary-recent" :area="area" :account-type="accountType" :id="id" />
    <BattleList ref="listRef" class="summary-battles" :area="area" :account-type="accountType" :id="id" @open-summoner="openSummoner" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import SummonerInfo from "../components/SummonerInfo.vue";
import RecentStats from "../components/RecentStats.vue";
import BattleList from "../components/BattleList.vue";
import type { BattleSummary } from "../api/types";
import type { PlayerDetail } from "../api/types";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const router = useRouter();
const listRef = ref<InstanceType<typeof BattleList> | null>(null);

function focusGame(game: BattleSummary): void {
  listRef.value?.focusGame(game);
}
function filterChampion(id: number | null): void {
  listRef.value?.applyChampionFilter(id);
}

function openSummoner(player: PlayerDetail): void {
  void router.push({
    name: "summary",
    params: { area: props.area, accountType: "2", id: player.openid }
  });
}
</script>
