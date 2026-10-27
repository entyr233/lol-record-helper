import { computed, ref, type Ref } from "vue";
import { lolBattleApi } from "../api/client";
import type { BattleSummary, RqOptions } from "../api/types";

export const PAGE_SIZE = 10;
/** 筛选模式下最多向后拉取的原始页数（防刷爆） */
export const MAX_RAW_PAGES = 20;

export type ModeFilter = number | "all";

export interface BattleListState {
  /** 当前页可见的对局（已按筛选切片） */
  battles: Ref<BattleSummary[]>;
  page: Ref<number>;
  hasPrev: Ref<boolean>;
  hasNext: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  selectedGameId: Ref<string | null>;
  filter: Ref<ModeFilter>;
  setFilter: (f: ModeFilter) => Promise<void>;
  goToPage: (n: number) => Promise<void>;
  select: (gameId: string) => void;
}

/**
 * 对局列表：翻页制（上一页/下一页），每页 PAGE_SIZE 条。
 * - 无筛选：按页号直接向服务端取 offset=(n-1)*10，整页替换。
 * - 有模式筛选：服务端不支持按队列过滤，改为累积拉取原始页，
 *   在本地过滤后切片成页；下一页若数据不足会自动继续拉取（上限 MAX_RAW_PAGES 页）。
 */
export function useBattleList(rqOptions: () => RqOptions): BattleListState {
  const rawBattles = ref<BattleSummary[]>([]);
  const page = ref(1);
  const serverHasMore = ref(true);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const selectedGameId = ref<string | null>(null);
  const filter = ref<ModeFilter>("all");
  let fetchedPages = 0;
  let inflight = false;

  const matches = (b: BattleSummary): boolean => filter.value === "all" || Number(b.game_queue_id) === Number(filter.value);
  const filteredAll = computed(() => rawBattles.value.filter(matches));

  const hasPrev = computed(() => page.value > 1);
  const hasNext = computed(() => {
    if (filter.value === "all") return serverHasMore.value;
    return filteredAll.value.length > page.value * PAGE_SIZE || (serverHasMore.value && fetchedPages < MAX_RAW_PAGES);
  });

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

  async function goToPage(n: number): Promise<void> {
    if (inflight || n < 1) return;
    inflight = true;
    loading.value = true;
    error.value = null;
    try {
      if (filter.value === "all") {
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
        // 筛选模式：确保过滤后的数据足以填满第 n 页
        while (filteredAll.value.length < n * PAGE_SIZE && serverHasMore.value && fetchedPages < MAX_RAW_PAGES) {
          await fetchRawPage(fetchedPages);
        }
        if (n === 1 || (n - 1) * PAGE_SIZE < filteredAll.value.length) page.value = n;
        else page.value = Math.max(1, Math.ceil(filteredAll.value.length / PAGE_SIZE));
        pickSelection(visiblePage.value);
      }
    } catch (err) {
      error.value = err as Error;
    } finally {
      inflight = false;
      loading.value = false;
    }
  }

  const visiblePage = computed<BattleSummary[]>(() => {
    if (filter.value === "all") return rawBattles.value;
    return filteredAll.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE);
  });

  async function setFilter(f: ModeFilter): Promise<void> {
    if (f === filter.value || inflight) return;
    filter.value = f;
    rawBattles.value = [];
    page.value = 1;
    serverHasMore.value = true;
    fetchedPages = 0;
    await goToPage(1);
  }

  function select(gameId: string): void {
    selectedGameId.value = gameId;
  }

  return { battles: visiblePage, page, hasPrev, hasNext, loading, error, selectedGameId, filter, setFilter, goToPage, select };
}
