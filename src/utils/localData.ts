/** 本机数据清单：只管理插件自己写入的键，不碰其它站点/脚本数据。 */

export type LocalDataCategoryId =
  | "battle"
  | "favorites"
  | "recent"
  | "search"
  | "aramgg-cache"
  | "aramgg-key"
  | "static"
  | "preferences";

export interface LocalDataCategoryDefinition {
  id: LocalDataCategoryId;
  label: string;
  description: string;
  /** 精确匹配的存储键 */
  exactKeys: string[];
  /** 前缀匹配的存储键（用于按数据版本分裂的缓存） */
  prefixKeys?: string[];
  /** 会话存储键，关闭标签页自动消失 */
  sessionKeys?: string[];
}

export interface LocalDataCategoryInfo extends LocalDataCategoryDefinition {
  keys: string[];
  bytes: number;
}

export const LOCAL_DATA_CATEGORIES: LocalDataCategoryDefinition[] = [
  {
    id: "favorites",
    label: "收藏玩家",
    description: "昵称、备注、分组和最近查看段位",
    exactKeys: ["lol-tft-favorites"]
  },
  {
    id: "recent",
    label: "最近查看",
    description: "打开过的玩家记录，最多 10 位",
    exactKeys: ["lol_tft:recent-players"]
  },
  {
    id: "search",
    label: "搜索历史",
    description: "最近搜索过的昵称，最多 10 条",
    exactKeys: ["lol_tft:search-history", "lol-tft-search-history"]
  },
  {
    id: "aramgg-cache",
    label: "海克斯数据缓存",
    description: "ARAMGG 榜单与英雄详情，按数据版本保存",
    exactKeys: ["lol_tft:aramgg-overview-v2"],
    prefixKeys: ["lol_tft:aramgg-champion-v2:"]
  },
  {
    id: "aramgg-key",
    label: "海克斯 API Key",
    description: "仅本机保存，可单独清除",
    exactKeys: ["lol_tft:aramgg-api-key", "lol_tft:aramgg-api-key-session-only"],
    sessionKeys: ["lol_tft:aramgg-api-key-session"]
  },
  {
    id: "static",
    label: "静态资料缓存",
    description: "英雄名称、Data Dragon 版本和技能缓存",
    exactKeys: ["lol_tft:ddragon-version", "lol_tft:champion-names-v1"]
  },
  {
    id: "preferences",
    label: "界面偏好",
    description: "上次大区、收藏排序/折叠和助手面板位置",
    exactKeys: [
      "lol_tft:area",
      "lol_tft:last-area",
      "lol_tft:favorites-sort",
      "lol_tft:favorites-collapsed",
      "lol_tft:favorites-group-order",
      "lol_tft:helper-collapsed",
      "lol_tft:helper-pos",
      "lol_tft:lol-tft-helper-area"
    ]
  }
];

/** 战绩列表/详情缓存只存在内存中，不在 localStorage；由设置面板调用清理函数。 */
export const MEMORY_ONLY_CATEGORY = {
  id: "battle" as const,
  label: "战绩内存缓存",
  description: "对局列表与 10 人详情；关闭页面后自然释放"
};

function safeStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function keyBytes(storage: Storage, key: string): number {
  const value = storage.getItem(key);
  return value === null ? 0 : (key.length + value.length) * 2;
}

function allKeys(storage: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
  } catch {
    /* 隐私模式等场景下读取失败，按空库存处理 */
  }
  return keys;
}

function keysFor(definition: LocalDataCategoryDefinition, localKeys: string[], sessionKeys: string[]): string[] {
  const matched = new Set<string>();
  for (const key of localKeys) {
    if (definition.exactKeys.includes(key) || definition.prefixKeys?.some((prefix) => key.startsWith(prefix))) {
      matched.add(key);
    }
  }
  for (const key of definition.sessionKeys ?? []) {
    if (sessionKeys.includes(key)) matched.add(key);
  }
  return Array.from(matched);
}

export function listLocalDataCategories(): LocalDataCategoryInfo[] {
  const local = safeStorage("localStorage");
  const session = safeStorage("sessionStorage");
  if (!local) return [];
  const localKeys = allKeys(local);
  const sessionKeys = session ? allKeys(session) : [];
  return LOCAL_DATA_CATEGORIES.map((definition) => {
    const keys = keysFor(definition, localKeys, sessionKeys);
    const bytes = keys.reduce((sum, key) => {
      const inLocal = localKeys.includes(key);
      const storage = inLocal ? local : session;
      return sum + (storage ? keyBytes(storage, key) : 0);
    }, 0);
    return { ...definition, keys, bytes };
  });
}

export function removeLocalDataCategory(id: LocalDataCategoryId): void {
  const definition = LOCAL_DATA_CATEGORIES.find((entry) => entry.id === id);
  if (!definition) return;
  const local = safeStorage("localStorage");
  const session = safeStorage("sessionStorage");
  for (const key of definition.exactKeys) {
    try { local?.removeItem(key); } catch { /* ignore */ }
  }
  for (const prefix of definition.prefixKeys ?? []) {
    if (!local) break;
    for (const key of allKeys(local)) {
      if (!key.startsWith(prefix)) continue;
      try { local.removeItem(key); } catch { /* ignore */ }
    }
  }
  for (const key of definition.sessionKeys ?? []) {
    try { session?.removeItem(key); } catch { /* ignore */ }
  }
}

export function removeAllLocalData(): void {
  for (const category of LOCAL_DATA_CATEGORIES) removeLocalDataCategory(category.id);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return Math.round(bytes) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
