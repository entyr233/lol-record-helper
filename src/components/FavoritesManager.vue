<template>
  <div class="favorites-manager-backdrop" role="presentation" @click.self="close">
    <section
      class="favorites-manager"
      role="dialog"
      aria-modal="true"
      aria-labelledby="favorites-manager-title"
      @keydown.esc.stop="close"
    >
      <div class="favorites-manager-head">
        <div>
          <h2 id="favorites-manager-title">收藏管理</h2>
          <p class="favorites-manager-count">
            {{ favorites.length }} / {{ MAX_FAVORITES }} 位玩家
            <span class="favorites-manager-hint">只保存在本机浏览器</span>
          </p>
        </div>
        <button ref="closeRef" type="button" class="favorites-manager-close" title="关闭" aria-label="关闭收藏管理" @click="close">×</button>
      </div>

      <div class="favorites-manager-toolbar">
        <input v-model.trim="query" type="search" class="favorites-manager-search" placeholder="搜索昵称、备注或分组" aria-label="搜索收藏" />
        <select v-model="sortMode" class="favorites-manager-select" aria-label="收藏排序">
          <option value="manual">手动顺序</option>
          <option value="recent">最近查看</option>
          <option value="name">按昵称</option>
          <option value="area">按大区</option>
          <option value="level">按等级</option>
        </select>
        <button type="button" class="favorites-manager-action" @click="exportFavorites">导出</button>
        <button type="button" class="favorites-manager-action" @click="pickImportFile">导入</button>
        <select v-model="importMode" class="favorites-manager-select" aria-label="导入方式">
          <option value="merge">合并</option>
          <option value="replace">覆盖</option>
        </select>
        <input ref="fileInput" type="file" accept="application/json,.json" class="favorites-manager-file" @change="onFileChange" />
      </div>

      <p v-if="notice" class="favorites-manager-notice" role="status">{{ notice }}</p>

      <div class="favorites-manager-body">
        <p v-if="!favorites.length" class="favorites-manager-empty">还没有收藏。在搜索结果或玩家资料页点击收藏按钮即可加入。</p>
        <p v-else-if="!sortedFavorites.length" class="favorites-manager-empty">没有匹配的收藏。</p>
        <div v-for="group in groupedFavorites" :key="group.key" class="favorites-manager-group">
          <div
            class="favorites-manager-group-head"
            @dragover.prevent
            @drop="dropOnGroup(group.key)"
          >
            <button type="button" class="favorites-manager-group-toggle" @click="toggleGroup(group.key)">
              <span class="favorites-manager-caret">{{ isCollapsed(group.key) ? "▸" : "▾" }}</span>
              {{ group.label }}
              <span class="favorites-manager-group-count">{{ group.entries.length }}</span>
            </button>
            <template v-if="group.key">
              <button type="button" class="favorites-manager-mini" title="分组上移" @click="moveGroup(group.key, -1)">↑</button>
              <button type="button" class="favorites-manager-mini" title="分组下移" @click="moveGroup(group.key, 1)">↓</button>
              <template v-if="renamingGroup === group.key">
                <input
                  v-model.trim="renameGroupDraft"
                  class="favorites-manager-inline-input"
                  :aria-label="'重命名分组 ' + group.label"
                  placeholder="新分组名"
                  @keydown.enter.prevent="saveRenameGroup"
                  @keydown.esc="cancelRenameGroup"
                />
                <button type="button" class="favorites-manager-mini" @click="saveRenameGroup">保存</button>
                <button type="button" class="favorites-manager-mini" @click="cancelRenameGroup">取消</button>
              </template>
              <template v-else>
                <button type="button" class="favorites-manager-mini" @click="startRenameGroup(group.key)">重命名</button>
                <button type="button" class="favorites-manager-mini" @click="removeGroup(group.key)">解散分组</button>
              </template>
            </template>
          </div>

          <ul v-show="!isCollapsed(group.key)" class="favorites-manager-list">
            <li
              v-for="entry in group.entries"
              :key="favoriteKey(entry)"
              class="favorites-manager-row"
              :class="{ 'favorites-manager-row--dragging': draggingKey === favoriteKey(entry) }"
              @dragover.prevent
              @drop.stop="dropOnRow(entry)"
            >
              <div
                class="favorites-manager-drag"
                draggable="true"
                title="拖动排序"
                @dragstart="startRowDrag(entry, $event)"
                @dragend="endRowDrag"
              >
                <input
                  type="checkbox"
                  class="favorites-manager-check"
                  :checked="selectedKeys.includes(favoriteKey(entry))"
                  :aria-label="'选择 ' + entry.name"
                  @change="toggleSelected(favoriteKey(entry))"
                />
                <button type="button" class="favorites-manager-open" @click="openFavorite(entry)">
                  <span class="favorites-manager-name">
                    {{ entry.name }}
                    <span v-if="entry.pinned" class="favorites-manager-pin" title="已置顶"><StarIcon filled /></span>
                  </span>
                  <span class="favorites-manager-meta">
                    {{ getAreaName(entry.area) }}
                    <template v-if="entry.lastRank"> · {{ entry.lastRank }}</template>
                    <template v-if="entry.level"> · Lv.{{ entry.level }}</template>
                    <template v-if="entry.lastSeenAt"> · {{ formatLastSeen(entry.lastSeenAt) }}</template>
                  </span>
                  <span v-if="entry.note" class="favorites-manager-note">{{ entry.note }}</span>
                </button>
              </div>

              <template v-if="editingGroupKey === favoriteKey(entry)">
                <input
                  v-model.trim="groupDraft"
                  class="favorites-manager-inline-input"
                  :aria-label="'设置 ' + entry.name + ' 的分组'"
                  placeholder="分组名"
                  @keydown.enter.prevent="saveGroup(entry)"
                  @keydown.esc="cancelGroupEdit"
                />
                <button type="button" class="favorites-manager-mini" @click="saveGroup(entry)">保存</button>
                <button type="button" class="favorites-manager-mini" @click="cancelGroupEdit">取消</button>
              </template>
              <template v-else-if="editingNoteKey === favoriteKey(entry)">
                <input
                  v-model="noteDraft"
                  class="favorites-manager-inline-input"
                  :aria-label="'备注 ' + entry.name"
                  placeholder="备注"
                  maxlength="80"
                  @keydown.enter.prevent="saveNote(entry)"
                  @keydown.esc="cancelNoteEdit"
                />
                <button type="button" class="favorites-manager-mini" @click="saveNote(entry)">保存</button>
                <button type="button" class="favorites-manager-mini" @click="cancelNoteEdit">取消</button>
              </template>
              <template v-else>
                <button type="button" class="favorites-manager-row-action" title="设置分组" @click="startGroupEdit(entry)">分组</button>
                <button type="button" class="favorites-manager-row-action" title="编辑备注" @click="startNoteEdit(entry)">备注</button>
                <button type="button" class="favorites-manager-row-action" :title="entry.pinned ? '取消置顶' : '置顶'" @click="togglePinned(entry)">
                  {{ entry.pinned ? "取消置顶" : "置顶" }}
                </button>
                <button
                  type="button"
                  class="favorites-manager-row-action"
                  :disabled="sortMode !== 'manual'"
                  :title="sortMode === 'manual' ? '上移' : '切换到手动顺序后可调整'"
                  @click="moveInGroup(entry, -1)"
                >↑</button>
                <button
                  type="button"
                  class="favorites-manager-row-action"
                  :disabled="sortMode !== 'manual'"
                  :title="sortMode === 'manual' ? '下移' : '切换到手动顺序后可调整'"
                  @click="moveInGroup(entry, 1)"
                >↓</button>
                <button type="button" class="favorites-manager-row-action favorites-manager-row-remove" title="删除收藏" @click="removeOne(entry)">删除</button>
              </template>
            </li>
          </ul>
        </div>
      </div>

      <div class="favorites-manager-foot">
        <label class="favorites-manager-select-all">
          <input type="checkbox" :checked="allVisibleSelected" :disabled="!sortedFavorites.length" @change="toggleSelectAll" />
          全选当前
        </label>
        <button type="button" class="favorites-manager-action" :disabled="!selectedKeys.length" @click="removeSelected">删除选中（{{ selectedKeys.length }}）</button>
        <button type="button" class="favorites-manager-action favorites-manager-danger" :disabled="!favorites.length" @click="clearAll">清空全部</button>
        <span class="favorites-manager-foot-spacer"></span>
        <span class="favorites-manager-tip">拖动行可排序；也可用 ↑/↓ 按钮</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import StarIcon from "./StarIcon.vue";
