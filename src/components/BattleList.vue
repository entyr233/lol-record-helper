<template>
  <div class="battle-list">
    <Panel title="对局记录">
      <template #title-expand>
        <div class="mode-switch">
          <button
            v-for="mode in MODES"
            :key="mode"
            type="button"
            class="mode-button"
            :class="{ active: mode === currentMode }"
            @click="currentMode = mode"
          >
            {{ mode }}
          </button>
        </div>
      </template>

      <div class="battle-list-body">
        <div class="battle-list-side">
          <div class="mode-filter">
            <button v-for="option in modeOptions" :key="String(option.key)" type="button"
              class="mode-filter-tab" :class="{ 'mode-filter-tab--cur': filter === option.key }"
              @click="emitFilter(option.key)">{{ option.label }}</button>
          </div>
          <ul class="battle-list-items">
            <li v-if="!battles.length && loading" class="state-text">加载中…</li>
            <li v-else-if="!battles.length && error" class="state-text state-text--error">
              {{ toErrorMessage(error) }}
            </li>
            <li v-else-if="!battles.length" class="state-text">暂无数据</li>
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
            :mode="currentMode"
            @open-summoner="handleOpenSummoner"
          />
          <p v-else class="state-text">选择左侧对局查看详情</p>
        </div>
      </div>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Panel from "./Panel.vue";
import BattleListItem from "./BattleListItem.vue";
import BattleDetail from "./BattleDetail.vue";
import type { PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useBattleList, type ModeFilter } from "../composables/useBattleList";
import { toErrorMessage } from "../api/errors";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const emit = defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const MODES = ["概要", "技能", "伤害", "海克斯"] as const;
const currentMode = ref<(typeof MODES)[number]>("概要");

const rqOptions = computed(() => toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }));
const listState = useBattleList(() => rqOptions.value);
const { battles, page, hasPrev, hasNext, loading, error, selectedGameId, filter, goToPage, select } = listState;
const modeOptions: Array<{ key: ModeFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "mvp", label: "MVP/SVP" },
  { key: 430, label: "匹配" },
  { key: 450, label: "大乱斗" },
  { key: 420, label: "单双排" },
  { key: 440, label: "灵活组排" },
  { key: 2400, label: "海克斯大乱斗" }
];
function emitFilter(key: ModeFilter): void {
  void listState.setFilter(key);
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
