<template>
  <div class="page page--summary">
    <SummonerInfo
      :area="area"
      :account-type="accountType"
      :id="id"
      :active-champion="activeChampion"
      :active-game-id="selectedGameId"
      @focus-game="focusGame"
      @filter-champion="setChampionFilter"
    />
    <BattleList
      ref="listRef"
      class="summary-battles"
      :area="area"
      :account-type="accountType"
      :id="id"
      :active-champion="activeChampion"
      @open-summoner="openSummoner"
      @champion-change="onChampionChange"
      @selection-change="onSelectionChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import SummonerInfo from "../components/SummonerInfo.vue";
import BattleList from "../components/BattleList.vue";
import type { BattleSummary } from "../api/types";
import type { PlayerDetail } from "../api/types";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const router = useRouter();
const listRef = ref<InstanceType<typeof BattleList> | null>(null);

/** 上下共享状态：英雄筛选与当前选中对局（总览高亮 / 列表选中必须一致） */
const activeChampion = ref<number | null>(null);
const selectedGameId = ref<string | null>(null);

function focusGame(game: BattleSummary): void {
  void listRef.value?.focusGame(game).then((result) => {
    if (!result) return;
    // 定位成功：把选中态同步回总览；因筛选冲突被重置时同步清掉英雄筛选
    if (result.battle) selectedGameId.value = result.battle.game_id;
    if (result.filterReset) activeChampion.value = null;
  });
}

function setChampionFilter(id: number | null): void {
  activeChampion.value = id;
  listRef.value?.applyChampionFilter(id);
}

function onChampionChange(id: number | null): void {
  if (activeChampion.value !== id) activeChampion.value = id;
}

function onSelectionChange(gameId: string | null): void {
  if (selectedGameId.value !== gameId) selectedGameId.value = gameId;
}

function openSummoner(player: PlayerDetail): void {
  void router.push({
    name: "summary",
    params: { area: props.area, accountType: "2", id: player.openid }
  });
}
</script>
