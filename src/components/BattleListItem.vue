<template>
  <li class="battle-list-item" :class="resultClass">
    <span class="battle-champion">
      <GameIcon kind="champion" :id="battle.champion_id" />
      <span v-if="battle.was_afk" class="badge badge--afk">逃跑</span>
      <span v-else-if="battle.was_mvp" class="badge badge--mvp">MVP</span>
      <span v-else-if="battle.was_svp" class="badge badge--svp">SVP</span>
    </span>
    <span class="battle-state">
      <span class="battle-result">{{ resultLabel }}</span>
      <span class="battle-queue">({{ queueName }})</span>
      <span class="battle-duration" title="游戏时长">{{ duration }}</span>
      <span class="battle-time" title="对局开始时间">{{ startTime }}</span>
    </span>
    <span class="battle-index">#{{ index + 1 }}</span>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import GameIcon from "./GameIcon.vue";
import type { BattleSummary } from "../api/types";
import { getQueueName } from "../const/queues";
import { getResultClass, getResultLabel } from "../const/wins";
import { formatDateTime, formatDuration } from "../utils/format";

const props = defineProps<{ battle: BattleSummary; index: number }>();

const resultClass = computed(() => (props.battle.was_early_surrender ? "remake" : getResultClass(props.battle.win)));
const resultLabel = computed(() => (props.battle.was_early_surrender ? "重开" : getResultLabel(props.battle.win)));
const queueName = computed(() => getQueueName(props.battle.game_queue_id));
const duration = computed(() => formatDuration(props.battle.game_time_played));
const startTime = computed(() => formatDateTime(props.battle.game_start_time));
</script>
