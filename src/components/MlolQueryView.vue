<template>
  <Panel title="掌盟源查询">
    <p class="state-text">输入对方游戏昵称搜索（可查 WeGame 侧隐藏战绩的玩家：掌盟搜索结果自带访问凭证）。</p>
    <form class="mlol-form" @submit.prevent="doSearch">
      <input v-model="keyword" class="mlol-input" placeholder="游戏昵称，如：几分妄想" @input="players = []" />
      <button type="submit" class="mlol-btn" :disabled="searching || !keyword.trim()">
        {{ searching ? "搜索中…" : "搜索" }}
      </button>
    </form>
    <p v-if="searchError" class="state-text state-text--error">{{ toErrorMessage(searchError) }}</p>

    <template v-if="players.length">
      <p class="state-text">找到 {{ players.length }} 位玩家，选择一位查看掌盟战绩</p>
      <ul class="mlol-players">
        <li v-for="p in players" :key="p.uuid">
          <button type="button" class="mlol-player" @click="openPlayer(p)">
            <GameIcon class="mlol-icon" kind="url" :id="p.uuid" :src="p.icon" />
            <span class="mlol-name">{{ p.name }}</span>
            <span class="mlol-desc">{{ p.desc }}</span>
          </button>
        </li>
      </ul>
    </template>

    <template v-if="identity">
      <p class="state-text mlol-loaded">
        {{ identity.roleName }}（{{ identity.areaName }}）的掌盟战绩
        <button type="button" class="history-clear" @click="loadMore" :disabled="loadingMore">
          {{ loadingMore ? "加载中…" : battles.length ? "加载更多" : "" }}
        </button>
      </p>
      <details v-if="rankSeasons.length || rankTrend.length" class="rank-history" open>
        <summary>历史段位查询 <span>掌盟赛季记录与近期走势</span></summary>
        <div class="rank-history-content">
          <div v-for="group in rankTrend" :key="group.title" class="rank-trend">
            <span class="rank-trend-title">{{ group.title }}</span>
            <span v-for="(point, index) in group.points" :key="index" class="rank-trend-chip">{{ point.label }}</span>
          </div>
          <table v-if="rankSeasons.length" class="rank-table">
            <thead><tr><th>赛季</th><th>队列</th><th>段位</th><th>胜点</th><th>战绩</th><th>胜率</th></tr></thead>
            <tbody>
              <template v-for="season in rankSeasons" :key="season.title">
                <tr v-for="(q, qi) in season.queues" :key="season.title + qi">
                  <td v-if="qi === 0" rowspan="">{{ season.title }}</td>
                  <td v-else />
                  <td>{{ q.title }}</td>
                  <td>{{ q.fullRank }}</td>
                  <td>{{ q.points }}</td>
                  <td>{{ q.wins }}胜{{ q.losses }}负</td>
                  <td>{{ q.winRate }}%</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </details>
      <ul class="battle-list-items">
        <li v-if="!battles.length && !loadError" class="state-text">暂无对局记录</li>
        <li v-else-if="loadError" class="state-text state-text--error">{{ toErrorMessage(loadError) }}</li>
        <BattleListItem
          v-for="(battle, index) in battles"
          :key="battle.game_id"
          :battle="battle"
          :index="index"
          :class="{ selected: battle.game_id === selectedGameId }"
          @click="select(battle.game_id)"
        />
      </ul>
      <BattleDetail
        v-if="selectedGame"
        :area="String(identity.areaId)"
        account-type="2"
        id=""
        :start-time="selectedGame.game_start_time"
        :game-id="selectedGame.game_id"
        :queue-id="selectedGame.game_queue_id"
        mode="概要"
        mlol-source
        :mlol-uuid="identity.uuid"
      />
    </template>
  </Panel>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Panel from "./Panel.vue";
import GameIcon from "./GameIcon.vue";
import BattleListItem from "./BattleListItem.vue";
import BattleDetail from "./BattleDetail.vue";
import { searchMlolPlayers, fetchMlolBattles, fetchMlolIdentity, type MlolPlayerCard, type MlolIdentity } from "../api/mlolSource";
import { fetchMlolRankHistory, type MlolSeasonRow, type MlolTrendGroup } from "../api/rankHistory";
import type { BattleSummary } from "../api/types";
import { toErrorMessage } from "../api/errors";

const keyword = ref("");
const searching = ref(false);
const searchError = ref<Error | null>(null);
const players = ref<MlolPlayerCard[]>([]);

const identity = ref<MlolIdentity | null>(null);
const battles = ref<BattleSummary[]>([]);
const nextIdx = ref(0);
const loadingMore = ref(false);
const loadError = ref<Error | null>(null);
const selectedGameId = ref<string | null>(null);
const rankSeasons = ref<MlolSeasonRow[]>([]);
const rankTrend = ref<MlolTrendGroup[]>([]);

const selectedGame = computed(() => battles.value.find((b) => b.game_id === selectedGameId.value) ?? null);

async function doSearch(): Promise<void> {
  const kw = keyword.value.trim();
  if (!kw) return;
  searching.value = true;
  searchError.value = null;
  players.value = [];
  identity.value = null;
  battles.value = [];
  selectedGameId.value = null;
  try {
    players.value = await searchMlolPlayers(kw);
    if (players.value.length === 0) searchError.value = new Error("掌盟没有找到该昵称的玩家");
  } catch (err) {
    searchError.value = err as Error;
  } finally {
    searching.value = false;
  }
}

async function openPlayer(card: MlolPlayerCard): Promise<void> {
  loadingMore.value = true;
  loadError.value = null;
  battles.value = [];
  selectedGameId.value = null;
  try {
    identity.value = await fetchMlolIdentity(card.scene);
    nextIdx.value = 0;
    const page = await fetchMlolBattles(identity.value.scene, 0);
    battles.value = page.battles;
    nextIdx.value = page.nextIdx;
    // 历史段位（scene 授权的 get_rank_trend）；失败不影响战绩列表
    try {
      const rank = await fetchMlolRankHistory(identity.value.scene);
      rankSeasons.value = rank.seasons;
      rankTrend.value = rank.trend;
    } catch { rankSeasons.value = []; rankTrend.value = []; }
  } catch (err) {
    loadError.value = err as Error;
  } finally {
    loadingMore.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (!identity.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchMlolBattles(identity.value.scene, nextIdx.value);
    battles.value = [...battles.value, ...page.battles];
    nextIdx.value = page.nextIdx;
  } catch (err) {
    loadError.value = err as Error;
  } finally {
    loadingMore.value = false;
  }
}

function select(gameId: string): void {
  selectedGameId.value = gameId;
}
</script>
