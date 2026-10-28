<template>
  <div class="page page--summary">
    <div class="summary-toolbar">
      <span v-if="updatedAt" class="summary-updated">更新于 {{ updatedText }}</span>
      <button type="button" class="summary-refresh" :disabled="refreshing" @click="refreshAll">
        {{ refreshing ? "刷新中…" : "刷新战绩" }}
      </button>
    </div>
    <p v-if="refreshError" class="state-text state-text--error summary-refresh-error" role="alert">{{ refreshError }}</p>
    <SummonerInfo
      ref="summonerRef"
      :area="area"
      :account-type="accountType"
      :id="id"
      :active-champion="activeChampion"
      :active-game-id="selectedGameId"
      :active-mode="activeMode"
      :active-days="activeDays"
      @focus-game="focusGame"
      @filter-champion="setChampionFilter"
      @mode-change="onModeChange"
    />
    <BattleList
      ref="listRef"
      class="summary-battles"
      :area="area"
      :account-type="accountType"
      :id="id"
      :active-champion="activeChampion"
      :active-mode="activeMode"
      @open-summoner="openSummoner"
      @champion-change="onChampionChange"
      @mode-change="onModeChange"
      @days-change="onDaysChange"
      @selection-change="onSelectionChange"
      @updated="onUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import SummonerInfo from "../components/SummonerInfo.vue";
import BattleList from "../components/BattleList.vue";
import type { BattleSummary } from "../api/types";
import type { PlayerDetail } from "../api/types";
import type { ModeFilter } from "../const/modes";
import type { DaysFilter } from "../composables/useBattleList";
import { useBattleFeed } from "../composables/useBattleFeed";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const feed = useBattleFeed(() => props);
const router = useRouter();
const listRef = ref<InstanceType<typeof BattleList> | null>(null);
const summonerRef = ref<InstanceType<typeof SummonerInfo> | null>(null);

/** 上下共享状态：模式/时间范围筛选、英雄筛选、当前选中对局（总览与列表必须一致） */
const activeMode = ref<ModeFilter>("all");
const activeDays = ref<DaysFilter>(0);
const activeChampion = ref<number | null>(null);
const selectedGameId = ref<string | null>(null);

/** 数据更新时间：列表首次加载成功或整页刷新成功后更新。 */
const updatedAt = ref<Date | null>(null);
const refreshing = ref(false);
const refreshError = ref("");
const updatedText = computed(() => (updatedAt.value ? clock(updatedAt.value) : ""));

function clock(value: Date): string {
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return pad(value.getHours()) + ":" + pad(value.getMinutes());
}

function onUpdated(at: Date): void {
  updatedAt.value = at;
}

/** 刷新战绩：同时更新总览（资料/统计/近期表现）与对局列表，保留筛选与当前查看的比赛 */
async function refreshAll(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  refreshError.value = "";
  try {
    feed.invalidate();
    const [overviewFailures, listSucceeded] = await Promise.all([
      summonerRef.value?.refresh({ invalidate: false }), listRef.value?.refresh({ invalidate: false })
    ]);
    const failures = overviewFailures ?? [];
    if (listSucceeded === false) failures.push("对局列表");
    if (failures.length) {
      refreshError.value = "未能更新：" + failures.join("、") + "。请重试。";
    } else {
      updatedAt.value = new Date();
    }
  } finally {
    refreshing.value = false;
  }
}

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

/** 模式改变：总览与列表共用一份状态（任一侧切换都会同步另一侧） */
function onModeChange(mode: ModeFilter): void {
  if (activeMode.value !== mode) activeMode.value = mode;
}

/** 时间范围改变（列表的下拉）：总览统计同步 */
function onDaysChange(days: DaysFilter): void {
  if (activeDays.value !== days) activeDays.value = days;
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
