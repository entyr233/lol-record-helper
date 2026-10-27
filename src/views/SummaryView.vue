<template>
  <div class="page page--summary">
    <SummonerInfo :area="area" :account-type="accountType" :id="id" />
    <RecentStats class="summary-recent" :area="area" :account-type="accountType" :id="id" />
    <BattleList class="summary-battles" :area="area" :account-type="accountType" :id="id" @open-summoner="openSummoner" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import SummonerInfo from "../components/SummonerInfo.vue";
import RecentStats from "../components/RecentStats.vue";
import BattleList from "../components/BattleList.vue";
import type { PlayerDetail } from "../api/types";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const router = useRouter();

function openSummoner(player: PlayerDetail): void {
  void router.push({
    name: "summary",
    params: { area: props.area, accountType: "2", id: player.openid }
  });
}
</script>
