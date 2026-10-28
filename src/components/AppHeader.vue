<template>
  <header class="app-header">
    <span class="header-brand"><span aria-hidden="true" class="header-brand-mark">L</span> 战绩助手</span>
    <nav class="header-nav" aria-label="主要页面">
      <button type="button" class="header-button" :class="{ 'header-button--active': route.name === 'summary' }"
        :disabled="!currentArea || loggingIn" @click="goSelf">我的战绩</button>
      <router-link class="header-button" :to="{ name: 'aram' }" title="海克斯大乱斗数据（ARAMGG）">海克斯数据</router-link>
    </nav>
    <form class="header-search" @submit.prevent="search">
      <select :value="selectedArea" class="area-select" aria-label="选择区服" @change="selectArea">
        <option value="" disabled>选择区服</option>
        <option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option>
      </select>
      <input v-model.trim="keyword" type="search" placeholder="搜索召唤师" aria-label="搜索召唤师" />
      <button type="submit" class="header-search-submit" aria-label="提交召唤师搜索" title="搜索">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      </button>
    </form>

    <details ref="favoritesDetails" class="header-favorites">
      <summary>收藏 {{ favorites.length }}</summary>
      <div class="favorites-pop">
        <p v-if="!favorites.length" class="favorites-empty">还没有收藏玩家</p>
        <template v-else>
          <div v-for="group in favoriteGroups" :key="group.name" class="favorite-group">
            <p class="favorite-group-title">{{ group.name }}</p>
            <div
              v-for="f in group.entries"
              :key="favoriteKey(f)"
              class="favorite-row"
              :class="{ 'favorite-row--dragging': draggingKey === favoriteKey(f) }"
              draggable="true"
              @dragstart="startDrag(f, $event)"
              @dragend="endDrag"
              @dragover.prevent
              @drop="dropOn(f, $event)"
            >
              <button type="button" class="favorite-open" @click="openFavorite(f)">
                <span class="favorite-name">{{ f.name }}</span>
                <span class="favorite-area">
                  {{ getAreaName(f.area) }}
                  <template v-if="f.lastRank"> · {{ f.lastRank }}</template>
                </span>
                <span v-if="f.note" class="favorite-note">{{ f.note }}</span>
              </button>
              <input
                v-if="noteEditingKey === favoriteKey(f)"
                class="favorite-note-input"
                :aria-label="'备注：' + f.name"
                :value="f.note"
                placeholder="备注（回车保存）"
                @input="noteDraft = ($event.target as HTMLInputElement).value"
                @keydown.enter.prevent="saveNote(f)"
                @keydown.esc="cancelNote"
                @blur="saveNote(f)"
              />
              <button v-else type="button" class="favorite-note-edit" title="编辑备注" @click="startEditNote(f)">✎</button>
              <button type="button" class="favorite-remove" :title="'取消收藏：' + f.name" @click="removeFavorite(f)">×</button>
            </div>
          </div>
        </template>
        <button type="button" class="favorites-manage-button" @click="openManager">管理收藏…</button>
      </div>
    </details>

    <button v-if="loggedIn" type="button" class="header-link" @click="handleLogout">注销</button>
    <button v-else type="button" class="header-button header-button--login" :disabled="loggingIn" @click="handleLogin">
      {{ loggingIn ? "等待登录…" : "登录" }}
    </button>
    <details class="header-more">
      <summary>更多</summary>
      <div class="header-more-pop">
        <a class="header-link" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        <a class="header-link" :href="officialHelperUrl" target="_blank" rel="noopener noreferrer" title="官方 LOL 助手（同一账号与大区）">官方助手 ↗</a>
        <span class="header-version" title="脚本版本">v{{ version }}</span>
      </div>
    </details>
    <button type="button" class="header-link header-settings-link" title="设置与数据" @click="openSettings">设置</button>
    <div v-if="loginError || loggingIn" class="header-login-status" role="status">
      <span v-if="loginError" role="alert" class="login-error">{{ loginError }}</span>
      <button v-if="loggingIn" type="button" class="header-button" @click="cancel">取消等待</button>
      <button type="button" class="header-button" @click="openLink(LOGIN_PAGE_URL)">去官网登录页 ↗</button>
    </div>

    <FavoritesManager v-if="managerOpen" @close="managerOpen = false" />
    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" @open-favorites="openFavoritesFromSettings" />
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { areas, getAreaName } from "../const/areas";
import { favoriteKey, useFavorites } from "../composables/useFavorites";
import type { FavoriteEntry } from "../composables/useFavorites";
import FavoritesManager from "./FavoritesManager.vue";
import SettingsPanel from "./SettingsPanel.vue";
import { readStorage, writeStorage } from "../utils/storage";
import { getLoginUser, getSelfUinFromCookie, hasLoginState, logout, triggerLogin, waitForLogin } from "../utils/wegameLogin";
import { useLoginAction } from "../composables/useLoginAction";

