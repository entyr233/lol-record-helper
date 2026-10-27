<template>
  <div class="battle-detail">
    <p v-if="loading" class="state-text">加载对局详情…</p>
    <div v-else-if="error" class="state-text state-text--error">
      {{ toErrorMessage(error) }}
      <button type="button" class="link-button" @click="run">重试</button>
    </div>
    <template v-else-if="detail">
      <section v-for="team in teams" :key="team.teamId" class="detail-team" :class="team.resultClass">
        <header class="detail-team-head">
          <span class="team-state">{{ team.resultLabel }}</span>
          <span class="team-side">({{ team.teamId === "100" ? "蓝方" : "红方" }})</span>
          <span class="team-kda">{{ team.totalKills }} / {{ team.totalDeaths }} / {{ team.totalAssists }}</span>
          <span class="team-spacer"></span>
          <span v-if="team.teamElo" class="team-elo" title="ELO 评分">{{ team.teamElo }}</span>
        </header>
        <BattleDetailPlayer
          v-for="player in team.players"
          :key="player.openid"
          :player="player"
          :players="detail.player_details"
          :mode="mode"
          :is-self="canOpenPlayer && player.openid === selfOpenid"
          @open-summoner="canOpenPlayer && $emit('openSummoner', $event)"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import BattleDetailPlayer from "./BattleDetailPlayer.vue";
import { lolBattleApi } from "../api/client";
import { ApiError, toErrorMessage } from "../api/errors";
import { fetchMlolBattleDetail } from "../api/mlolDetail";
import type { BattleDetail, PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useAsyncData } from "../composables/useAsyncData";
import { getResultClass, getResultLabel } from "../const/wins";

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  gameId: string | null;
  startTime?: number | string;
  mode: "概要" | "技能" | "伤害";
}>();

defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const request = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  try {
    // 首选：wegame 同源详情
    return await lolBattleApi.getBattleDetail(rq, String(props.gameId), { signal });
  } catch (error) {
    // 官方已限制老详情接口（8000120 等）：回退到掌盟公开详情（GM 传输带 qt.qq.com 登录 cookie）
    if (error instanceof ApiError && !signal.aborted) {
      const mlol = await fetchMlolBattleDetail({
        gameId: String(props.gameId),
        areaId: props.area,
        startTime: props.startTime
      });
      if (mlol.player_details.length > 0) return mlol as unknown as GetBattleDetailLike;
    }
    throw error;
  }
});

interface GetBattleDetailLike {
  battle_detail: BattleDetail;
  openid: string | null;
}

const detail = computed<BattleDetail | null>(() => request.data.value?.battle_detail ?? null);
const selfOpenid = computed(() => request.data.value?.openid ?? null);
/** 掌盟数据源的玩家没有 wegame openid，点击跳转不可用 */
const canOpenPlayer = computed(() => request.data.value?.openid !== null);
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
