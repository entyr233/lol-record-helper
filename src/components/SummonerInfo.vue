<template>
  <div class="summoner-info">
    <Panel title="总览">
      <p v-if="hidden" class="hidden-tip">战绩已隐藏</p>
      <p v-else-if="authExpired" class="state-text state-text--error">
        登录状态已失效，请重新登录
        <button type="button" class="link-button" @click="relogin">重新登录</button>
      </p>
      <p v-else-if="loading" class="state-text">加载中…</p>
      <p v-else-if="error" class="state-text state-text--error">
        {{ toErrorMessage(error) }}
        <button type="button" class="link-button" @click="reload">重试</button>
        <button v-if="needsCaptcha" type="button" class="link-button" @click="openHelper">去 LOL 助手页</button>
        <button v-if="authExpired" type="button" class="link-button" @click="relogin">立即登录</button>
      </p>
      <div v-else-if="summoner" class="summoner">
        <GameIcon class="summoner-avatar" kind="user" :id="summoner.icon_id" />
        <div class="summoner-base">
          <p class="summoner-name">{{ summoner.name }}</p>
          <p class="summoner-line">
            等级: {{ summoner.level }}
            <span class="summoner-sub">({{ summoner.experience }})</span>
          </p>
          <p class="summoner-line">赞: {{ summoner.praise }} | 黑: {{ summoner.discredit }}</p>
        </div>
        <div class="summoner-counts">
          <p v-for="row in countRows" :key="row.label" class="count-row">
            <span class="count-label">{{ row.label }}：</span>
            <span class="count-total">{{ row.total }}</span>
            <span class="count-win">{{ row.win }}</span>
            <span class="count-lose">{{ row.lose }}</span>
          </p>
        </div>
      </div>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import Panel from "./Panel.vue";
import GameIcon from "./GameIcon.vue";
import { lolBattleApi } from "../api/client";
import { ApiError, toErrorMessage } from "../api/errors";
import { useAsyncData } from "../composables/useAsyncData";
import { toRqOptions } from "../composables/useUserInfo";
import { logout, triggerLogin, waitForLogin } from "../utils/weGameLogin";

const props = defineProps<{ area: string; accountType: string; id: string }>();

const rqOptions = computed(() => toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }));

const summonerTask = useAsyncData((signal) => lolBattleApi.getSummonerInfo(rqOptions.value, { signal }));
const reportTask = useAsyncData((signal) => lolBattleApi.getBattleReport(rqOptions.value, { signal }));

const summoner = computed(() => summonerTask.data.value);
const counts = computed(() => reportTask.data.value);
const loading = computed(() => summonerTask.loading.value || reportTask.loading.value);
const error = computed(() => summonerTask.error.value);
const hidden = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.isHidden;
});
const needsCaptcha = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.needsCaptcha;
});
const authExpired = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.isUnauthenticated;
});

/** 修正旧版「匹配/排位」标签取反的问题：match = 匹配, rank = 排位 */
const countRows = computed(() => {
  const value = counts.value;
  if (!value) return [];
  return [
    { label: "所有对局", total: value.total_games, win: value.total_wins, lose: value.total_losts },
    { label: "大乱斗", total: value.total_arm_games, win: value.total_arm_wins, lose: value.total_arm_losts },
    { label: "匹配", total: value.total_match_games, win: value.total_match_wins, lose: value.total_match_losts },
    { label: "排位", total: value.total_rank_games, win: value.total_rank_wins, lose: value.total_rank_losts }
  ];
});

function reload(): void {
  void summonerTask.run();
  void reportTask.run();
}

function openHelper(): void {
  window.open("https://www.wegame.com.cn/helper/lol/", "_blank", "noopener");
}

async function relogin(): Promise<void> {
  if (triggerLogin()) {
    const ok = await waitForLogin();
    if (ok) {
      window.location.reload();
      return;
    }
  }
  logout();
  window.setTimeout(() => window.location.reload(), 300);
}

onMounted(() => {
  void summonerTask.run();
  void reportTask.run();
});
</script>
