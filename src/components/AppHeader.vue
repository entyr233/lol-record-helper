<template>
  <header class="app-header">
    <select v-model="selectedArea" class="area-select" aria-label="选择区服">
      <option value="" disabled>选择区服</option>
      <option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option>
    </select>

    <span class="header-divider"></span>
    <button v-if="currentArea" type="button" class="header-button" :disabled="loggingIn" @click="goSelf">我的战绩</button>
    <span class="header-divider"></span>
    <button v-if="loggedIn" type="button" class="header-button" @click="handleLogout">注销</button>
    <button v-else type="button" class="header-button header-button--login" :disabled="loggingIn" @click="handleLogin">
      {{ loggingIn ? "等待登录…" : "登录" }}
    </button>
    <button v-if="loggingIn" type="button" class="header-button" @click="cancel">取消等待</button>
    <span v-if="loginError" role="alert" class="login-error">{{ loginError }}</span>
    <button
      v-if="loginError || loggingIn"
      type="button"
      class="header-button"
      @click="openLink(LOGIN_PAGE_URL)"
    >
      去官网登录页 ↗
    </button>

    <span class="header-spacer"></span>

    <form class="header-search" @submit.prevent="search">
      <input v-model.trim="keyword" type="search" placeholder="搜索召唤师" aria-label="搜索召唤师" />
    </form>

    <span class="header-spacer"></span>

    <button type="button" class="header-button" @click="openLink(DONATE_URL)">向开发者捐赠</button>
    <span class="header-divider"></span>
    <button type="button" class="header-button" @click="openLink(SCRIPT_HOME)">主页</button>
    <span class="header-divider"></span>
    <button type="button" class="header-button" @click="openLink(REPO_URL)">Github</button>
    <span class="header-version" title="脚本版本">v{{ version }}</span>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { areas } from "../const/areas";
import { readStorage, writeStorage } from "../utils/storage";
import { getLoginUser, hasLoginState, logout, triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";

const DONATE_URL = "https://wsd.pages.interface.work/view?src=https%3A%2F%2Fpic.mscststs.com%2Fdonate.jpg";
const LOGIN_PAGE_URL = "https://www.wegame.com.cn/home/";
const SCRIPT_HOME = "https://greasyfork.org/zh-CN/scripts/454184";
const REPO_URL = "https://github.com/mscststs/lol-tft";
const version = __APP_VERSION__;

const route = useRoute();
const router = useRouter();

const selectedArea = ref<number | "">(0);
const keyword = ref("");
const loggedIn = ref(false);
const { pending: loggingIn, loginError, run, cancel } = useLoginAction();
const initialWait = new AbortController();
onBeforeUnmount(() => initialWait.abort());

const currentArea = computed(() => {
  const fromRoute = route.params.area;
  return fromRoute ? String(fromRoute) : "";
});

onMounted(() => {
  // 以登录 cookie 为准（SDK 状态刷新后不可靠），SDK 就绪后再校正一次
  loggedIn.value = hasLoginState();
  // 不主动等 SDK：登录态以 cookie 为准；SDK 只在用户点「登录」时按需注入
  void initialWait;
  const fromRoute = route.params.area;
  if (fromRoute) {
    selectedArea.value = Number(fromRoute) || 0;
    return;
  }
  const saved = readStorage<number>("area", 0);
  if (saved) selectedArea.value = saved;
});

watch(selectedArea, (value) => {
  if (value === "") return;
  writeStorage("area", value);
  if (String(value) !== currentArea.value) {
    void router.replace({ name: "area", params: { area: String(value) } });
  }
});

watch(() => route.params.area, (value) => {
  if (value) selectedArea.value = Number(value) || 0;
  loggedIn.value = hasLoginState();
});

function search(): void {
  if (!keyword.value) return;
  void router.push({ name: "search", params: { nickname: keyword.value } });
}

async function showSelf(user: { uin: string }, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  loggedIn.value = true;
  if (selectedArea.value) {
    await router.replace({ name: "summary", params: { area: String(selectedArea.value), accountType: "1", id: user.uin } });
  }
}

function goSelf(): Promise<void> {
  return run(async (signal) => {
    const user = await getLoginUser({ signal });
    await showSelf(user, signal);
  });
}

function handleLogin(): Promise<void> {
  return run(async (signal) => {
    await triggerLogin({ signal });
    const user = await waitForLogin({ signal });
    await showSelf(user, signal);
  });
}

function handleLogout(): void {
  logout();
  window.setTimeout(() => window.location.reload(), 300);
}

function openLink(url: string): void {
  window.open(url, "_blank", "noopener");
}
</script>