const LOGIN_PAGE_URL = "https://www.wegame.com.cn/home/";
const GITHUB_URL = "https://github.com/entyr233/lol-record-helper";
const version = __APP_VERSION__;

const route = useRoute();
const router = useRouter();

const selectedArea = ref<number | "">("");
const preferredArea = ref(String(readStorage<string>("last-area", "") || readStorage<number>("area", 0) || ""));
const keyword = ref("");
const loggedIn = ref(false);
const { pending: loggingIn, loginError, run, cancel } = useLoginAction();

// 常驻收藏入口：与各页面共用同一份 useFavorites 单例数据
const favoritesDetails = ref<HTMLDetailsElement | null>(null);
const managerOpen = ref(false);
const settingsOpen = ref(false);
const { favorites, remove: removeFavoriteEntry, update: updateFavorite, move: moveFavorite } = useFavorites();

/** 未设置 group 的条目统一落在这个分组里，并排在所有自定义分组之后 */
const UNGROUPED_LABEL = "未分组";

interface FavoriteGroup {
  name: string;
  entries: FavoriteEntry[];
}

/** 分组展示顺序：自定义分组按首次出现顺序，未分组放最后 */
const favoriteGroups = computed<FavoriteGroup[]>(() => {
  const named = new Map<string, FavoriteEntry[]>();
  const ungrouped: FavoriteEntry[] = [];
  for (const entry of favorites.value) {
    const group = (entry.group || "").trim();
    if (!group) {
      ungrouped.push(entry);
      continue;
    }
    const list = named.get(group);
    if (list) list.push(entry);
    else named.set(group, [entry]);
  }
  const groups: FavoriteGroup[] = Array.from(named, ([name, entries]) => ({ name, entries }));
  if (ungrouped.length) groups.push({ name: UNGROUPED_LABEL, entries: ungrouped });
  for (const group of groups) {
    group.entries.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }
  return groups;
});

// 备注行内编辑：同一时间只展开一行
const noteEditingKey = ref("");
const noteDraft = ref("");

function startEditNote(entry: FavoriteEntry): void {
  noteEditingKey.value = favoriteKey(entry);
  noteDraft.value = entry.note || "";
}

function cancelNote(): void {
  noteEditingKey.value = "";
  noteDraft.value = "";
}

function saveNote(entry: FavoriteEntry): void {
  const key = favoriteKey(entry);
  // 回车收起后紧跟的 blur 不再重复写入
  if (noteEditingKey.value !== key) return;
  noteEditingKey.value = "";
  updateFavorite(key, { note: noteDraft.value });
  noteDraft.value = "";
}

// 拖拽排序：dragstart 记录来源 key，drop 到目标行时调用 move
const draggingKey = ref("");

function startDrag(entry: FavoriteEntry, event: DragEvent): void {
  draggingKey.value = favoriteKey(entry);
  // Firefox 等浏览器只有 setData 后才真正开始拖拽
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggingKey.value);
  }
}

function endDrag(): void {
  draggingKey.value = "";
}

