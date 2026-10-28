<template>
  <div class="page">
    <Panel title="搜索结果">
      <div v-if="historyNames.length" class="search-history">
        <span class="search-history-label">最近搜索：</span>
        <span v-for="name in historyNames" :key="name" class="search-history-chip" :class="{ 'search-history-chip--cur': name === props.nickname }">
          <button type="button" class="chip-main" @click="searchHistory(name)">{{ name }}</button>
          <button type="button" class="chip-del" title="删除这条记录" @click="removeHistory(name)">×</button>
        </span>
        <button type="button" class="history-clear" @click="clearHistory">清空记录</button>
      </div>
      <p v-if="loading" class="state-text">搜索中…</p>
      <template v-else-if="error">
        <p class="state-text state-text--error">{{ toErrorMessage(error) }}</p>
        <p v-if="isPrivacyError" class="state-text">该玩家设置了战绩隐私（服务端强制，无法绕过）</p>
      </template>
      <template v-else-if="players.length">
        <p class="state-text search-hint">找到 {{ players.length }} 位同名玩家，点击其中一位查看战绩</p>
        <ul class="search-results">
          <li v-for="player in players" :key="player.openid" class="search-item">
            <div class="search-result-row">
              <button type="button" class="search-button" @click="openPlayer(player)">
                <GameIcon class="search-avatar" kind="user" :id="player.icon_id" />
                <span class="search-name">{{ nickname }}</span>
                <span class="search-area">{{ getAreaName(player.area) }}</span>
                <span class="search-level">等级: {{ player.level }}</span>
                <span class="search-arrow">查看战绩 →</span>
              </button>
              <button type="button" class="fav-star" :class="{ 'fav-star--on': isFavorite(player) }"
                :title="isFavorite(player) ? '取消常看' : '加入常看玩家'"
                @click.stop="toggleFavorite(player)">{{ isFavorite(player) ? "★" : "☆" }}</button>
            </div>
          </li>
        </ul>
      </template>
      <p v-else class="state-text search-empty">
        没有找到玩家
        <span class="search-empty-hint">换个昵称或切换大区后再试</span>
      </p>
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
import { useFavorites } from "../composables/useFavorites";
import { getAreaName } from "../const/areas";
import type { PlayerSearchResult } from "../api/types";
import { useSearchHistory } from "../composables/useSearchHistory";

const props = defineProps<{ nickname: string }>();
const router = useRouter();

const { historyNames, remember: rememberName, remove: removeHistory, clear: clearHistory } = useSearchHistory();

function searchHistory(name: string): void {
  void router.push({ name: "search", params: { nickname: name } });
}

const task = useAsyncData((signal) => lolBattleApi.searchPlayer(props.nickname, { signal }));
const players = computed(() => (task.data.value || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0)));
const loading = task.loading;
const error = task.error;

onMounted(() => {
  rememberName(props.nickname);
  void task.run();
});

const isPrivacyError = computed(() => {
  const err = task.error.value;
  if (!err) return false;
  const code = (err as { code?: unknown }).code;
  return code === "8000009" || code === "8000021" || String((err as Error).message).includes("8000009") || String((err as Error).message).includes("8000021");
});


const { isFavorite: isFavoriteEntry, toggle: toggleFavoriteEntry } = useFavorites();

function isFavorite(player: PlayerSearchResult): boolean {
  return isFavoriteEntry({ area: player.area, accountType: "2", id: player.openid });
}

function toggleFavorite(player: PlayerSearchResult): void {
  toggleFavoriteEntry({
    name: props.nickname,
    area: player.area,
    accountType: "2",
    id: player.openid,
    level: player.level
  });
}

function openPlayer(player: PlayerSearchResult): void {
  void router.push({
    name: "summary",
    params: { area: String(player.area), accountType: "2", id: player.openid }
  });
}
</script>
