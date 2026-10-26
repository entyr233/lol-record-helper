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
          <ul class="battle-list-items">
            <li v-if="!battles.length && loading" class="state-text">加载中…</li>
            <li v-else-if="!battles.length && error" class="state-text state-text--error">
              {{ error.message }}
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
          <button v-if="hasMore" type="button" class="load-more" :disabled="loading" @click="loadMore">
            {{ loading ? "加载中…" : "点击加载更多" }}
          </button>
        </div>

        <div class="battle-list-detail">
          <BattleDetail
            v-if="selectedGameId"
            :area="area"
            :account-type="accountType"
            :id="id"
            :game-id="selectedGameId"
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
import { useBattleList } from "../composables/useBattleList";

const props = defineProps<{ area: string; accountType: string; id: string }>();
const emit = defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const MODES = ["概要", "技能", "伤害"] as const;
const currentMode = ref<(typeof MODES)[number]>("概要");

const rqOptions = computed(() => toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }));
const { battles, loading, error, hasMore, selectedGameId, loadMore, select } = useBattleList(() => rqOptions.value);

onMounted(() => {
  void loadMore();
});

function handleOpenSummoner(player: PlayerDetail): void {
  emit("openSummoner", player);
}
</script>