import { getAreaName } from "../const/areas";
import {
  MAX_FAVORITES,
  favoriteKey,
  useFavorites
} from "../composables/useFavorites";import type { FavoriteEntry, FavoriteImportMode } from "../composables/useFavorites";
import { readStorage, writeStorage } from "../utils/storage";

type SortMode = "manual" | "recent" | "name" | "area" | "level";

interface GroupView {
  key: string;
  label: string;
  entries: FavoriteEntry[];
}

const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const { favorites, remove, update, setGroup, renameGroup, deleteGroup, move, clear, exportData, importData } = useFavorites();

const closeRef = ref<HTMLButtonElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const sortMode = ref<SortMode>(readStorage<SortMode>("favorites-sort", "manual"));
const importMode = ref<FavoriteImportMode>("merge");
const notice = ref("");
const selectedKeys = ref<string[]>([]);
const collapsedGroups = ref<Record<string, boolean>>(readStorage<Record<string, boolean>>("favorites-collapsed", {}));
const groupOrder = ref<string[]>(readStorage<string[]>("favorites-group-order", []));
const editingGroupKey = ref("");
const groupDraft = ref("");
const editingNoteKey = ref("");
const noteDraft = ref("");
const renamingGroup = ref("");
const renameGroupDraft = ref("");
const draggingKey = ref("");

