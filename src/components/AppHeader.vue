<template>
  <header class="app-header">
    <select v-model="selectedArea" class="area-select" aria-label="选择区服">
      <option value="" disabled>选择区服</option>
      <option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option>
    </select>

    <span class="header-divider"></span>
    <button v-if="currentArea" type="button" class="header-button" @click="goSelf">我的战绩</button>
    <span class="header-divider"></span>
    <button v-if="loggedIn" type="button" class="header-button" @click="handleLogout">注销</button>
    <button v-else type="button" class="header-button header-button--login" @click="handleLogin">
      {{ loggingIn ? "等待登录…" : "登录" }}
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
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { areas } from "../const/areas";
import { readStorage, writeStorage } from "../utils/storage";
import { isLoggedIn, isSdkAvailable, logout, triggerLogin, waitForLogin } from "../utils/weGameLogin";

const DONATE_URL = "https://wsd.pages.interface.work/view?src=https%3A%2F%2Fpic.mscststs.com%2Fdonate.jpg";
const SCRIPT_HOME = "https://greasyfork.org/zh-CN/scripts/454184";
const REPO_URL = "https://github.com/mscststs/lol-tft";

const route = useRoute();
const router = useRouter();

const selectedArea = ref<number | "">(0);
const keyword = ref("");
const loggedIn = ref(true);
const loggingIn = ref(false);

const currentArea = computed(() => {
  const fromRoute = route.params.area;
  return fromRoute ? String(fromRoute) : "";
});

onMounted(() => {
  loggedIn.value = isSdkAvailable() ? isLoggedIn() : false;
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

function search(): void {
  if (!keyword.value) return;
  void router.push({ name: "search", params: { nickname: keyword.value } });
}

function goSelf(): void {
  if (selectedArea.value === "") return;
  void router.replace({ name: "area", params: { area: String(selectedArea.value) } });
}

async function handleLogin(): Promise<void> {
  if (!triggerLogin()) {
    window.alert("当前页面没有可用的 WeGame 登录 SDK，请刷新页面后重试");
    return;
  }
  loggingIn.value = true;
  const ok = await waitForLogin();
  loggingIn.value = false;
  if (!ok) return;
  loggedIn.value = true;
  const area = selectedArea.value === "" ? 0 : Number(selectedArea.value);
  if (area) {
    void router.replace({ name: "area", params: { area: String(area) } });
  }
}

function handleLogout(): void {
  logout();
  window.setTimeout(() => window.location.reload(), 300);
}

function openLink(url: string): void {
  window.open(url, "_blank", "noopener");
}
</script>
