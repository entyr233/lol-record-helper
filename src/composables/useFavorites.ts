import { computed, ref, watch } from "vue";
import type { Ref } from "vue";

/** 收藏判定用的三元组：大区 + 账号类型 + 账号标识 */
export interface FavoriteTarget {
  area: number | string;
  accountType: number | string;
  id: string | number;
}

/** 落盘/展示用的收藏条目（读取时会做旧数据迁移，字段类型保持规整） */
export interface FavoriteEntry {
  name: string;
  area: number;
  accountType: string;
  id: string;
  level?: number;
  /** 备注：常看玩家的自定义说明（空字符串按未设置处理，落盘时不出现该字段） */
  note?: string;
  /** 分组名：未设置的归入「未分组」 */
  group?: string;
  /** 置顶：首页和收藏弹层优先展示 */
  pinned?: boolean;
  /** 最近一次打开该玩家页面的时间（毫秒时间戳） */
  lastSeenAt?: number;
  /** 最近一次看到的段位文本，例如「翡翠 · 59 LP」 */
  lastRank?: string;
  savedAt: number;
}

export type FavoriteInput = Omit<FavoriteEntry, "savedAt"> & Partial<Pick<FavoriteEntry, "savedAt">>;

export type FavoriteToggleResult = "added" | "removed" | "full";

export type FavoriteImportMode = "merge" | "replace";

export interface FavoriteImportResult {
  added: number;
  skipped: number;
  error?: string;
}

/** 兼容旧版本的键名：老用户收藏不丢 */
const FAV_KEY = "lol-tft-favorites";
/** 旧版上限 20 会在无提示的情况下挤掉收藏；现在放宽到 100。 */
export const MAX_FAVORITES = 100;

/** 统一 key：大区 + 账号类型（缺省 2）+ 账号标识，全部转字符串后比较 */
export function favoriteKey(target: FavoriteTarget): string {
  return String(target.area) + ":" + String(target.accountType || "2") + ":" + String(target.id);
}

function toAccountType(value: unknown): string {
  return value === undefined || value === null || value === "" ? "2" : String(value);
}

/** 备注/分组这类可选文本：去掉首尾空白，空串视为未设置 */
function toOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function toTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** 把任意来源的条目规整成 FavoriteEntry；缺 id 的条目无法定位玩家，直接丢弃 */
function toFavoriteEntry(raw: unknown): FavoriteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (item.id === undefined || item.id === null || String(item.id) === "") return null;
  const id = String(item.id);
  const entry: FavoriteEntry = {
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : id,
    area: Number(item.area) || 0,
    accountType: toAccountType(item.accountType),
    id,
    savedAt: toTimestamp(item.savedAt) ?? 0
  };
  if (typeof item.level === "number" && Number.isFinite(item.level)) entry.level = item.level;
  const note = toOptionalText(item.note);
  if (note) entry.note = note;
  const group = toOptionalText(item.group);
  if (group) entry.group = group;
  if (item.pinned === true) entry.pinned = true;
  const lastSeenAt = toTimestamp(item.lastSeenAt);
  if (lastSeenAt) entry.lastSeenAt = lastSeenAt;
  const lastRank = toOptionalText(item.lastRank);
  if (lastRank) entry.lastRank = lastRank;
  return entry;
}

/** 迁移旧数据 + 按 favoriteKey 去重（保留先出现的）+ 按当前上限截断 */
function normalizeList(raw: unknown): FavoriteEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: FavoriteEntry[] = [];
  for (const item of raw) {
    const entry = toFavoriteEntry(item);
    if (!entry) continue;
    const key = favoriteKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(entry);
    if (list.length >= MAX_FAVORITES) break;
  }
  return list;
}

function parseList(raw: string | null): FavoriteEntry[] {
  if (!raw) return [];
  try {
    return normalizeList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function loadFavorites(): FavoriteEntry[] {
  try {
    return parseList(localStorage.getItem(FAV_KEY));
  } catch {
    // 隐私模式等场景下 localStorage 不可用
    return [];
  }
}

/** 模块级单例：各组件共享同一份响应式收藏列表 */
const favorites = ref<FavoriteEntry[]>(loadFavorites());

watch(
  favorites,
  (value) => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(value));
    } catch {
      /* 写失败（隐私模式/配额满）静默 */
    }
  },
  { flush: "sync" }
);

/** 其他标签页改动收藏时同步过来；event.key 为 null 表示整个 storage 被清空 */
function applyStored(raw: string | null): void {
  favorites.value = parseList(raw);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== FAV_KEY) return;
    applyStored(event.newValue);
  });
}

const favoriteKeys = computed(() => new Set(favorites.value.map((entry) => favoriteKey(entry))));

export interface FavoritePatch {
  name?: string;
  level?: number;
  note?: string;
  group?: string;
  pinned?: boolean;
  lastSeenAt?: number;
  lastRank?: string;
}

