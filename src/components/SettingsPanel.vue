<template>
  <div class="favorites-manager-backdrop" role="presentation" @click.self="close">
    <section
      class="favorites-manager settings-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-title"
      @keydown.esc.stop="close"
    >
      <div class="favorites-manager-head">
        <div>
          <h2 id="settings-panel-title">设置与数据</h2>
          <p class="favorites-manager-count">
            v{{ version }}
            <span class="favorites-manager-hint">只管理本机浏览器中的数据</span>
          </p>
        </div>
        <button ref="closeRef" type="button" class="favorites-manager-close" title="关闭" aria-label="关闭设置" @click="close">×</button>
      </div>

      <div class="settings-body">
        <p v-if="notice" class="favorites-manager-notice" role="status">{{ notice }}</p>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>本机数据</h3>
            <span>约 {{ formatBytes(totalBytes) }}</span>
          </div>
          <p class="settings-hint">清理缓存不会退出登录，也不会修改 WeGame 账号数据。</p>
          <div v-for="category in categories" :key="category.id" class="settings-row">
            <div class="settings-meta">
              <strong>{{ category.label }}</strong>
              <small>{{ category.description }}</small>
              <small>{{ categoryMeta(category) }} · {{ formatBytes(category.bytes) }}</small>
            </div>
            <button
              type="button"
              class="favorites-manager-mini"
              :disabled="category.id === 'battle' ? false : category.keys.length === 0"
              @click="clearCategory(category)"
            >清理</button>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>收藏与诊断</h3>
          </div>
          <div class="settings-actions">
            <button type="button" class="favorites-manager-action" @click="emit('openFavorites')">打开收藏管理</button>
            <button type="button" class="favorites-manager-action" @click="copyDiagnostics">复制诊断信息</button>
            <button type="button" class="favorites-manager-action favorites-manager-danger" @click="clearAll">清空全部本地数据</button>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>诊断信息</h3>
          </div>
          <pre class="settings-diagnostic" tabindex="0" aria-label="诊断信息">{{ diagnostics }}</pre>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { clearAramggApiKey, clearAramggCache, hasAramggApiKey, isAramggApiKeySessionOnly } from "../api/aramgg";
import { clearStaticDataCache } from "../api/staticData";
import { clearBattleFeedCache } from "../composables/useBattleFeed";
import { clearBattleDetailCache } from "../composables/useBattleDetail";
import { useFavorites } from "../composables/useFavorites";
import { useRecentPlayers } from "../composables/useRecentPlayers";
import { useSearchHistory } from "../composables/useSearchHistory";
import {
  MEMORY_ONLY_CATEGORY,
  formatBytes,
  listLocalDataCategories,
  removeAllLocalData,
  removeLocalDataCategory
} from "../utils/localData";
import type { LocalDataCategoryId } from "../utils/localData";

type SettingsCategoryId = LocalDataCategoryId | "battle";

interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  keys: string[];
  bytes: number;
}

const emit = defineEmits<{ close: []; openFavorites: [] }>();
const version = __APP_VERSION__;
const closeRef = ref<HTMLButtonElement | null>(null);
const notice = ref("");
const inventoryVersion = ref(0);

const { favorites, clear: clearFavorites } = useFavorites();
const { recentPlayers, clear: clearRecentPlayers } = useRecentPlayers();
const { historyNames, clear: clearSearchHistory } = useSearchHistory();

const categories = computed<SettingsCategory[]>(() => {
  void inventoryVersion.value;
  void favorites.value.length;
  void recentPlayers.value.length;
  void historyNames.value.length;
  return [
    { ...MEMORY_ONLY_CATEGORY, keys: [], bytes: 0 },
    ...listLocalDataCategories()
  ];
});

const totalBytes = computed(() => categories.value.reduce((sum, category) => sum + category.bytes, 0));

const diagnostics = computed(() => {
  const lines = [
    "LOL 战绩助手 v" + version,
    "URL: " + location.href,
    "UA: " + navigator.userAgent,
    "本地数据:"
  ];
  for (const category of categories.value) {
    lines.push("- " + category.label + ": " + formatBytes(category.bytes) + " / " + category.keys.length + " 个键");
  }
  return lines.join("\n");
});

function categoryMeta(category: SettingsCategory): string {
  switch (category.id) {
    case "battle":
      return "内存缓存";
    case "favorites":
      return favorites.value.length + " 位玩家";
    case "recent":
      return recentPlayers.value.length + " 位玩家";
    case "search":
      return historyNames.value.length + " 条昵称";
    case "aramgg-cache":
      return category.keys.length + " 个缓存键";
    case "aramgg-key":
      return hasAramggApiKey() ? (isAramggApiKeySessionOnly() ? "已配置（仅本次会话）" : "已配置") : "未配置";
    case "static":
      return category.keys.length + " 项";
    case "preferences":
      return category.keys.length + " 项";
    default:
      return category.keys.length + " 个键";
  }
}

function setNotice(message: string): void {
  notice.value = message;
}

function close(): void {
  emit("close");
}

function clearCategory(category: SettingsCategory): void {
  switch (category.id) {
    case "battle":
      clearBattleFeedCache();
      clearBattleDetailCache();
      setNotice("已清理战绩内存缓存");
      break;
    case "favorites":
      if (!window.confirm(`清空全部 ${favorites.value.length} 位收藏？`)) return;
      clearFavorites();
      removeLocalDataCategory("favorites");
      setNotice("已清空收藏");
      break;
    case "recent":
      clearRecentPlayers();
      removeLocalDataCategory("recent");
      setNotice("已清空最近查看");
      break;
    case "search":
      clearSearchHistory();
      removeLocalDataCategory("search");
      setNotice("已清空搜索历史");
      break;
    case "aramgg-cache":
      clearAramggCache();
      setNotice("已清理海克斯数据缓存");
      break;
    case "aramgg-key":
      clearAramggApiKey();
      setNotice("已清除海克斯 API Key");
      break;
    case "static":
      clearStaticDataCache();
      setNotice("已清理静态资料缓存");
      break;
    case "preferences":
      removeLocalDataCategory("preferences");
      setNotice("已清理界面偏好，刷新页面后部分状态会重置");
      break;
  }
  inventoryVersion.value += 1;
}

function clearAll(): void {
  if (!window.confirm("确定清空全部本地数据？收藏、最近查看、搜索历史和缓存都会删除，且不可撤销。")) return;
  clearBattleFeedCache();
  clearBattleDetailCache();
  clearAramggCache();
  clearAramggApiKey();
  clearStaticDataCache();
  clearFavorites();
  clearRecentPlayers();
  clearSearchHistory();
  removeAllLocalData();
  inventoryVersion.value += 1;
  setNotice("已清空全部本地数据");
}

async function copyDiagnostics(): Promise<void> {
  try {
    await navigator.clipboard.writeText(diagnostics.value);
    setNotice("诊断信息已复制");
  } catch {
    setNotice("复制失败，请检查浏览器剪贴板权限");
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
}

onMounted(() => {
  void nextTick(() => closeRef.value?.focus());
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>