function dropOn(entry: FavoriteEntry, event: DragEvent): void {
  const fromKey = draggingKey.value || event.dataTransfer?.getData("text/plain") || "";
  draggingKey.value = "";
  if (!fromKey) return;
  moveFavorite(fromKey, favoriteKey(entry));
}

function closeFavorites(): void {
  if (favoritesDetails.value) favoritesDetails.value.open = false;
}

function openManager(): void {
  closeFavorites();
  managerOpen.value = true;
}

function openSettings(): void {
  closeFavorites();
  settingsOpen.value = true;
}

function openFavoritesFromSettings(): void {
  settingsOpen.value = false;
  managerOpen.value = true;
}

function openFavorite(entry: FavoriteEntry): void {
  closeFavorites();
  updateFavorite(favoriteKey(entry), { lastSeenAt: Date.now() });
  void router.push({
    name: "summary",
    params: { area: String(entry.area), accountType: entry.accountType || "2", id: entry.id }
  });
}

function removeFavorite(entry: FavoriteEntry): void {
  removeFavoriteEntry(favoriteKey(entry));
}

const currentArea = computed(() => preferredArea.value || String(route.params.area || ""));

/**
 * 官方助手页通过地址栏 uin / area_id / account_type 初始化查询对象，
 * 这里带上当前账号和大区，打开后官方页面能直接查这个玩家的战绩。
 */
const officialHelperUrl = computed(() => {
  const area = currentArea.value;
  if (!area) return "https://www.wegame.com.cn/helper/lol/#/info/selection";
  const query = new URLSearchParams();
  const uin = getSelfUinFromCookie();
  if (uin) query.set("uin", uin);
  query.set("area_id", area);
  query.set("account_type", "1");
  return "https://www.wegame.com.cn/helper/lol/#/life/overview?" + query.toString();
});

onMounted(() => {
  // 登录状态以 cookie 为准。
  loggedIn.value = hasLoginState();
  // 记住过区服且登录态在 → 直接落地自己的战绩页（刷新后不再退回「请先选择区服」）
  const lastArea = preferredArea.value;
  if (lastArea && !route.params.area && hasLoginState()) {
    void router.push({ name: "area", params: { area: lastArea } });
  }
  const fromRoute = route.params.area;
  if (fromRoute) {
    selectedArea.value = Number(fromRoute) || 0;
    return;
  }
  selectedArea.value = Number(preferredArea.value) || "";
});

/** 只有用户主动选择大区时才更新个人常驻大区。 */
function selectArea(event: Event): void {
  const area = (event.target as HTMLSelectElement).value;
  selectedArea.value = Number(area);
  preferredArea.value = area;
  writeStorage("area", Number(area));
  writeStorage("last-area", area);
  void router.replace({ name: "area", params: { area } });
}

watch(() => route.params.area, (value) => {
  selectedArea.value = Number(value || preferredArea.value) || "";
  loggedIn.value = hasLoginState();
});

function search(): void {
  if (!keyword.value) return;
  void router.push({ name: "search", params: { nickname: keyword.value } });
}

async function showSelf(user: { uin: string }, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  loggedIn.value = true;
  if (currentArea.value) {
    await router.replace({ name: "summary", params: { area: currentArea.value, accountType: "1", id: user.uin } });
  }
}

function goSelf(): Promise<void> {
  const area = currentArea.value;
  if (!area) return Promise.resolve();
  // cookie 直达（不碰 SDK）；cookie 缺失才走 SDK 解析（fallback 恢复场景）
  const cookieUin = getSelfUinFromCookie();
  if (cookieUin) {
    return router.push({ name: "summary", params: { area, accountType: "1", id: cookieUin } }).then(() => undefined);
  }
  return run(async (signal) => {
    const user = await getLoginUser({ signal });
    if (signal.aborted) return;
    loggedIn.value = true;
    await router.replace({ name: "summary", params: { area, accountType: "1", id: user.uin } });
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