export function useFavorites(): {
  favorites: Ref<FavoriteEntry[]>;
  isFavorite: (target: FavoriteTarget) => boolean;
  toggle: (entry: FavoriteInput) => FavoriteToggleResult;
  remove: (key: string) => void;
  update: (key: string, patch: FavoritePatch) => void;
  setGroup: (keys: string[], group: string) => void;
  renameGroup: (from: string, to: string) => void;
  deleteGroup: (name: string) => void;
  move: (fromKey: string, toKey: string) => void;
  moveBy: (key: string, delta: -1 | 1) => void;
  clear: () => void;
  exportData: () => string;
  importData: (raw: string, mode: FavoriteImportMode) => FavoriteImportResult;
} {
  /** 读 computed，保证在组件 computed/模板里调用时保持响应式 */
  function isFavorite(target: FavoriteTarget): boolean {
    return favoriteKeys.value.has(favoriteKey(target));
  }

  function toggle(input: FavoriteInput): FavoriteToggleResult {
    const entry = toFavoriteEntry({ ...input, savedAt: Date.now() });
    if (!entry) return "removed";
    const key = favoriteKey(entry);
    if (favorites.value.some((item) => favoriteKey(item) === key)) {
      favorites.value = favorites.value.filter((item) => favoriteKey(item) !== key);
      return "removed";
    }
    if (favorites.value.length >= MAX_FAVORITES) return "full";
    favorites.value = [entry, ...favorites.value];
    return "added";
  }

  function remove(key: string): void {
    favorites.value = favorites.value.filter((item) => favoriteKey(item) !== key);
  }

  /** 更新备注/分组/名称/等级/置顶/最近记录；patch 里传空串表示清除该字段 */
  function update(key: string, patch: FavoritePatch): void {
    favorites.value = favorites.value.map((item) => {
      if (favoriteKey(item) !== key) return item;
      const next: FavoriteEntry = { ...item };
      if ("note" in patch) {
        const note = toOptionalText(patch.note);
        if (note) next.note = note;
        else delete next.note;
      }
      if ("group" in patch) {
        const group = toOptionalText(patch.group);
        if (group) next.group = group;
        else delete next.group;
      }
      if ("name" in patch) {
        const name = toOptionalText(patch.name);
        if (name) next.name = name;
      }
      if ("level" in patch) {
        if (typeof patch.level === "number" && Number.isFinite(patch.level)) next.level = patch.level;
        else delete next.level;
      }
      if ("pinned" in patch) {
        if (patch.pinned) next.pinned = true;
        else delete next.pinned;
      }
      if ("lastSeenAt" in patch) {
        const lastSeenAt = toTimestamp(patch.lastSeenAt);
        if (lastSeenAt) next.lastSeenAt = lastSeenAt;
        else delete next.lastSeenAt;
      }
      if ("lastRank" in patch) {
        const lastRank = toOptionalText(patch.lastRank);
        if (lastRank) next.lastRank = lastRank;
        else delete next.lastRank;
      }
      return next;
    });
  }

  function setGroup(keys: string[], group: string): void {
    const wanted = new Set(keys);
    const normalized = toOptionalText(group);
    favorites.value = favorites.value.map((item) => {
      if (!wanted.has(favoriteKey(item))) return item;
      const next = { ...item };
      if (normalized) next.group = normalized;
      else delete next.group;
      return next;
    });
  }

  function renameGroup(from: string, to: string): void {
    const source = toOptionalText(from);
    if (!source) return;
    const target = toOptionalText(to);
    favorites.value = favorites.value.map((item) => {
      if (toOptionalText(item.group) !== source) return item;
      const next = { ...item };
      if (target) next.group = target;
      else delete next.group;
      return next;
    });
  }

  function deleteGroup(name: string): void {
    const target = toOptionalText(name);
    if (!target) return;
    favorites.value = favorites.value.map((item) => {
      if (toOptionalText(item.group) !== target) return item;
      const next = { ...item };
      delete next.group;
      return next;
    });
  }

  /**
   * 拖拽排序：把 fromKey 条目移动到 toKey 原本所在的下标位置。
   * 向下拖动会落在目标之后、向上拖动会落在目标之前；任一 key 找不到时 no-op。
   */
  function move(fromKey: string, toKey: string): void {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const list = favorites.value.slice();
    const fromIndex = list.findIndex((item) => favoriteKey(item) === fromKey);
    const toIndex = list.findIndex((item) => favoriteKey(item) === toKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const moved = list.splice(fromIndex, 1)[0];
    if (!moved) return;
    list.splice(toIndex, 0, moved);
    favorites.value = list;
  }

  /** 触屏/键盘排序：在手动顺序中上移/下移一位 */
  function moveBy(key: string, delta: -1 | 1): void {
    const list = favorites.value.slice();
    const fromIndex = list.findIndex((item) => favoriteKey(item) === key);
    if (fromIndex < 0) return;
    const toIndex = Math.max(0, Math.min(list.length - 1, fromIndex + delta));
    if (toIndex === fromIndex) return;
    const [moved] = list.splice(fromIndex, 1);
    if (!moved) return;
    list.splice(toIndex, 0, moved);
    favorites.value = list;
  }

  function clear(): void {
    favorites.value = [];
  }

  function exportData(): string {
    return JSON.stringify({ version: 1, exportedAt: Date.now(), favorites: favorites.value }, null, 2);
  }

  function importData(raw: string, mode: FavoriteImportMode): FavoriteImportResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { added: 0, skipped: 0, error: "文件不是合法的 JSON" };
    }
    const source = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { favorites?: unknown }).favorites)
        ? (parsed as { favorites: unknown[] }).favorites
        : null;
    if (!source) return { added: 0, skipped: 0, error: "文件里没有可识别的收藏列表" };

    const incoming = normalizeList(source);
    const existing = mode === "replace" ? [] : favorites.value;
    const seen = new Set(existing.map((entry) => favoriteKey(entry)));
    const merged = existing.slice();
    let added = 0;
    let skipped = 0;
    for (const entry of incoming) {
      const key = favoriteKey(entry);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      if (merged.length >= MAX_FAVORITES) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      merged.push(entry);
      added += 1;
    }
    favorites.value = merged;
    return { added, skipped };
  }

  return {
    favorites,
    isFavorite,
    toggle,
    remove,
    update,
    setGroup,
    renameGroup,
    deleteGroup,
    move,
    moveBy,
    clear,
    exportData,
    importData
  };
}
