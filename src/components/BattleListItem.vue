<template>
  <li class="battle-list-item" :class="resultClass">
    <span class="battle-champion">
      <GameIcon kind="champion" :id="battle.champion_id" />
      <span v-if="battle.was_afk" class="badge badge--afk">逃跑</span>
      <span v-else-if="(battle.mvp ?? battle.was_mvp)" class="badge badge--mvp">MVP</span>
      <span v-else-if="(battle.svp ?? battle.was_svp)" class="badge badge--svp">SVP</span>
    </span>
    <span class="battle-state">
      <span class="battle-state-heading">
        <span class="battle-result">{{ resultLabel }}</span>
        <span class="battle-queue">{{ queueName }}</span>
        <span class="battle-duration" title="游戏时长">{{ duration }}</span>
      </span>
      <span v-if="tierSnapshot || judgementLabel" class="battle-state-row2">
        <span v-if="tierSnapshot" class="battle-tier" title="对局时段位">{{ tierSnapshot }}</span>
        <span v-if="judgementLabel" class="battle-judgement" :title="'对局评价：' + judgementLabel">{{ judgementLabel }}</span>
      </span>
      <span class="battle-time" title="对局开始时间">{{ startTime }}</span>
    </span>
    <span class="battle-index">#{{ index + 1 }}</span>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import GameIcon from "./GameIcon.vue";
import type { OverviewBattle } from "../api/types";
import { getQueueName } from "../const/queues";
import { getJudgement } from "../const/judgements";
import { tierLabel } from "../const/tiers";
import { getResultClass, getResultLabel } from "../const/wins";
import { formatDateTime, formatDuration } from "../utils/format";

const props = defineProps<{ battle: OverviewBattle; index: number }>();

const resultClass = computed(() => (props.battle.was_early_surrender ? "remake" : getResultClass(props.battle.win)));
const resultLabel = computed(() => (props.battle.was_early_surrender ? "重开" : getResultLabel(props.battle.win)));
const queueName = computed(() =>
  props.battle.game_mode_name
  || getQueueName(Number(props.battle.queue_id ?? props.battle.queue ?? props.battle.game_queue_id ?? 0))
);
const tierSnapshot = computed(() => {
  const raw = props.battle.game_level;
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { tier?: string | number; rank?: number; queue?: number };
    const label = tierLabel(parsed.tier, parsed.rank ?? parsed.queue);
    return label === "未定级" ? "" : label;
  } catch { return ""; }
});
const judgementLabel = computed(() => getJudgement(props.battle.battle_type, 1)[0] ?? "");
const duration = computed(() => formatDuration(props.battle.game_time_played));
const startTime = computed(() => formatDateTime(props.battle.game_start_time));
</script>
