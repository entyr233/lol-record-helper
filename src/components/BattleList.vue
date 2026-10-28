<template>
  <div ref="listRoot" class="battle-list">
    <Panel title="对局记录">
      <div class="battle-list-body">
        <div class="battle-list-side">
          <div class="mode-filter">
            <button v-for="option in modeOptions" :key="String(option.key)" type="button"
              class="mode-filter-tab" :class="{ 'mode-filter-tab--cur': filter.mode === option.key }"
              @click="emitFilter({ mode: option.key })">{{ option.label }}</button>
          </div>
          <div class="mode-filter mode-filter--extra">
            <select class="mode-filter-select" :value="filter.champion ?? ''" @change="onChampionChange">
              <option value="">全部英雄</option>
              <option v-for="c in championOptions" :key="c.id" :value="String(c.id)">{{ c.name }}（{{ c.count }}场）</option>
            </select>
            <select class="mode-filter-select" :value="filter.result" @change="onResultChange">
              <option value="all">全部胜负</option>
              <option value="win">只看胜利</option>
              <option value="fail">只看失败</option>
            </select>
            <select class="mode-filter-select" :value="String(filter.days)" @change="onDaysChange">
              <option value="0">不限时间</option>
              <option value="7">最近 7 天</option>
              <option value="30">最近 30 天</option>
            </select>
            <button v-if="!isDefault" type="button" class="mode-filter-tab mode-filter-tab--clear" @click="emitFilter(defaultPatch)">重置</button>
          </div>
          <p class="sample-note">{{ sampleText }}</p>
          <p v-if="notice" class="list-notice">{{ notice }}</p>
          <ul
            ref="listEl"
            class="battle-list-items"
            tabindex="0"
            @keydown.up.prevent="moveSelection(-1)"
            @keydown.down.prevent="moveSelection(1)"
          >
            <template v-if="!battles.length && loading">
              <li v-for="n in 6" :key="n" class="battle-skeleton">
                <span class="skeleton-block skeleton-block--avatar"></span>
                <span class="skeleton-lines">
                  <span class="skeleton-line"></span>
                  <span class="skeleton-line skeleton-line--short"></span>
                </span>
              </li>
            </template>
            <li v-else-if="!battles.length && error" class="state-text state-text--error" title="数据来源：WeGame 战绩接口">
              {{ toErrorMessage(error) }}
              <button type="button" class="list-retry" @click="retryCurrent">重试</button>
            </li>
            <li v-else-if="!battles.length" class="state-text battle-empty">
              <span>{{ hasActiveFilter ? "当前筛选下没有对局" : "该玩家最近没有对局记录" }}</span>
              <button v-if="hasActiveFilter" type="button" class="list-retry" @click="clearFilters">清除筛选</button>
            </li>
            <BattleListItem
              v-for="(battle, index) in battles"
              :key="battle.game_id"
              :data-game-id="battle.game_id"
              :battle="battle"
              :index="index"
              :class="{ selected: battle.game_id === selectedGameId }"
              @click="onSelect(battle.game_id)"
            />
          </ul>
          <div class="pager">
            <button type="button" class="pager-button" :disabled="!hasPrev || loading" @click="goToPage(page - 1)">上一页</button>
            <span class="pager-indicator">第 {{ page }} 页</span>
            <button type="button" class="pager-button" :disabled="!hasNext || loading" @click="goToPage(page + 1)">下一页</button>
          </div>
          <p v-if="error && battles.length" class="state-text state-text--error load-error">
            翻页失败：{{ toErrorMessage(error) }}
            <button type="button" class="list-retry" @click="retryCurrent">重试</button>
          </p>
        </div>

        <div class="battle-list-detail">
          <BattleDetail
            v-if="selectedGameId"
            :area="area"
            :start-time="selectedStartTime"
            :account-type="accountType"
            :id="id"
            :game-id="selectedGameId"
            :queue-id="selectedQueueId"
            @open-summoner="handleOpenSummoner"
          />
          <p v-else class="state-text">{{ loading ? "加载中…" : battles.length ? "选择左侧对局查看详情" : (hasActiveFilter ? "清除筛选后可查看对局" : "该玩家最近没有对局记录") }}</p>
        </div>
      </div>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Panel from "./Panel.vue";
