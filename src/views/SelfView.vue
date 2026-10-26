<template>
  <div class="page">
    <p class="state-text state-text--error">{{ message }}</p>
    <p class="state-text">
      可以先在顶部搜索框查自己的昵称进入战绩页；
      <button type="button" class="link-button" @click="reload">重新加载</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { isSdkAvailable } from "../utils/weGameLogin";

/**
 * 「我的战绩」的兜底页：路由守卫拿不到登录账号时停在这里。
 * 正常情况下守卫会直接重定向到自己的战绩页。
 */
const message = ref("");

onMounted(() => {
  message.value = isSdkAvailable()
    ? "未能读取登录账号，可能登录态已过期。请确认已登录 wegame.com.cn 后重试。"
    : "未检测到 WeGame 登录 SDK（当前页面可能未加载它）。仍然可以搜索任意召唤师查看战绩。";
});

function reload(): void {
  window.location.reload();
}
</script>
