<template>
  <div class="page">
    <p class="state-text state-text--error">{{ message }}</p>
    <p class="state-text">
      <button type="button" class="link-button" @click="reload">重新加载</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { isSdkAvailable } from "../utils/weGameLogin";

/**
 * 「我的战绩」的兜底页。
 * 正常情况下路由守卫已经解析出登录用户并重定向到 summary；只有解析失败才会停在这里。
 */
const message = ref("正在读取登录信息…");

onMounted(() => {
  message.value = isSdkAvailable()
    ? "未能获取登录用户信息，请重新登录后重试"
    : "未检测到 WeGame 登录 SDK，请在 WeGame 页面内使用";
});

function reload(): void {
  window.location.reload();
}
</script>
