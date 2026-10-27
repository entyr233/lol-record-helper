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

/** 英雄下拉池的一项：英雄 id + 本 composable 生命周期内累计出现的场次 */
export interface ChampionPoolEntry {
  id: number;
  count: number;
}

/** focusGame 的结果：命中项（未命中为 null）+ 是否发生过筛选重置 */
export interface FocusGameResult {
  battle: BattleSummary | null;
  filterReset: boolean;
}

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
  rawLoaded: Ref<number>;
  /** 累计出现过的英雄及场次：不因 setFilter 清空，composable 生命周期内只增不减 */
  championPool: Ref<ChampionPoolEntry[]>;
  setFilter: (patch: Partial<ListFilter>) => Promise<void>;
  goToPage: (n: number) => Promise<void>;
  select: (gameId: string) => void;
  /** 跨页定位并选中一场对局（筛选不匹配时先重置筛选） */
  focusGame: (game: BattleSummary) => Promise<FocusGameResult>;
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
  const championPool = ref<ChampionPoolEntry[]>([]);
  /** 英雄出现次数：跨 setFilter 保留，切账号时随 composable 重建自然清零 */
  const championCounts = new Map<number, number>();
  /** 已计入池子的 game_id：同一对局在不同页/重复拉同一页时只算一次 */
  const seenGameIds = new Set<string>();
  let fetchedPages = 0;
  /** 默认模式最近一次成功加载的页号（0 = 还没有数据），避免重复拉当前页 */
  let loadedPage = 0;
  let inflight = false;
  let focusing = false;

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

  /** 把一次成功拉取的原始页里的英雄出现次数累加进池子（按 game_id 去重，只增不减） */
  function recordChampionCounts(items: BattleSummary[]): void {
    for (const item of items) {
      if (seenGameIds.has(item.game_id)) continue;
      seenGameIds.add(item.game_id);
      const id = Number(item.champion_id);
      if (!Number.isFinite(id)) continue;
      championCounts.set(id, (championCounts.get(id) ?? 0) + 1);
    }
    championPool.value = [...championCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id - b.id);
  }

  function pickSelection(visible: BattleSummary[]): void {
    if (!visible.some((item) => item.game_id === selectedGameId.value) && visible.length > 0) {
      selectedGameId.value = visible[0].game_id;
    }
  }

  async function fetchRawPage(n: number): Promise<void> {
    const pageData = await lolBattleApi.getBattleList(rqOptions(), { count: PAGE_SIZE, offset: n * PAGE_SIZE });
    serverHasMore.value = pageData.length >= PAGE_SIZE;
    recordChampionCounts(pageData);
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
        loadedPage = n;
        recordChampionCounts(fresh);
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

  /** 快路径：目标就在当前可见页时直接选中，不发任何请求 */
  function hitOnVisiblePage(game: BattleSummary): BattleSummary | null {
    const hit = visiblePage.value.find((item) => item.game_id === game.game_id);
    if (!hit) return null;
    selectedGameId.value = hit.game_id;
    return hit;
  }

  /** 翻到第 n 页并检查是否有目标；出错时返回 null，由调用方看 error 停止查找 */
  async function stepToPage(game: BattleSummary, n: number): Promise<BattleSummary | null> {
    await goToPage(n);
    if (error.value) return null;
    return hitOnVisiblePage(game);
  }

  /**
   * 无筛选模式：当前页未加载时先补当前页，再往后翻，最后回绕到前面的页。
   * 全程不重复拉当前页；命中后选中并返回。
   */
  async function findInDefaultPages(game: BattleSummary): Promise<BattleSummary | null> {
    const start = page.value;
    if (loadedPage !== start) {
      const hit = await stepToPage(game, start);
      if (hit || error.value) return hit;
    }
    for (let n = start + 1; n <= MAX_RAW_PAGES && serverHasMore.value; n += 1) {
      const hit = await stepToPage(game, n);
      if (hit || error.value) return hit;
    }
    // 前面的页一定存在（当前页能打开说明它之前也有数据），向后没找到时回绕
    for (let n = 1; n < start; n += 1) {
      const hit = await stepToPage(game, n);
      if (hit || error.value) return hit;
    }
    return null;
  }

  /** 筛选模式：在本地过滤结果里定位，不够就续拉原始页，最后翻到它所在的页 */
  async function findInFilteredPages(game: BattleSummary): Promise<BattleSummary | null> {
    let index = filteredAll.value.findIndex((item) => item.game_id === game.game_id);
    while (index < 0 && serverHasMore.value && fetchedPages < MAX_RAW_PAGES) {
      try {
        await fetchRawPage(fetchedPages);
      } catch (err) {
        error.value = err as Error;
        return null;
      }
      index = filteredAll.value.findIndex((item) => item.game_id === game.game_id);
    }
    if (index < 0) return null;
    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    await goToPage(targetPage);
    if (error.value) return null;
    const hit = visiblePage.value.find((item) => item.game_id === game.game_id) ?? null;
    if (hit) selectedGameId.value = hit.game_id;
    return hit;
  }

  /**
   * 定位一场对局（近期表现色块 → 列表）：
   * - 先走当前可见页快路径（命中则零请求）；
   * - 无筛选：从当前页之后逐页找、必要时回绕，上限 MAX_RAW_PAGES 页；
   * - 有筛选且该场满足筛选：在本地过滤结果里定位并翻到所在页；
   * - 有筛选且不满足：先重置为 DEFAULT_FILTER（第 1 页已由 setFilter 拉好，再走一次快路径），
   *   仍不命中再继续翻页，返回 filterReset=true。
   * 未命中时回到进入查找前的页码与选中，不破坏当前视图；goToPage 吞错时立即停止返回 null。
   */
  async function focusGame(game: BattleSummary): Promise<FocusGameResult> {
    if (inflight || focusing) return { battle: null, filterReset: false };
    focusing = true;
    try {
      let filterReset = false;
      // 快路径：目标就在当前页（筛选模式下为当前筛选页）时直接选中，不重复拉第 1 页
      const current = hitOnVisiblePage(game);
      if (current) return { battle: current, filterReset };
      if (!isDefaultFilter(filter.value) && !matches(game)) {
        await setFilter({ ...DEFAULT_FILTER });
        filterReset = true;
        if (error.value) return { battle: null, filterReset };
        // 重置后的第 1 页已就绪：先检查它，命中就不用再发请求
        const afterReset = hitOnVisiblePage(game);
        if (afterReset) return { battle: afterReset, filterReset };
      }
      const prevPage = page.value;
      const prevSelected = selectedGameId.value;
      const hit = isDefaultFilter(filter.value)
        ? await findInDefaultPages(game)
        : await findInFilteredPages(game);
      if (!hit) {
        // 查找失败：查找可能翻到空页，恢复原页码与选中态
        if (page.value !== prevPage) await goToPage(prevPage);
        selectedGameId.value = prevSelected;
        return { battle: null, filterReset };
      }
      return { battle: hit, filterReset };
    } finally {
      focusing = false;
    }
  }

  const rawLoaded = computed(() => rawBattles.value.length);
  return {
    battles: visiblePage,
    page,
    hasPrev,
    hasNext,
    loading,
    error,
    selectedGameId,
    filter,
    sampleSize,
    rawLoaded,
    championPool,
    setFilter,
    goToPage,
    select,
    focusGame
  };
}
