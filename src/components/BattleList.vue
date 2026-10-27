<template>
  <div class="battle-list">
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
            <button type="button" class="mode-filter-tab" :class="{ 'mode-filter-tab--cur': filter.result !== 'all' }"
              @click="emitFilter({ result: filter.result === 'all' ? 'win' : filter.result === 'win' ? 'fail' : 'all' })">
              {{ filter.result === 'win' ? '只看胜' : filter.result === 'fail' ? '只看败' : '胜负' }}
            </button>
            <button type="button" class="mode-filter-tab" :class="{ 'mode-filter-tab--cur': filter.days !== 0 }"
              @click="emitFilter({ days: filter.days === 0 ? 7 : filter.days === 7 ? 30 : 0 })">
              {{ filter.days ? '最近 ' + filter.days + ' 天' : '时间' }}
            </button>
            <button v-if="!isDefault" type="button" class="mode-filter-tab mode-filter-tab--clear" @click="emitFilter(defaultPatch)">重置</button>
          </div>
          <p class="sample-note">基于已加载的 {{ sampleSize }} 场</p>
          <ul class="battle-list-items">
            <li v-if="!battles.length && loading" class="state-text">加载中…</li>
            <li v-else-if="!battles.length && error" class="state-text state-text--error">
              {{ toErrorMessage(error) }}
            </li>
            <li v-else-if="!battles.length" class="state-text">当前筛选下没有对局</li>
            <BattleListItem
              v-for="(battle, index) in battles"
              :key="battle.game_id"
              :battle="battle"
              :index="index"
              :class="{ selected: battle.game_id === selectedGameId }"
              @click="select(battle.game_id)"
            />
          </ul>
          <div class="pager">
            <button type="button" class="pager-button" :disabled="!hasPrev || loading" @click="goToPage(page - 1)">上一页</button>
            <span class="pager-indicator">第 {{ page }} 页</span>
            <button type="button" class="pager-button" :disabled="!hasNext || loading" @click="goToPage(page + 1)">下一页</button>
          </div>
          <p v-if="error && battles.length" class="state-text state-text--error load-error">
            翻页失败：{{ toErrorMessage(error) }}
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
          <p v-else class="state-text">选择左侧对局查看详情</p>
        </div>
      </div>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import Panel from "./Panel.vue";
import BattleListItem from "./BattleListItem.vue";
import BattleDetail from "./BattleDetail.vue";
import type { PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useBattleList, DEFAULT_FILTER, type ModeFilter, type ListFilter } from "../composables/useBattleList";
import { toErrorMessage } from "../api/errors";
import { championName, ensureChampionNames } from "../api/staticData";
import { ref } from "vue";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const emit = defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const rqOptions = computed(() => toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }));
const listState = useBattleList(() => rqOptions.value);
const { battles, page, hasPrev, hasNext, loading, error, selectedGameId, filter, sampleSize, setFilter, goToPage, select } = listState;

const modeOptions: Array<{ key: ModeFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "mvp", label: "MVP/SVP" },
  { key: 430, label: "匹配" },
  { key: 450, label: "大乱斗" },
  { key: 420, label: "单双排" },
  { key: 440, label: "灵活组排" },
  { key: 2400, label: "海克斯大乱斗" }
];
const defaultPatch: Partial<ListFilter> = { ...DEFAULT_FILTER };

const nameTick = ref(0);
onMounted(() => {
  void ensureChampionNames().then(() => { nameTick.value += 1; });
});
const championOptions = computed(() => {
  void nameTick.value;
  const byId = new Map<number, number>();
  for (const b of battles.value) {
    byId.set(b.champion_id, (byId.get(b.champion_id) ?? 0) + 1);
  }
  return [...byId.entries()].map(([id, count]) => ({ id, count, name: championName(id) || ("英雄 " + id) })).sort((a, b) => b.count - a.count);
});
const isDefault = computed(() => filter.value.mode === "all" && filter.value.champion === null && filter.value.result === "all" && filter.value.days === 0);

function emitFilter(patch: Partial<ListFilter>): void {
  void setFilter(patch);
}
function onChampionChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emitFilter({ champion: value === "" ? null : Number(value) });
}

onMounted(() => {
  void goToPage(1);
});

const selectedStartTime = computed(() => {
  const found = battles.value.find((item) => item.game_id === selectedGameId.value);
  return found ? found.game_start_time : undefined;
});
const selectedQueueId = computed(() => {
  const found = battles.value.find((item) => item.game_id === selectedGameId.value);
  return found?.game_queue_id;
});

function handleOpenSummoner(player: PlayerDetail): void {
  emit("openSummoner", player);
}
</script>
