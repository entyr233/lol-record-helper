<template>
  <div class="battle-detail">
    <p v-if="loading" class="state-text">加载对局详情…</p>
    <div v-else-if="error" class="state-text state-text--error">
      {{ error.message }}
      <button type="button" class="link-button" @click="run">重试</button>
    </div>
    <template v-else-if="detail">
      <section v-for="team in teams" :key="team.teamId" class="detail-team" :class="team.resultClass">
        <header class="detail-team-head">
          <span class="team-state">{{ team.resultLabel }}</span>
          <span class="team-side">({{ team.teamId === "100" ? "蓝方" : "红方" }})</span>
          <span class="team-kda">{{ team.totalKills }} / {{ team.totalDeaths }} / {{ team.totalAssists }}</span>
          <span class="team-spacer"></span>
          <span class="team-elo" title="ELO 评分">{{ team.teamElo }}</span>
        </header>
        <BattleDetailPlayer
          v-for="player in team.players"
          :key="player.openid"
          :player="player"
          :players="detail.player_details"
          :mode="mode"
          :is-self="player.openid === selfOpenid"
          @open-summoner="$emit('openSummoner', $event)"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import BattleDetailPlayer from "./BattleDetailPlayer.vue";
import { lolBattleApi } from "../api/client";
import type { PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useAsyncData } from "../composables/useAsyncData";
import { getResultClass, getResultLabel } from "../const/wins";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  gameId: string | null;
  mode: "概要" | "技能" | "伤害";
}>();

defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const request = useAsyncData((signal) =>
  lolBattleApi.getBattleDetail(toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }), String(props.gameId), { signal })
);

const detail = computed(() => request.data.value?.battle_detail ?? null);
const selfOpenid = computed(() => request.data.value?.openid ?? null);
const loading = request.loading;
const error = request.error;
const run = request.run;

watch(
  () => props.gameId,
  (gameId) => {
    if (gameId) void run();
  },
  { immediate: true }
);

const teams = computed(() => {
  const current = detail.value;
  if (!current) return [];
  return current.team_details.map((team) => ({
    teamId: team.teamId,
    totalKills: team.totalKills,
    totalDeaths: team.totalDeaths,
    totalAssists: team.totalAssists,
    teamElo: team.teamElo,
    resultClass: getResultClass(team.win),
    resultLabel: getResultLabel(team.win),
    players: current.player_details
      .filter((player) => player.teamId === team.teamId)
      .slice()
      .sort((a, b) => (b.teamMadeSize || 0) - (a.teamMadeSize || 0))
  }));
});
</script>
