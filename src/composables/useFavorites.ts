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
  /** 分组名：弹层里按首次出现顺序分组展示，未设置的归入「未分组」 */
  group?: string;
  savedAt: number;
}

export type FavoriteInput = Omit<FavoriteEntry, "savedAt"> & Partial<Pick<FavoriteEntry, "savedAt">>;

/** 兼容旧版本的键名：老用户收藏不丢 */
const FAV_KEY = "lol-tft-favorites";
const MAX_FAVORITES = 20;

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

/** 把任意来源的条目规整成 FavoriteEntry；缺 id 的条目无法定位玩家，直接丢弃 */
function toFavoriteEntry(raw: unknown): FavoriteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (item.id === undefined || item.id === null || String(item.id) === "") return null;
  const id = String(item.id);
  const entry: FavoriteEntry = {
    name: typeof item.name === "string" && item.name ? item.name : id,
    area: Number(item.area) || 0,
    accountType: toAccountType(item.accountType),
    id,
    savedAt: typeof item.savedAt === "number" && Number.isFinite(item.savedAt) ? item.savedAt : 0
  };
  if (typeof item.level === "number" && Number.isFinite(item.level)) entry.level = item.level;
  // 旧版本没有 note/group 字段：缺省即不写，兼容读取
  const note = toOptionalText(item.note);
  if (note) entry.note = note;
  const group = toOptionalText(item.group);
  if (group) entry.group = group;
  return entry;
}

/** 迁移旧数据 + 按 favoriteKey 去重（保留先出现的）+ 截断 20 条 */
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

export function useFavorites(): {
  favorites: Ref<FavoriteEntry[]>;
  isFavorite: (target: FavoriteTarget) => boolean;
  toggle: (entry: FavoriteInput) => void;
  remove: (key: string) => void;
  update: (key: string, patch: { note?: string; group?: string }) => void;
  move: (fromKey: string, toKey: string) => void;
  clear: () => void;
} {
  /** 读 computed，保证在组件 computed/模板里调用时保持响应式 */
  function isFavorite(target: FavoriteTarget): boolean {
    return favoriteKeys.value.has(favoriteKey(target));
  }

  function toggle(input: FavoriteInput): void {
    const entry = toFavoriteEntry({ ...input, savedAt: Date.now() });
    if (!entry) return;
    const key = favoriteKey(entry);
    if (favorites.value.some((item) => favoriteKey(item) === key)) {
      favorites.value = favorites.value.filter((item) => favoriteKey(item) !== key);
      return;
    }
    favorites.value = [entry, ...favorites.value].slice(0, MAX_FAVORITES);
  }

  function remove(key: string): void {
    favorites.value = favorites.value.filter((item) => favoriteKey(item) !== key);
  }

  /** 更新备注/分组（savedAt 与顺序都不变）；patch 里传空串表示清除该字段 */
  function update(key: string, patch: { note?: string; group?: string }): void {
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

  function clear(): void {
    favorites.value = [];
  }

  return { favorites, isFavorite, toggle, remove, update, move, clear };
}
