<template>
  <section
    ref="panelEl"
    class="helper-login"
    :class="{ 'helper-login--collapsed': collapsed, 'helper-login--positioned': pos !== null }"
    :style="panelStyle"
    aria-label="LOL 助手增强"
  >
    <header
      class="panel-head"
      :title="collapsed ? '点击展开；按住标题栏可拖动' : '按住标题栏可拖动调整位置'"
      @pointerdown="startDrag"
    >
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
        <p class="account-line">当前账号：<strong>{{ accountName || (uin ? "读取中…" : "未登录") }}</strong></p>
        <div class="area-row">
          <select id="lol-tft-helper-area" v-model.number="areaId">
            <option :value="0">请选择大区</option>
            <option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option>
          </select>
        </div>
        <div class="open-row">
          <button type="button" class="open-self" @click="openSelfPanel">打开自建战绩面板</button>
          <button type="button" class="open-official" :disabled="!areaId" @click="openOfficialCareer">打开官方战绩</button>
        </div>
        <p class="hint">
          <template v-if="uin">
            官方助手页依赖登录态与 TGP 大区。脚本会在页面加载时补 TGP 桥；地址里没有参数时官方页面按当前登录用户展示全部模式战绩。
          </template>
          <template v-else>
            未读取到登录账号：官方页面可能仍提示「未选定大区」。建议先登录，或去官网登录后刷新此页。
          </template>
        </p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { areas } from "../const/areas";
import { readStorage, writeStorage } from "../utils/storage";
import { getSelfUinFromCookie, triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";

const HOME_URL = "https://www.wegame.com.cn/home/";
const AREA_STORAGE_KEY = "lol-tft-helper-area";

const emit = defineEmits<{ authenticated: []; refresh: [] }>();
const { pending, loginError, run, cancel } = useLoginAction();

const collapsed = ref(readStorage<boolean>("helper-collapsed", true));
const pos = ref<{ x: number; y: number } | null>(readStorage<{ x: number; y: number } | null>("helper-pos", null));
const panelEl = ref<HTMLElement | null>(null);
const panelStyle = computed(() => (pos.value ? { left: pos.value.x + "px", top: pos.value.y + "px" } : undefined));

watch(collapsed, (value) => {
  writeStorage("helper-collapsed", value);
  void nextTick(() => {
    if (pos.value) pos.value = clampPosition(pos.value.x, pos.value.y);
  });
});
/** 记住上次选择的大区；首次打开时沿用自建面板记住的 last-area */
const savedArea = Number(readStorage<number | string>(AREA_STORAGE_KEY, 0)) || Number(readStorage<string>("last-area", "")) || 0;
const areaId = ref<number>(Number.isFinite(savedArea) ? savedArea : 0);
const uin = computed(() => getSelfUinFromCookie());
/** 官方页面登录用户名片在浏览器里经常不渲染，这里直接读一次召唤师名做兜底展示 */
const accountName = ref("");

async function loadAccountName(): Promise<void> {
  if (!areaId.value || !uin.value) {
    accountName.value = "";
    return;
  }
  try {
    const res = await fetch("/api/v1/wegame.pallas.game.LolBattle/GetSummonerInfo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "trpc-caller": "wegame.pallas.web.LolBattle" },
      body: JSON.stringify({ area: areaId.value, account_type: 1, id: uin.value, from_src: "lol_helper" })
    });
    const data = (await res.json()) as { summoner?: { name?: string } };
    if (data?.summoner?.name) accountName.value = data.summoner.name;
  } catch {
    /* 读取失败不阻断入口 */
  }
}

watch([areaId, uin], () => {
  void loadAccountName();
}, { immediate: true });

watch(areaId, (value) => {
  writeStorage(AREA_STORAGE_KEY, value);
});

/** 面板位置：默认固定在右下角；拖动后改为 left/top 并记住，展开/收起时重新夹回可视区 */
function clampPosition(x: number, y: number): { x: number; y: number } {
  const el = panelEl.value;
  const width = el?.offsetWidth ?? 0;
  const height = el?.offsetHeight ?? 0;
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - height - 8);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
}

let dragOffset: { x: number; y: number } | null = null;

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("button,a,input,select,label,summary")) return;
  const el = panelEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  pos.value = clampPosition(rect.left, rect.top);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag, { once: true });
  event.preventDefault();
}

