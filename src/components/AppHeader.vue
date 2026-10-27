<template>
  <header class="app-header">
    <select v-model="selectedArea" class="area-select" aria-label="选择区服">
      <option value="" disabled>选择区服</option>
      <option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option>
    </select>

    <span class="header-divider"></span>
    <button v-if="currentArea" type="button" class="header-button" :disabled="loggingIn" @click="goSelf">我的战绩</button>
    <span class="header-divider"></span>
    <span class="header-divider"></span>
    <button v-if="loggedIn" type="button" class="header-button" @click="handleLogout">注销</button>
    <button v-else type="button" class="header-button header-button--login" :disabled="loggingIn" @click="handleLogin">
      {{ loggingIn ? "等待登录…" : "登录" }}
    </button>
    <button v-if="loggingIn" type="button" class="header-button" @click="cancel">取消等待</button>
    <span v-if="loginError" role="alert" class="login-error">{{ loginError }}</span>
    <button
      v-if="loginError || loggingIn"
      type="button"
      class="header-button"
      @click="openLink(LOGIN_PAGE_URL)"
    >
      去官网登录页 ↗
    </button>

    <span class="header-spacer"></span>

    <details ref="favoritesDetails" class="header-favorites">
      <summary>收藏 {{ favorites.length }}</summary>
      <div class="favorites-pop">
        <p v-if="!favorites.length" class="favorites-empty">还没有常看玩家</p>
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
                <span class="favorite-area">{{ getAreaName(f.area) }}</span>
                <span v-if="f.note" class="favorite-note">{{ f.note }}</span>
              </button>
              <input
                v-if="noteEditingKey === favoriteKey(f)"
                class="favorite-note-input"
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
      </div>
    </details>

    <form class="header-search" @submit.prevent="search">
      <input v-model.trim="keyword" type="search" placeholder="搜索召唤师" aria-label="搜索召唤师" />
    </form>

    <span class="header-spacer"></span>

    <a class="header-link" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer" title="项目 GitHub 主页">GitHub ↗</a>
    <span class="header-version" title="脚本版本">v{{ version }}</span>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { areas, getAreaName } from "../const/areas";
import { favoriteKey, useFavorites } from "../composables/useFavorites";
import type { FavoriteEntry } from "../composables/useFavorites";
import { readStorage, writeStorage } from "../utils/storage";
import { getLoginUser, getSelfUinFromCookie, hasLoginState, logout, triggerLogin, waitForLogin } from "../utils/weGameLogin";
import { useLoginAction } from "../composables/useLoginAction";

const LOGIN_PAGE_URL = "https://www.wegame.com.cn/home/";
const GITHUB_URL = "https://github.com/entyr233/lol-tft";
const version = __APP_VERSION__;

const route = useRoute();
const router = useRouter();

const selectedArea = ref<number | "">(0);
const keyword = ref("");
const loggedIn = ref(false);
const { pending: loggingIn, loginError, run, cancel } = useLoginAction();

// 常驻收藏入口：与各页面共用同一份 useFavorites 单例数据
const favoritesDetails = ref<HTMLDetailsElement | null>(null);
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

function openFavorite(entry: FavoriteEntry): void {
  closeFavorites();
  void router.push({
    name: "summary",
    params: { area: String(entry.area), accountType: entry.accountType || "2", id: entry.id }
  });
}

function removeFavorite(entry: FavoriteEntry): void {
  removeFavoriteEntry(favoriteKey(entry));
}

watch(selectedArea, (area) => rememberArea(String(area)));

const currentArea = computed(() => {
  const fromRoute = route.params.area;
  if (fromRoute) return String(fromRoute);
  // 掌盟查询等无区服参数的页面：用上次选择过的大区，保证「我的战绩」按钮不消失
  return readStorage<string>("last-area", "");
});

onMounted(() => {
  // 登录状态以 cookie 为准。
  loggedIn.value = hasLoginState();
  // 记住过区服且登录态在 → 直接落地自己的战绩页（刷新后不再退回「请先选择区服」）
  const lastArea = readStorage<string>("last-area", "");
  if (lastArea && !route.params.area && hasLoginState()) {
    void router.push({ name: "area", params: { area: lastArea } });
  }
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

watch(() => route.params.area, (value) => {
  if (value) selectedArea.value = Number(value) || 0;
  loggedIn.value = hasLoginState();
});

function search(): void {
  if (!keyword.value) return;
  void router.push({ name: "search", params: { nickname: keyword.value } });
}

async function showSelf(user: { uin: string }, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  loggedIn.value = true;
  if (selectedArea.value) {
    await router.replace({ name: "summary", params: { area: String(selectedArea.value), accountType: "1", id: user.uin } });
  }
}

function rememberArea(area: string): void {
  if (area) writeStorage("last-area", area);
}

function goSelf(): Promise<void> {
  const area = String(selectedArea.value || currentArea.value || "");
  if (!area) return Promise.resolve();
  rememberArea(area);
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
