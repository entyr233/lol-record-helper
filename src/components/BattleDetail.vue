<template>
  <div class="battle-detail">
    <p v-if="loading" class="state-text">加载对局详情…</p>
    <div v-else-if="error" class="state-text state-text--error">
      {{ toErrorMessage(error) }}
      <span class="detail-diag">（验证码：{{ diag.outcome }}）</span>
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
          :hex-aram="isHexAram"
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
import { lastCaptchaAttempt } from "../api/captcha";
import type { BattleDetail, PlayerDetail } from "../api/types";
import { toRqOptions } from "../composables/useUserInfo";
import { useAsyncData } from "../composables/useAsyncData";
import { getResultClass, getResultLabel } from "../const/wins";

const diag = lastCaptchaAttempt;

const props = defineProps<{
  area: string;
  accountType: string;
  id: string;
  gameId: string | null;
  startTime?: number | string;
  /** 选中对局的队列 id（2400 = 海克斯大乱斗：无符文，有海克斯强化） */
  queueId?: number | string;
  mode: "概要" | "技能" | "伤害" | "海克斯";
}>();

const isHexAram = computed(() => Number(props.queueId) === 2400);

defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const request = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  const trail: string[] = [];
  const codeOf = (error: unknown): string => {
    if (error instanceof ApiError) return String(error.code) + (error.serverMessage ? " " + error.serverMessage : "");
    return error instanceof Error ? error.message.slice(0, 40) : String(error);
  };

  try {
    // 首选：wegame 同源详情
    const result = await lolBattleApi.getBattleDetail(rq, String(props.gameId), { signal });
    return result;
  } catch (error) {
    trail.push("wegame详情:" + codeOf(error));
    if (!(error instanceof ApiError) || signal.aborted) throw error;
    // 回退一：详情接口对 account_type=2+openid 的口径可能仍开放——
    // 用召唤师名字搜索自己的 openid，换口径重试（仅 self 场景）
    if (String(rq.account_type) === "1") {
      try {
        const summoner = await lolBattleApi.getSummonerInfo(rq, { signal });
        const players = await lolBattleApi.searchPlayer(summoner.name, { signal });
        const match = players.find((p) => Number(p.area) === Number(props.area));
        trail.push("搜索:" + (match ? "ok" : "无匹配"));
        if (match) {
          return await lolBattleApi.getBattleDetail(
            { ...rq, account_type: 2, id: match.openid },
            String(props.gameId),
            { signal }
          );
        }
      } catch (error) {
        trail.push("搜索:" + codeOf(error));
      }
    }
    // 回退二：掌盟公开详情（桥）
    try {
      const mlol = await fetchMlolBattleDetail({
        gameId: String(props.gameId),
        areaId: props.area,
        startTime: props.startTime
      }, signal);
      trail.push("掌盟:ok");
      if (mlol.player_details.length > 0) return mlol as unknown as GetBattleDetailLike;
      trail.push("掌盟:空数据");
    } catch (error) {
      trail.push("掌盟:" + codeOf(error));
    }
    throw new ApiError("DETAIL_ALL_FAILED", "GetBattleDetail", "全部详情来源失败 [" + trail.join(" | ") + "]");
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