function onDragMove(event: PointerEvent): void {
  if (!dragOffset) return;
  pos.value = clampPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
}

function endDrag(): void {
  window.removeEventListener("pointermove", onDragMove);
  if (dragOffset && pos.value) writeStorage("helper-pos", pos.value);
  dragOffset = null;
}

function onViewportResize(): void {
  if (pos.value) pos.value = clampPosition(pos.value.x, pos.value.y);
}

onMounted(() => {
  window.addEventListener("resize", onViewportResize);
  // frame.html 在普通浏览器里不会初始化登录用户：跳到标准助手页（官方云顶页已不再提供入口）
  if (!isStandardHelperPage() && !isWeGameClient()) {
    const suffix = currentPage() === "history" ? "#/life/history" : "#/life/overview";
    location.href = HELPER_ORIGIN + "/helper/lol/" + suffix;
    return;
  }
  // 等官方页面初始化；如果仍提示「未选定大区」，再用 hash 参数兜底
  errorTimer = setTimeout(checkOfficialError, 2500);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onViewportResize);
  window.removeEventListener("pointermove", onDragMove);
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

type OfficialPage = "overview" | "history";
const HELPER_ORIGIN = "https://www.wegame.com.cn";
const STANDARD_HELPER_PATHS = ["/helper/lol/", "/helper/lol/index.html"];
const PAGE_ROUTES: Record<OfficialPage, string> = {
  overview: "#/life/overview",
  history: "#/life/history"
};

function isStandardHelperPage(): boolean {
  return STANDARD_HELPER_PATHS.includes(location.pathname);
}

/** WeGame 客户端内嵌页（UA 带 WeGame/）才走 frame.html；普通浏览器统一用标准助手页 */
function isWeGameClient(): boolean {
  return /WeGame\//.test(navigator.userAgent || "");
}

function currentPage(): OfficialPage | null {
  const hash = location.hash || "";
  if (hash.startsWith("#/life/history")) return "history";
  if (hash.startsWith("#/life/overview")) return "overview";
  return null;
}

/** 参数兜底：官方页面仍报「未选定大区」时，用 uin/area_id/account_type 指定查询对象 */
function officialCareerHash(page: OfficialPage): string {
  const query = new URLSearchParams();
  if (uin.value) query.set("uin", uin.value);
  query.set("area_id", String(areaId.value));
  query.set("account_type", "1");
  return PAGE_ROUTES[page] + "?" + query.toString();
}

/** 标准助手页的本人模式地址：不带参数，让官方按登录用户（TGP 桥）初始化 */
function selfCareerUrl(page: OfficialPage): string {
  return HELPER_ORIGIN + "/helper/lol/" + PAGE_ROUTES[page];
}

function officialCareerUrl(page: OfficialPage): string {
  return HELPER_ORIGIN + "/helper/lol/" + officialCareerHash(page);
}

let fallbackApplied = false;
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function checkOfficialError(): void {
  if (fallbackApplied) return;
  const text = (document.body && (document.body.innerText || document.body.textContent)) || "";
  if (!/未选定大区|请选定大区后重试/.test(text)) return;
  const page = currentPage();
  if (!page || !areaId.value || !uin.value) return;
  fallbackApplied = true;
  location.href = officialCareerUrl(page);
}

/**
 * 优先本人模式：脚本 document-start 注入的 TGP 桥让官方按当前账号加载；
 * 只有官方仍显示「未选定大区」时，才退回 hash 参数兜底。
 */
function openOfficial(page: OfficialPage): void {
  if (!areaId.value) return;
  if (isWeGameClient()) {
    location.hash = PAGE_ROUTES[page];
    return;
  }
  location.href = selfCareerUrl(page);
}

function openOfficialCareer(): void {
  openOfficial("overview");
}

/** 打开脚本自建的战绩面板；官方助手页不显示悬浮按钮，由这里提供唯一入口 */
function openSelfPanel(): void {
  const api = (window as unknown as { __LOL_TFT__?: { open?: () => void } }).__LOL_TFT__;
  if (api && typeof api.open === "function") {
    api.open();
    return;
  }
  window.open("https://www.wegame.com.cn/", "_blank", "noopener");
}
</script>
