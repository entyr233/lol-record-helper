<template>
  <section class="helper-login" aria-label="LOL 助手增强">
    <header class="panel-head">
      <strong>LOL 助手增强</strong>
      <button type="button" class="collapse" @click="collapsed = !collapsed">{{ collapsed ? "展开" : "收起" }}</button>
    </header>

    <div v-if="!collapsed" class="panel-body">
      <section class="login-block">
        <p class="block-title">官方助手登录</p>
        <p role="status">{{ pending ? "请在官方登录窗口完成登录，完成后将刷新此页。" : "登录后刷新官方页面，保留当前访问位置。" }}</p>
        <div class="actions">
          <button type="button" :disabled="pending" @click="login">{{ pending ? "等待登录…" : "登录 / 重新登录" }}</button>
          <button v-if="pending" type="button" @click="cancel">取消等待</button>
          <a :href="HOME_URL" target="_blank" rel="noopener noreferrer">去官网登录 ↗</a>
        </div>
        <p v-if="loginError" role="alert">{{ loginError }}</p>
        <button type="button" class="refresh" :disabled="pending" @click="$emit('refresh')">已在官网完成登录，刷新此页</button>
      </section>

      <section class="area-block">
        <label class="block-title" for="lol-tft-helper-area">官方页面大区</label>
        <div class="area-row">
          <select id="lol-tft-helper-area" v-model.number="areaId">
            <option :value="0">请选择大区</option>
            <option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option>
          </select>
          <button type="button" class="open-official" :disabled="!areaId" @click="openOfficialCareer">打开官方战绩</button>
        </div>
        <p class="hint">
          <template v-if="uin">
            官方助手页通过地址栏的 uin / area_id / account_type 识别玩家；打开时会带上当前账号与所选大区。
          </template>
          <template v-else>
            未读取到登录账号：地址里只会带大区，官方页面可能仍提示「未选定大区」。建议先登录，或去官网登录后刷新此页。
          </template>
        </p>
        <button type="button" class="open-self" @click="openSelfPanel">打开自建战绩面板</button>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { areas } from "../const/areas";
import { readStorage, writeStorage } from "../utils/storage";
import { getSelfUinFromCookie, triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";

const HOME_URL = "https://www.wegame.com.cn/home/";
const OFFICIAL_HELPER_PATH = "/helper/lol/";
const AREA_STORAGE_KEY = "lol-tft-helper-area";

const emit = defineEmits<{ authenticated: []; refresh: [] }>();
const { pending, loginError, run, cancel } = useLoginAction();

const collapsed = ref(false);
/** 记住上次选择的大区；首次打开时沿用自建面板记住的 last-area */
const savedArea = Number(readStorage<number | string>(AREA_STORAGE_KEY, 0)) || Number(readStorage<string>("last-area", "")) || 0;
const areaId = ref<number>(Number.isFinite(savedArea) ? savedArea : 0);
const uin = computed(() => getSelfUinFromCookie());

watch(areaId, (value) => {
  writeStorage(AREA_STORAGE_KEY, value);
});

function login(): Promise<void> {
  return run(async (signal) => {
    await triggerLogin({ signal });
    if (signal.aborted) return;
    await waitForLogin({ signal });
    if (!signal.aborted) emit("authenticated");
  });
}

/** 官方页面启动时会解析 hash 里的 ?uin=&area_id=&account_type=，借此把查询对象切换为当前账号 */
function officialCareerHash(): string {
  const query = new URLSearchParams();
  if (uin.value) query.set("uin", uin.value);
  query.set("area_id", String(areaId.value));
  query.set("account_type", "1");
  return "#/life/overview?" + query.toString();
}

function openOfficialCareer(): void {
  if (!areaId.value) return;
  location.hash = officialCareerHash();
}

/** 打开脚本自建的战绩面板；如果当前页没有挂载面板，则回官网页面使用 */
function openSelfPanel(): void {
  const api = (window as unknown as { __LOL_TFT__?: { open?: () => void } }).__LOL_TFT__;
  if (api && typeof api.open === "function") {
    api.open();
    return;
  }
  window.open("https://www.wegame.com.cn/", "_blank", "noopener");
}

// 供 mountHelperLogin 的测试/外部诊断使用（同时避免打包器把常量摇掉）
void OFFICIAL_HELPER_PATH;
</script>
