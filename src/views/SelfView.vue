<template>
  <div class="page">
    <p class="state-text state-text--error">{{ message }}</p>
    <p class="state-text">
      <button v-if="sdkAvailable" type="button" class="link-button" @click="login">{{ loggingIn ? "等待登录…" : "立即登录" }}</button>
      <span v-else>请刷新页面让脚本重新注入登录 SDK；</span>
      <span>也可以直接在顶部搜索框查别人的昵称；</span>
      <button type="button" class="link-button" @click="reload">重新加载</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { isSdkAvailable, triggerLogin, waitForLogin } from "../utils/weGameLogin";

/**
 * 「我的战绩」的兜底页：路由守卫拿不到登录账号时停在这里。
 * 正常情况下守卫会直接重定向到自己的战绩页。
 */
const message = ref("");
const sdkAvailable = ref(false);
const loggingIn = ref(false);

onMounted(() => {
  sdkAvailable.value = isSdkAvailable();
  message.value = sdkAvailable.value
    ? "未能读取登录账号，通常是因为还没有登录 WeGame。"
    : "当前页面没有加载到 WeGame 登录 SDK（可刷新页面重试）。";
});

async function login(): Promise<void> {
  if (!triggerLogin()) return;
  loggingIn.value = true;
  const ok = await waitForLogin();
  loggingIn.value = false;
  if (ok) window.location.reload();
}

function reload(): void {
  window.location.reload();
}
</script>