import BattleListItem from "./BattleListItem.vue";
import BattleDetail from "./BattleDetail.vue";
import type { BattleSummary, PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useBattleList, DEFAULT_FILTER, type FocusGameResult, type ModeFilter, type DaysFilter, type ListFilter } from "../composables/useBattleList";
import { MODE_FILTER_OPTIONS } from "../const/modes";
import { toErrorMessage } from "../api/errors";
import { championName, ensureChampionNames } from "../api/staticData";
import type { BattleRefreshOptions } from "../composables/battleFeed";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  activeChampion?: number | null;
  /** 与总览共享的模式筛选（受控） */
  activeMode?: ModeFilter;
  /** 与总览共享的时间范围（受控） */
  activeDays?: DaysFilter;
}>();
const emit = defineEmits<{
  openSummoner: [player: PlayerDetail];
  championChange: [id: number | null];
  modeChange: [mode: ModeFilter];
  daysChange: [days: DaysFilter];
  selectionChange: [gameId: string | null];
  /** 列表首次成功加载的时间。 */
  updated: [at: Date];
}>();

const listRoot = ref<HTMLElement | null>(null);
/** 对局列表容器：键盘 ↑/↓ 与点选后都从这里接管焦点 */
const listEl = ref<HTMLElement | null>(null);
const rqOptions = computed(() => toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }));
const listState = useBattleList(() => rqOptions.value);
const {
  battles, page, requestedPage, hasPrev, hasNext, loading, error, selectedGameId, filter, sampleSize,
  rawLoaded, championPool, setFilter, goToPage, select, focusGame: locateGame,
  refresh: refreshList, dispose: disposeList
} = listState;

const modeOptions = MODE_FILTER_OPTIONS;
const defaultPatch: Partial<ListFilter> = { ...DEFAULT_FILTER };

/** 当前是否存在筛选条件（空结果时用于给出「清除筛选」的下一步） */
const hasActiveFilter = computed(
  () => filter.value.mode !== "all" || filter.value.champion !== null || filter.value.result !== "all" || filter.value.days !== 0
);
function clearFilters(): void {
  void setFilter({ ...DEFAULT_FILTER });
}

onMounted(() => {
  void ensureChampionNames();
});
const championOptions = computed(() => {
  const options = championPool.value.map((entry) => ({
    id: entry.id,
    count: entry.count,
    name: championName(entry.id) || ("英雄 " + entry.id)
  }));
  // 当前筛选的英雄即使还不在池子里（例如从外部带入）也要出现在选项里
  const activeId = filter.value.champion;
  if (activeId !== null && !options.some((item) => item.id === activeId)) {
    options.push({ id: activeId, count: sampleSize.value, name: championName(activeId) || ("英雄 " + activeId) });
  }
  return options.sort((a, b) => b.count - a.count || a.id - b.id);
});
const isDefault = computed(() => filter.value.mode === "all" && filter.value.champion === null && filter.value.result === "all" && filter.value.days === 0);

function emitFilter(patch: Partial<ListFilter>): void {
  void setFilter(patch);
}
function onChampionChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emitFilter({ champion: value === "" ? null : Number(value) });
}
function onResultChange(event: Event): void {
  emitFilter({ result: (event.target as HTMLSelectElement).value as ListFilter["result"] });
}
function onDaysChange(event: Event): void {
  emitFilter({ days: Number((event.target as HTMLSelectElement).value) as ListFilter["days"] });
}
const sampleText = computed(() => {
  const f = filter.value;
  const active = f.mode !== "all" || f.champion !== null || f.result !== "all" || f.days !== 0;
  if (!active) return "统计口径：当前页 " + sampleSize.value + " 场";
  return "已查询 " + rawCount.value + " 场，符合条件 " + sampleSize.value + " 场";
});
const rawCount = rawLoaded;

onMounted(() => {
  void goToPage(1).then(() => {
    if (!error.value) emit("updated", new Date());
  });
});

