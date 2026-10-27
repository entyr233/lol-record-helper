<template>
  <div class="page">
    <p class="state-text state-text--error" role="alert">{{ loginError || message }}</p>
    <p class="state-text">
      <button type="button" class="link-button" :disabled="loggingIn" @click="retry">重新读取账号</button>
      <button v-if="sdkAvailable" type="button" class="link-button" :disabled="loggingIn" @click="login">{{ loggingIn ? "等待登录…" : "立即登录" }}</button>
      <span v-else>请刷新页面让脚本重新注入登录 SDK；</span>
      <button v-if="loggingIn" type="button" class="link-button" @click="cancel">取消等待</button>
      <span>也可以直接在顶部搜索框查别人的昵称；</span>
      <button type="button" class="link-button" @click="reload">重新加载</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getLoginUser, isLoggedIn, isSdkAvailable, triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";

/**
 * 「我的战绩」的兜底页：路由守卫拿不到登录账号时停在这里。
 * 正常情况下守卫会直接重定向到自己的战绩页。
 */
const props = defineProps<{ area: string }>();
const router = useRouter();
const { pending: loggingIn, loginError, run, cancel } = useLoginAction();
// 每次重试都会重新检查 SDK；初次进入只显示提示，不从挂载钩子发起导航。
const sdkAvailable = ref(isSdkAvailable());
const loggedIn = ref(isLoggedIn());
let statusTimer: ReturnType<typeof setInterval> | undefined;
function refreshStatus(): void {
  sdkAvailable.value = isSdkAvailable();
  loggedIn.value = isLoggedIn();
}
onMounted(() => { statusTimer = setInterval(refreshStatus, 500); });
onBeforeUnmount(() => clearInterval(statusTimer));
const message = computed(() => !sdkAvailable.value
  ? "当前页面没有加载到 WeGame 登录 SDK（可刷新页面重试）。"
  : loggedIn.value ? "已登录，但未能读取登录账号，请重新读取账号。" : "未能读取登录账号，请先完成 WeGame 登录。");

async function showSelf(user: { uin: string }, signal: AbortSignal): Promise<void> {
  if (!signal.aborted) await router.replace({ name: "summary", params: { area: props.area, accountType: "1", id: user.uin } });
}

function retry(): Promise<void> {
  refreshStatus();
  return run(async (signal) => { await showSelf(await getLoginUser({ signal }), signal); });
}

function login(): Promise<void> {
  refreshStatus();
  return run(async (signal) => {
    await triggerLogin({ signal });
    await showSelf(await waitForLogin({ signal }), signal);
  });
}

function reload(): void {
  window.location.reload();
}
</script>
