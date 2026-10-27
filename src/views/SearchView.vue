<template>
  <div class="page">
    <Panel title="搜索结果">
      <p v-if="loading" class="state-text">搜索中…</p>
      <p v-else-if="error" class="state-text state-text--error">{{ toErrorMessage(error) }}</p>
      <template v-else-if="players.length">
        <p class="state-text search-hint">找到 {{ players.length }} 位同名玩家，点击其中一位查看战绩</p>
        <ul class="search-results">
          <li v-for="player in players" :key="player.openid" class="search-item">
            <button type="button" class="search-button" @click="openPlayer(player)">
              <GameIcon class="search-avatar" kind="user" :id="player.icon_id" />
              <span class="search-name">{{ nickname }}</span>
              <span class="search-area">{{ getAreaName(player.area) }}</span>
              <span class="search-level">等级: {{ player.level }}</span>
              <span class="search-arrow">查看战绩 →</span>
            </button>
          </li>
        </ul>
      </template>
      <p v-else class="state-text">没有结果</p>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import Panel from "../components/Panel.vue";
import GameIcon from "../components/GameIcon.vue";
import { lolBattleApi } from "../api/client";
import { toErrorMessage } from "../api/errors";
import { useAsyncData } from "../composables/useAsyncData";
import { getAreaName } from "../const/areas";
import type { PlayerSearchResult } from "../api/types";

const props = defineProps<{ nickname: string }>();
const router = useRouter();

const task = useAsyncData((signal) => lolBattleApi.searchPlayer(props.nickname, { signal }));
const players = computed(() => (task.data.value || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0)));
const loading = task.loading;
const error = task.error;

onMounted(() => {
  void task.run();
});

function openPlayer(player: PlayerSearchResult): void {
  void router.push({
    name: "summary",
    params: { area: String(player.area), accountType: "2", id: player.openid }
  });
}
</script>
