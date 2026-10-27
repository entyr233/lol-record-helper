import { computed, ref, type Ref } from "vue";
import { lolBattleApi } from "../api/client";
import type { BattleSummary, RqOptions } from "../api/types";

export const PAGE_SIZE = 10;
/** 筛选模式下最多向后拉取的原始页数（防刷爆） */
export const MAX_RAW_PAGES = 20;

export type ModeFilter = number | "all" | "mvp";
export type ResultFilter = "all" | "win" | "fail";
export type DaysFilter = 0 | 7 | 30;

export interface ListFilter {
  mode: ModeFilter;
  champion: number | null;
  result: ResultFilter;
  days: DaysFilter;
}

export const DEFAULT_FILTER: ListFilter = { mode: "all", champion: null, result: "all", days: 0 };

export interface BattleListState {
  battles: Ref<BattleSummary[]>;
  page: Ref<number>;
  hasPrev: Ref<boolean>;
  hasNext: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  selectedGameId: Ref<string | null>;
  filter: Ref<ListFilter>;
  sampleSize: Ref<number>;
  setFilter: (patch: Partial<ListFilter>) => Promise<void>;
  goToPage: (n: number) => Promise<void>;
  select: (gameId: string) => void;
}

function isDefaultFilter(f: ListFilter): boolean {
  return f.mode === "all" && f.champion === null && f.result === "all" && f.days === 0;
}

/**
 * 对局列表：翻页制（上一页/下一页），每页 PAGE_SIZE 条。
 * - 无任何筛选：按页号直接向服务端取 offset=(n-1)*PAGE_SIZE，整页替换。
 * - 有筛选（模式/英雄/胜负/天数）：服务端不支持这些过滤，改为累积拉取原始页，
 *   在本地过滤后切片成页；下一页数据不足时自动继续拉取（上限 MAX_RAW_PAGES 页）。
 */
export function useBattleList(rqOptions: () => RqOptions): BattleListState {
  const rawBattles = ref<BattleSummary[]>([]);
  const page = ref(1);
  const serverHasMore = ref(true);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const selectedGameId = ref<string | null>(null);
  const filter = ref<ListFilter>({ ...DEFAULT_FILTER });
  let fetchedPages = 0;
  let inflight = false;

  const DAY_MS = 86400000;
  const matches = (b: BattleSummary): boolean => {
    const f = filter.value;
    if (f.mode === "mvp") {
      if (Number(b.was_mvp) !== 1 && Number(b.was_svp) !== 1) return false;
    } else if (f.mode !== "all") {
      if (Number(b.game_queue_id) !== Number(f.mode)) return false;
    }
    if (f.champion !== null && Number(b.champion_id) !== f.champion) return false;
    if (f.result !== "all" && b.win !== (f.result === "win" ? "Win" : "Fail")) return false;
    if (f.days) {
      const start = Number(b.game_start_time);
      if (Number.isFinite(start) && start < Date.now() - f.days * DAY_MS) return false;
    }
    return true;
  };

  const filteredAll = computed(() => rawBattles.value.filter(matches));

  const hasPrev = computed(() => page.value > 1);
  const hasNext = computed(() => {
    if (isDefaultFilter(filter.value)) return serverHasMore.value;
    return filteredAll.value.length > page.value * PAGE_SIZE || (serverHasMore.value && fetchedPages < MAX_RAW_PAGES);
  });

  /** 统计口径：无筛选=当前页 10 场；有筛选=已加载的匹配场次 */
  const sampleSize = computed(() => (isDefaultFilter(filter.value) ? Math.min(rawBattles.value.length, PAGE_SIZE) : filteredAll.value.length));

  function pickSelection(visible: BattleSummary[]): void {
    if (!visible.some((item) => item.game_id === selectedGameId.value) && visible.length > 0) {
      selectedGameId.value = visible[0].game_id;
    }
  }

  async function fetchRawPage(n: number): Promise<void> {
    const pageData = await lolBattleApi.getBattleList(rqOptions(), { count: PAGE_SIZE, offset: n * PAGE_SIZE });
    serverHasMore.value = pageData.length >= PAGE_SIZE;
    const seen = new Set(rawBattles.value.map((item) => item.game_id));
    for (const item of pageData) {
      if (!seen.has(item.game_id)) {
        seen.add(item.game_id);
        rawBattles.value.push(item);
      }
    }
    fetchedPages = n + 1;
  }

  const visiblePage = computed<BattleSummary[]>(() => {
    if (isDefaultFilter(filter.value)) return rawBattles.value;
    return filteredAll.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE);
  });

  async function goToPage(n: number): Promise<void> {
    if (inflight || n < 1) return;
    inflight = true;
    loading.value = true;
    error.value = null;
    try {
      if (isDefaultFilter(filter.value)) {
        const pageData = await lolBattleApi.getBattleList(rqOptions(), { count: PAGE_SIZE, offset: (n - 1) * PAGE_SIZE });
        serverHasMore.value = pageData.length >= PAGE_SIZE;
        const seen = new Set<string>();
        const fresh: BattleSummary[] = [];
        for (const item of pageData) {
          if (!seen.has(item.game_id)) {
            seen.add(item.game_id);
            fresh.push(item);
          }
        }
        rawBattles.value = fresh;
        page.value = n;
        pickSelection(fresh);
      } else {
        while (filteredAll.value.length < n * PAGE_SIZE && serverHasMore.value && fetchedPages < MAX_RAW_PAGES) {
          await fetchRawPage(fetchedPages);
        }
        page.value = n <= Math.max(1, Math.ceil(filteredAll.value.length / PAGE_SIZE)) ? n : Math.max(1, Math.ceil(filteredAll.value.length / PAGE_SIZE));
        pickSelection(visiblePage.value);
      }
    } catch (err) {
      error.value = err as Error;
    } finally {
      inflight = false;
      loading.value = false;
    }
  }

  async function setFilter(patch: Partial<ListFilter>): Promise<void> {
    const next = { ...filter.value, ...patch };
    if (next.mode === filter.value.mode && next.champion === filter.value.champion
      && next.result === filter.value.result && next.days === filter.value.days) return;
    filter.value = next;
    rawBattles.value = [];
    page.value = 1;
    serverHasMore.value = true;
    fetchedPages = 0;
    await goToPage(1);
  }

  function select(gameId: string): void {
    selectedGameId.value = gameId;
  }

  return { battles: visiblePage, page, hasPrev, hasNext, loading, error, selectedGameId, filter, sampleSize, setFilter, goToPage, select };
}
