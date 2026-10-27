<template>
  <div class="summoner-info">
    <Panel title="总览">
      <p v-if="hidden" class="hidden-tip">战绩已隐藏</p>
      <p v-else-if="authExpired" class="state-text state-text--error">
        登录状态已失效，请重新登录
        <button type="button" class="link-button" :disabled="loggingIn" @click="relogin">重新登录</button>
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
          <p class="summoner-name">
            {{ summoner.name }}
            <button type="button" class="copy-name" @click="copyName">{{ copied ? "已复制" : "复制昵称" }}</button>
            <button type="button" class="fav-star" :class="{ 'fav-star--on': isFavorite }" @click="toggleFavorite">
              {{ isFavorite ? "★" : "☆" }}
            </button>
          </p>
          <p v-if="tierText" class="count-row count-row--tier">
            <span class="count-label">段位：</span>
            <span class="count-tier">{{ tierText }}</span>
          </p>
        </div>
        <div class="summoner-counts">
          <p v-if="reportLoading" class="state-text">统计加载中…</p>
          <p v-else-if="reportError" class="state-text state-text--error">
            统计加载失败：{{ toErrorMessage(reportError) }}
            <button type="button" class="link-button" @click="retryReport">重试统计</button>
          </p>
          <template v-else>
            <p v-if="tierText" class="count-row">
              <span class="count-label">段位：</span>
              <span class="count-tier">{{ tierText }}</span>
            </p>
          </template>
        </div>
        <details class="summoner-more">
          <summary>更多资料</summary>
          <p class="summoner-line">
            等级: {{ summoner.level }}
            <span class="summoner-sub">({{ summoner.experience }})</span>
          </p>
          <p class="summoner-line">赞: {{ summoner.praise }} | 黑: {{ summoner.discredit }}</p>
          <p v-for="row in countRows" :key="row.label" class="count-row">
            <span class="count-label">{{ row.label }}：</span>
            <span class="count-total">{{ row.total }}</span>
            <span class="count-win">{{ row.win }}</span>
            <span class="count-lose">{{ row.lose }}</span>
          </p>
        </details>
      </div>
      <div class="summoner-recent">
        <RecentStats :area="area" :account-type="accountType" :id="id" :active-champion="activeChampion"
          @focus-game="(g: BattleSummary) => emit('focusGame', g)" @filter-champion="(id: number | null) => emit('filterChampion', id)" />
      </div>
      <p v-if="loginError" class="state-text state-text--error" role="alert">{{ loginError }}</p>
      <button v-if="loggingIn" type="button" class="link-button" @click="cancel">取消等待</button>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Panel from "./Panel.vue";
import GameIcon from "./GameIcon.vue";
import RecentStats from "./RecentStats.vue";
import { lolBattleApi } from "../api/client";
import type { BattleSummary } from "../api/types";
import { ApiError, toErrorMessage } from "../api/errors";
import { useAsyncData } from "../composables/useAsyncData";
import { toRqOptions } from "../composables/useUserInfo";
import { triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";
import { tierLabel, tierOrder } from "../const/tiers";

const props = defineProps<{ area: string; accountType: string; id: string; activeChampion?: number | null }>();

const emit = defineEmits<{ focusGame: [game: BattleSummary]; filterChampion: [id: number | null] }>();

const FAV_KEY = "lol-tft-favorites";
const favorites = ref<Array<{ name: string; area: number; id: string; accountType: string; level?: number }>>([]);
try {
  favorites.value = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as typeof favorites.value;
} catch { favorites.value = []; }

const isFavorite = computed(() => favorites.value.some((f) => f.id === props.id && f.accountType === props.accountType));
function toggleFavorite(): void {
  if (isFavorite.value) {
    favorites.value = favorites.value.filter((f) => !(f.id === props.id && f.accountType === props.accountType));
  } else {
    favorites.value = [{
      name: summoner.value?.name ?? props.id,
      area: Number(props.area) || 0,
      id: props.id,
      accountType: props.accountType,
      level: summoner.value?.level
    }, ...favorites.value].slice(0, 20);
  }
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites.value)); } catch { /* ignore */ }
}
const { pending: loggingIn, loginError, run, cancel } = useLoginAction();

const rqOptions = computed(() => toRqOptions({ area: props.area, accountType: props.accountType, id: props.id }));

const summonerTask = useAsyncData((signal) => lolBattleApi.getSummonerInfo(rqOptions.value, { signal }));
const reportTask = useAsyncData((signal) => lolBattleApi.getBattleReport(rqOptions.value, { signal }));

const summoner = computed(() => summonerTask.data.value);
const counts = computed(() => reportTask.data.value);
const loading = computed(() => summonerTask.loading.value);
const error = computed(() => summonerTask.error.value);
const reportLoading = computed(() => reportTask.loading.value);
const reportError = computed(() => reportTask.error.value);
const hidden = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.isHidden;
});
const needsCaptcha = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.needsCaptcha;
});
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copyName(): Promise<void> {
  const name = summoner.value?.name;
  if (!name) return;
  try {
    await navigator.clipboard.writeText(name);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 1500);
  } catch { /* 剪贴板不可用时静默 */ }
}

const authExpired = computed(() => {
  const err = summonerTask.error.value;
  return err instanceof ApiError && err.isUnauthenticated;
});

/** 段位：summoner.season 优先（现任接口随资料返回），season_list 兜底（数字越小段位越高） */
const tierText = computed(() => {
  const candidates: Array<{ tier?: number; win_point?: number | string }> = [];
  const ownSeason = summoner.value?.season;
  if (ownSeason && ownSeason.tier !== undefined) candidates.push({ tier: ownSeason.tier, win_point: ownSeason.win_point });
  for (const entry of counts.value?.season_list ?? []) candidates.push({ tier: entry.tier, win_point: entry.win_point });
  if (candidates.length === 0) return "";
  const best = candidates.slice().sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier))[0];
  const label = tierLabel(best.tier, (best as { queue?: number }).queue);
  if (label === "未定级") return label;
  const lp = best.win_point !== undefined && best.win_point !== "" ? " · " + best.win_point + " LP" : "";
  return label + lp;
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

function retryReport(): void {
  void reportTask.run();
}

function openHelper(): void {
  window.open("https://www.wegame.com.cn/helper/lol/", "_blank", "noopener");
}

function relogin(): Promise<void> {
  return run(async (signal) => {
    await triggerLogin({ signal });
    await waitForLogin({ signal });
    if (!signal.aborted) reload();
  });
}

onMounted(() => {
  void summonerTask.run();
  void reportTask.run();
});
</script>