// 外部受控 prop → 内部筛选；相等判断避免与下方 emit 来回触发
watch(
  () => props.activeChampion ?? null,
  (value) => {
    if (filter.value.champion === value) return;
    void setFilter({ champion: value });
  },
  { immediate: true }
);
watch(
  () => props.activeMode ?? "all",
  (value) => {
    if (filter.value.mode === value) return;
    void setFilter({ mode: value });
  },
  { immediate: true }
);
watch(
  () => props.activeDays ?? 0,
  (value) => {
    if (filter.value.days === value) return;
    void setFilter({ days: value });
  },
  { immediate: true }
);
// 内部筛选/选中变化 → 通知外部
watch(() => filter.value.champion, (value) => {
  emit("championChange", value);
});
watch(() => filter.value.mode, (value) => {
  emit("modeChange", value);
});
watch(() => filter.value.days, (value) => {
  emit("daysChange", value);
});
watch(selectedGameId, (value) => {
  emit("selectionChange", value);
});

/** focusGame 定位到的对局：当前页找不到时作为详情参数的兜底 */
const focusedBattle = ref<BattleSummary | null>(null);
const selectedStartTime = computed(() => {
  const found = battles.value.find((item) => item.game_id === selectedGameId.value);
  const source = found ?? (focusedBattle.value?.game_id === selectedGameId.value ? focusedBattle.value : undefined);
  return source ? source.game_start_time : undefined;
});
const selectedQueueId = computed(() => {
  const found = battles.value.find((item) => item.game_id === selectedGameId.value);
  const source = found ?? (focusedBattle.value?.game_id === selectedGameId.value ? focusedBattle.value : undefined);
  return source?.game_queue_id;
});

/** 用户手动点选对局：清掉 focusGame 的兜底数据，并把焦点交给列表（键盘可继续 ↑/↓） */
function onSelect(gameId: string): void {
  focusedBattle.value = null;
  select(gameId);
  listEl.value?.focus();
}

/** 重试最近一次请求的页码，保留当前已经展示的列表。 */
function retryCurrent(): void {
  void goToPage(requestedPage.value);
}

/** 键盘 ↑/↓：在当前页对局间移动选中，并滚动到可见区域 */
async function moveSelection(step: number): Promise<void> {
  if (!battles.value.length) return;
  const found = battles.value.findIndex((item) => item.game_id === selectedGameId.value);
  const index = found < 0 ? 0 : found;
  const next = Math.min(Math.max(index + step, 0), battles.value.length - 1);
  focusedBattle.value = null;
  select(battles.value[next].game_id);
  await nextTick();
  // jsdom 里没有 scrollIntoView，做可选调用保护
  const nodes = listEl.value?.querySelectorAll<HTMLElement>("[data-game-id]") ?? [];
  const target = Array.from(nodes).find((node) => node.dataset.gameId === selectedGameId.value);
  target?.scrollIntoView?.({ block: "nearest" });
}

/** 列表上方提示（定位失败/发生过筛选重置），4 秒后自动清空 */
const notice = ref("");
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function showNotice(text: string): void {
  notice.value = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ""; }, 4000);
}
onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = undefined;
  disposeList();
});

function handleOpenSummoner(player: PlayerDetail): void {
  emit("openSummoner", player);
}

/** 近期表现联动：色块定位到该场真实所在页并选中、滚动可见（返回命中项与是否重置过筛选） */
async function focusGame(game: BattleSummary): Promise<FocusGameResult> {
  const result = await locateGame(game);
  if (!result.battle) {
    focusedBattle.value = null;
    showNotice(result.filterReset ? "已重置筛选，但仍未找到该场对局" : "该场对局不在最近 200 场范围内");
    return result;
  }
  focusedBattle.value = result.battle;
  if (result.filterReset) showNotice("已重置筛选以定位该场对局");
  await nextTick();
  // jsdom 里没有 scrollIntoView，做可选调用保护
  const nodes = listRoot.value?.querySelectorAll<HTMLElement>("[data-game-id]") ?? [];
  const target = Array.from(nodes).find((node) => node.dataset.gameId === result.battle?.game_id);
  target?.scrollIntoView?.({ block: "nearest" });
  return result;
}
function applyChampionFilter(id: number | null): void {
  void setFilter({ champion: id });
}

/** 主动刷新：保留筛选条件与当前查看的比赛（只有该场已不在结果里时才重新选择） */
async function refresh(options?: BattleRefreshOptions): Promise<boolean> {
  focusedBattle.value = null;
  return refreshList(options);
}

defineExpose({ focusGame, applyChampionFilter, refresh });
</script>
