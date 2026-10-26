<template>
  <div class="page">
    <p v-if="error" class="state-text state-text--error">{{ error }}</p>
    <p v-else class="state-text">正在读取登录信息…</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getLoginUser, isSdkAvailable } from "../utils/weGameLogin";

const props = defineProps<{ area: string }>();
const router = useRouter();
const error = ref("");

onMounted(async () => {
  if (!isSdkAvailable()) {
    error.value = "未检测到 WeGame 登录 SDK，请在 WeGame 页面内使用";
    return;
  }
  const user = await getLoginUser();
  if (!user || !user.uin) {
    error.value = "未能获取登录用户信息，请重新登录后重试";
    return;
  }
  await router.replace({ name: "summary", params: { area: props.area, accountType: "1", id: String(user.uin) } });
});
</script>
