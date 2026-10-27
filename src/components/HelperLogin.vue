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
        </div>
        <div class="open-row">
          <button type="button" class="open-official" :disabled="!areaId" @click="openOfficialCareer">打开官方战绩</button>
          <button type="button" class="open-tft" :disabled="!areaId" @click="openOfficialTft">打开云顶战绩</button>
        </div>
        <p class="hint">
          <template v-if="uin">
            官方助手页通过地址栏的 uin / area_id / account_type 识别玩家；打开时会带上当前账号与所选大区（LOL 用 /life/overview，云顶用 /tft/overview）。
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { areas } from "../const/areas";
import { readStorage, writeStorage } from "../utils/storage";
import { getSelfUinFromCookie, triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";

const HOME_URL = "https://www.wegame.com.cn/home/";
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

onMounted(() => {
  // frame.html 在普通浏览器里不会初始化登录用户：跳到标准助手页（保留地址里已有的查询参数）
  if (!isStandardHelperPage() && !isWeGameClient()) {
    const hash = location.hash || "";
    const suffix = hash.includes("?") ? hash : selfCareerHash(currentSection() || "tft");
    location.href = HELPER_ORIGIN + "/helper/lol/" + suffix;
    return;
  }
  // 等官方页面初始化；如果仍提示「未选定大区」，再用 hash 参数兜底
  errorTimer = setTimeout(checkOfficialError, 2500);
});

onBeforeUnmount(() => {
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = null;
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
type OfficialSection = "life" | "tft";
const HELPER_ORIGIN = "https://www.wegame.com.cn";
const STANDARD_HELPER_PATHS = ["/helper/lol/", "/helper/lol/index.html"];

function isStandardHelperPage(): boolean {
  return STANDARD_HELPER_PATHS.includes(location.pathname);
}

/** WeGame 客户端内嵌页（UA 带 WeGame/）才走 frame.html；普通浏览器统一用标准助手页 */
function isWeGameClient(): boolean {
  return /WeGame\//.test(navigator.userAgent || "");
}

function currentSection(): OfficialSection | null {
  const match = (location.hash || "").match(/^#\/(life|tft)\/overview/);
  return match ? (match[1] as OfficialSection) : null;
}

function officialCareerHash(section: OfficialSection): string {
  const query = new URLSearchParams();
  if (uin.value) query.set("uin", uin.value);
  query.set("area_id", String(areaId.value));
  query.set("account_type", "1");
  return "#/" + section + "/overview?" + query.toString();
}

/** 标准助手页上「我的战绩」地址：不带 uin/area 参数，让官方按登录用户（TGP 桥）初始化 */
function selfCareerHash(section: OfficialSection): string {
  return "#/" + section + "/overview";
}

function selfCareerUrl(section: OfficialSection): string {
  return HELPER_ORIGIN + "/helper/lol/" + selfCareerHash(section);
}

/** 参数兜底地址：官方页面仍报「未选定大区」时，用 uin/area_id 参数强制指定查询对象 */
function officialCareerUrl(section: OfficialSection): string {
  return HELPER_ORIGIN + "/helper/lol/" + officialCareerHash(section);
}

let fallbackApplied = false;
let errorTimer: ReturnType<typeof setTimeout> | null = null;

/** 官方页面初始化失败时（普通浏览器没有 TGP），用 hash 参数兜底一次 */
function checkOfficialError(): void {
  if (fallbackApplied) return;
  const text = (document.body && (document.body.innerText || document.body.textContent)) || "";
  if (!/未选定大区|请选定大区后重试/.test(text)) return;
  const section = currentSection();
  if (!section || !areaId.value || !uin.value) return;
  fallbackApplied = true;
  location.href = officialCareerUrl(section);
}

/**
 * 打开官方页面时优先走「登录用户自助初始化」：
 * 脚本在 document-start 注入的 TGP 桥会让官方按当前账号加载，这样云顶/生涯都是本人数据；
 * 只有在官方页面仍显示「未选定大区」时，才退回 hash 参数兜底。
 */
function openOfficial(section: OfficialSection): void {
  if (!areaId.value) return;
  if (isWeGameClient()) {
    location.hash = selfCareerHash(section);
    return;
  }
  location.href = selfCareerUrl(section);
}

function openOfficialCareer(): void {
  openOfficial("life");
}

/** 云顶之弈战绩页（/helper/lol/v2/frame.html#/tft/overview）走同一条 hash 参数约定 */
function openOfficialTft(): void {
  openOfficial("tft");
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
</script>
