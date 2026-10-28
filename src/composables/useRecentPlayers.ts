import { ref, watch } from "vue";
import type { Ref } from "vue";

/** 最近查看的玩家：与搜索历史分开，只记录真正打开过资料页的玩家。 */
export interface RecentPlayer {
  name: string;
  area: number;
  accountType: string;
  id: string;
  viewedAt: number;
}

export type RecentPlayerInput = Omit<RecentPlayer, "viewedAt"> & Partial<Pick<RecentPlayer, "viewedAt">>;

const RECENT_KEY = "lol-tft-recent-players";
export const MAX_RECENT_PLAYERS = 10;

function keyOf(player: { area: number | string; accountType: number | string; id: string | number }): string {
  return String(player.area) + ":" + String(player.accountType || "2") + ":" + String(player.id);
}

function optionalName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function toRecentPlayer(raw: unknown): RecentPlayer | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (item.id === undefined || item.id === null || String(item.id) === "") return null;
  const viewedAt = typeof item.viewedAt === "number" && Number.isFinite(item.viewedAt) && item.viewedAt > 0
    ? item.viewedAt
    : 0;
  return {
    name: optionalName(item.name) ?? String(item.id),
    area: Number(item.area) || 0,
    accountType: item.accountType === undefined || item.accountType === null || item.accountType === ""
      ? "2"
      : String(item.accountType),
    id: String(item.id),
    viewedAt
  };
}

function normalizeList(raw: unknown): RecentPlayer[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: RecentPlayer[] = [];
  for (const item of raw) {
    const player = toRecentPlayer(item);
    if (!player) continue;
    const key = keyOf(player);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(player);
    if (list.length >= MAX_RECENT_PLAYERS) break;
  }
  return list;
}

function parse(raw: string | null): RecentPlayer[] {
  if (!raw) return [];
  try {
    return normalizeList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function load(): RecentPlayer[] {
  try {
    return parse(localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

const recentPlayers = ref<RecentPlayer[]>(load());

watch(
  recentPlayers,
  (value) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(value));
    } catch {
      /* 隐私模式/配额满时静默 */
    }
  },
  { flush: "sync" }
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== RECENT_KEY) return;
    recentPlayers.value = parse(event.newValue);
  });
}

export function useRecentPlayers(): {
  recentPlayers: Ref<RecentPlayer[]>;
  remember: (player: RecentPlayerInput) => void;
  remove: (player: { area: number | string; accountType: number | string; id: string | number }) => void;
  clear: () => void;
} {
  function remember(input: RecentPlayerInput): void {
    const player = toRecentPlayer({ ...input, viewedAt: Date.now() });
    if (!player) return;
    const key = keyOf(player);
    recentPlayers.value = [player, ...recentPlayers.value.filter((item) => keyOf(item) !== key)]
      .slice(0, MAX_RECENT_PLAYERS);
  }

  function remove(target: { area: number | string; accountType: number | string; id: string | number }): void {
    const key = keyOf(target);
    recentPlayers.value = recentPlayers.value.filter((item) => keyOf(item) !== key);
  }

  function clear(): void {
    recentPlayers.value = [];
  }

  return { recentPlayers, remember, remove, clear };
}

/** 仅用于测试/调用方去重，不与收藏共用 key 语义。 */
export function recentPlayerKey(player: { area: number | string; accountType: number | string; id: string | number }): string {
  return keyOf(player);
}