watch(sortMode, (value) => writeStorage("favorites-sort", value));
watch(collapsedGroups, (value) => writeStorage("favorites-collapsed", value), { deep: true });
watch(groupOrder, (value) => writeStorage("favorites-group-order", value), { deep: true });

const filteredFavorites = computed(() => {
  const keyword = query.value.toLowerCase();
  if (!keyword) return favorites.value;
  return favorites.value.filter((entry) => {
    const haystack = [
      entry.name,
      entry.note,
      entry.group,
      entry.lastRank,
      getAreaName(entry.area),
      entry.id
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
});

const sortedFavorites = computed(() => {
  const list = filteredFavorites.value.slice();
  if (sortMode.value === "recent") {
    list.sort((a, b) => (b.lastSeenAt ?? b.savedAt) - (a.lastSeenAt ?? a.savedAt));
  } else if (sortMode.value === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  } else if (sortMode.value === "area") {
    list.sort((a, b) => a.area - b.area || a.name.localeCompare(b.name, "zh-CN"));
  } else if (sortMode.value === "level") {
    list.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  }
  // 置顶始终排在最前；sort 稳定，同一分组内保持当前排序结果。
  return list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
});

const groupedFavorites = computed<GroupView[]>(() => {
  const groups = new Map<string, FavoriteEntry[]>();
  for (const entry of sortedFavorites.value) {
    const key = (entry.group || "").trim();
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  const result: GroupView[] = [];
  for (const [key, entries] of groups) {
    if (!key) continue;
    result.push({ key, label: key, entries });
  }
  const order = groupOrder.value;
  result.sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    if (ai < 0 && bi < 0) return 0;
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
  const ungrouped = groups.get("");
  if (ungrouped?.length) result.push({ key: "", label: "未分组", entries: ungrouped });
  return result;
});

const allVisibleSelected = computed(() => {
  if (!sortedFavorites.value.length) return false;
  return sortedFavorites.value.every((entry) => selectedKeys.value.includes(favoriteKey(entry)));
});

function setNotice(message: string): void {
  notice.value = message;
}

function close(): void {
  emit("close");
}

function isCollapsed(key: string): boolean {
  return collapsedGroups.value[key] === true;
}

function toggleGroup(key: string): void {
  collapsedGroups.value = { ...collapsedGroups.value, [key]: !isCollapsed(key) };
}

/** 把当前出现的分组补进顺序表，并清掉已经不存在的组名。 */
function ensureGroupOrder(): void {
  const names = Array.from(new Set(
    favorites.value.map((entry) => (entry.group || "").trim()).filter(Boolean)
  ));
  const next: string[] = [];
  for (const name of groupOrder.value) {
    if (names.includes(name) && !next.includes(name)) next.push(name);
  }
  for (const name of names) {
    if (!next.includes(name)) next.push(name);
  }
  groupOrder.value = next;
}

function moveGroup(name: string, delta: -1 | 1): void {
  ensureGroupOrder();
  const order = groupOrder.value.slice();
  const index = order.indexOf(name);
  if (index < 0) return;
  const target = Math.max(0, Math.min(order.length - 1, index + delta));
  if (target === index) return;
  const [moved] = order.splice(index, 1);
  if (!moved) return;
  order.splice(target, 0, moved);
  groupOrder.value = order;
}

function toggleSelected(key: string): void {
  if (selectedKeys.value.includes(key)) selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
  else selectedKeys.value = [...selectedKeys.value, key];
}

function toggleSelectAll(): void {
  if (allVisibleSelected.value) {
    const visible = new Set(sortedFavorites.value.map((entry) => favoriteKey(entry)));
    selectedKeys.value = selectedKeys.value.filter((key) => !visible.has(key));
    return;
  }
  const merged = new Set(selectedKeys.value);
  for (const entry of sortedFavorites.value) merged.add(favoriteKey(entry));
  selectedKeys.value = Array.from(merged);
}

function openFavorite(entry: FavoriteEntry): void {
  update(favoriteKey(entry), { lastSeenAt: Date.now() });
  void router.push({
    name: "summary",
    params: { area: String(entry.area), accountType: entry.accountType || "2", id: entry.id }
  });
  close();
}

function removeOne(entry: FavoriteEntry): void {
  remove(favoriteKey(entry));
  selectedKeys.value = selectedKeys.value.filter((key) => key !== favoriteKey(entry));
  setNotice(`已删除收藏：${entry.name}`);
}

function removeSelected(): void {
  for (const key of selectedKeys.value) remove(key);
  const count = selectedKeys.value.length;
  selectedKeys.value = [];
  setNotice(`已删除 ${count} 条收藏`);
}

function clearAll(): void {
  if (!favorites.value.length) return;
  if (!window.confirm(`确定清空全部 ${favorites.value.length} 条收藏？此操作不可撤销。`)) return;
  clear();
  selectedKeys.value = [];
  setNotice("已清空全部收藏");
}

function startGroupEdit(entry: FavoriteEntry): void {
  editingGroupKey.value = favoriteKey(entry);
  groupDraft.value = entry.group || "";
  editingNoteKey.value = "";
}

function saveGroup(entry: FavoriteEntry): void {
  setGroup([favoriteKey(entry)], groupDraft.value);
  ensureGroupOrder();
  editingGroupKey.value = "";
  setNotice(`已更新分组：${entry.name}`);
}

function cancelGroupEdit(): void {
  editingGroupKey.value = "";
  groupDraft.value = "";
}

function startNoteEdit(entry: FavoriteEntry): void {
  editingNoteKey.value = favoriteKey(entry);
  noteDraft.value = entry.note || "";
  editingGroupKey.value = "";
}

function saveNote(entry: FavoriteEntry): void {
  update(favoriteKey(entry), { note: noteDraft.value });
  editingNoteKey.value = "";
  setNotice(`已更新备注：${entry.name}`);
}

function cancelNoteEdit(): void {
  editingNoteKey.value = "";
  noteDraft.value = "";
}

function togglePinned(entry: FavoriteEntry): void {
  update(favoriteKey(entry), { pinned: !entry.pinned });
}

function startRenameGroup(name: string): void {
  renamingGroup.value = name;
  renameGroupDraft.value = name;
}

function saveRenameGroup(): void {
  const from = renamingGroup.value;
  if (!from) return;
  renameGroup(from, renameGroupDraft.value);
  const to = renameGroupDraft.value.trim();
  if (to && to !== from) {
    const index = groupOrder.value.indexOf(from);
    if (index >= 0) groupOrder.value = groupOrder.value.map((name) => (name === from ? to : name));
  }
  ensureGroupOrder();
  renamingGroup.value = "";
  setNotice(`已重命名分组：${from}`);
}

function cancelRenameGroup(): void {
  renamingGroup.value = "";
  renameGroupDraft.value = "";
}

function removeGroup(name: string): void {
  if (!window.confirm(`解散分组「${name}」？组内收藏会移到「未分组」，不会被删除。`)) return;
  deleteGroup(name);
  groupOrder.value = groupOrder.value.filter((item) => item !== name);
  setNotice(`已解散分组：${name}`);
}

/** 手动顺序下，只在同一分组内找相邻项，避免跨组拖动。 */
function moveInGroup(entry: FavoriteEntry, delta: -1 | 1): void {
  if (sortMode.value !== "manual") return;
  const group = (entry.group || "").trim();
  const siblings = favorites.value.filter((item) => (item.group || "").trim() === group);
  const index = siblings.findIndex((item) => favoriteKey(item) === favoriteKey(entry));
  const target = siblings[index + delta];
  if (!target) return;
  move(favoriteKey(entry), favoriteKey(target));
}

function startRowDrag(entry: FavoriteEntry, event: DragEvent): void {
  draggingKey.value = favoriteKey(entry);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggingKey.value);
  }
}

function endRowDrag(): void {
  draggingKey.value = "";
}

function dropOnRow(target: FavoriteEntry): void {
  const from = draggingKey.value;
  draggingKey.value = "";
  if (!from || from === favoriteKey(target)) return;
  setGroup([from], target.group || "");
  move(from, favoriteKey(target));
  ensureGroupOrder();
  setNotice(`已移动到分组：${target.group || "未分组"}`);
}

function dropOnGroup(groupKey: string): void {
  const from = draggingKey.value;
  draggingKey.value = "";
  if (!from) return;
  setGroup([from], groupKey);
  ensureGroupOrder();
  setNotice(`已移动到分组：${groupKey || "未分组"}`);
}

function formatLastSeen(timestamp: number): string {
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return "刚刚查看";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前查看`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours} 小时前查看`;
  return `${Math.floor(hours / 24)} 天前查看`;
}

async function exportFavorites(): Promise<void> {
  const blob = new Blob([exportData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lol-tft-favorites-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setNotice("已导出收藏 JSON");
}

function pickImportFile(): void {
  fileInput.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const raw = await file.text();
    const result = importData(raw, importMode.value);
    ensureGroupOrder();
    setNotice(result.error ?? `导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条`);
    selectedKeys.value = [];
  } catch {
    setNotice("读取导入文件失败");
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
