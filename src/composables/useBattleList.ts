import { computed, ref, type Ref } from "vue";
import { useBattleFeed, type BattleFeedKey } from "./battleFeed";
import { isAbortError } from "../api/errors";
import { classifyBattle } from "../const/wins";
import type { ModeFilter } from "../const/modes";
import type { BattleSummary, RqOptions } from "../api/types";

export const PAGE_SIZE = 10;
/** 筛选/定位时最多回溯的原始页数（防刷爆） */
export const MAX_RAW_PAGES = 20;

export type { ModeFilter } from "../const/modes";
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
  /** 最近一次实际请求的页码，失败后用于重试。 */
  requestedPage: Ref<number>;
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
  /** presetGameId：本次翻页要选中的对局（定位时用，避免先选第一场再改一次选中） */
  goToPage: (n: number, presetGameId?: string) => Promise<void>;
  select: (gameId: string) => void;
  /** 定位并选中一场对局（筛选不匹配时先重置筛选） */
  focusGame: (game: BattleSummary) => Promise<FocusGameResult>;
  /** 刷新：清掉页缓存、按当前筛选与页码重新拉取；保留当前查看的对局（已不存在时才重新选择） */
  refresh: () => Promise<boolean>;
  /** 组件卸载时中止在途请求 */
  dispose: () => void;
}

function isDefaultFilter(f: ListFilter): boolean {
  return f.mode === "all" && f.champion === null && f.result === "all" && f.days === 0;
}

/**
 * 对局列表：翻页制（上一页/下一页），每页 PAGE_SIZE 条。
 * - 无任何筛选：按页号直接向服务端取 offset=(n-1)*PAGE_SIZE，整页替换。
 * - 有筛选（模式/英雄/胜负/天数）：服务端不支持这些过滤，改为累积拉取原始页，
 *   在本地过滤后切片成页；下一页数据不足时自动继续拉取（上限 MAX_RAW_PAGES 页）。
 * - 请求带「代际」：筛选在请求未完成时变化，旧响应会被丢弃，不会把旧条件的结果写回新筛选。
 */
export function useBattleList(rqOptions: () => RqOptions): BattleListState {
  const rawBattles = ref<BattleSummary[]>([]);
  const page = ref(1);
  const requestedPage = ref(1);
  /** 当前展示页之后是否还有更多（只由「正式展示某一页」更新，定位探测不碰它） */
  const displayedHasMore = ref(true);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const selectedGameId = ref<string | null>(null);
  const filter = ref<ListFilter>({ ...DEFAULT_FILTER });
  const championPool = ref<ChampionPoolEntry[]>([]);
  /** 英雄出现次数：跨 setFilter 保留，切账号时随 composable 重建自然清零 */
  const championCounts = new Map<number, number>();
  /** 已计入池子的 game_id：同一对局在不同页/重复拉同一页时只算一次 */
  const seenGameIds = new Set<string>();
  /**
   * 玩家级共享数据层：原始页缓存与在途请求都放在 battleFeed 里，
   * 与总览（RecentStats）等其它消费者共用同一份「当前玩家」的原始战绩页。
   */
  const feed = useBattleFeed((): BattleFeedKey => {
    const rq = rqOptions();
    return { area: String(rq.area), accountType: String(rq.account_type), id: String(rq.id) };
  });
  /** 已累积的原始页数（响应式：参与「下一页」按钮状态计算） */
  const fetchedPages = ref(0);
  /** 原始数据的前沿：已拉到的最后一页是否还有更多（响应式，与「当前展示页的翻页状态」分开） */
  const rawHasMore = ref(true);
  let inflight: Promise<void> | null = null;
  let focusing = false;
  /** 代际：筛选变化时自增；旧请求的结果因代际不同被丢弃 */
  let generation = 0;
  /** 列表请求的取消信号：切换筛选 / 组件卸载时结束在途请求 */
  let requestController: AbortController | null = null;
  let disposed = false;

  function signalOf(): AbortSignal {
    if (!requestController) requestController = new AbortController();
    return requestController.signal;
  }

  /** 中止在途列表请求，并为后续请求换一个新的 controller */
  function abortRequests(): void {
    requestController?.abort();
    requestController = new AbortController();
  }

  const DAY_MS = 86400000;
  const matches = (b: BattleSummary): boolean => {
    const f = filter.value;
    if (f.mode === "mvp") {
      if (Number(b.was_mvp) !== 1 && Number(b.was_svp) !== 1) return false;
    } else if (f.mode !== "all") {
      if (Number(b.game_queue_id) !== Number(f.mode)) return false;
    }
    if (f.champion !== null && Number(b.champion_id) !== f.champion) return false;
    if (f.result !== "all") {
      // 与总览/列表标签同一口径：重开单列，LeaverWin/LeaverFail 按胜/负算
      const result = classifyBattle(b);
      if (f.result === "win" && result !== "win") return false;
      if (f.result === "fail" && result !== "lose") return false;
    }
    if (f.days) {
      const start = Number(b.game_start_time);
      if (Number.isFinite(start) && start < Date.now() - f.days * DAY_MS) return false;
    }
    return true;
  };

  const filteredAll = computed(() => rawBattles.value.filter(matches));

  const hasPrev = computed(() => page.value > 1);
  const hasNext = computed(() => {
    if (isDefaultFilter(filter.value)) return displayedHasMore.value;
    // 筛选模式：本地还能切出更多匹配，或原始数据前沿还没到头
    return filteredAll.value.length > page.value * PAGE_SIZE || (rawHasMore.value && fetchedPages.value < MAX_RAW_PAGES);
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

  /** 选中项失效时换成本页第一场；没有结果时清空（右侧不再显示已筛掉的旧对局） */
  function pickSelection(visible: BattleSummary[]): void {
    if (visible.some((item) => item.game_id === selectedGameId.value)) return;
    selectedGameId.value = visible.length > 0 ? visible[0].game_id : null;
  }

  const visiblePage = computed<BattleSummary[]>(() => {
    if (isDefaultFilter(filter.value)) return rawBattles.value;
    return filteredAll.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE);
  });

  /**
   * 取第 n 个原始页（0 基）：走玩家级共享缓存（battleFeed），重复页不重复请求。
   * 只读探测用——不修改当前页面的翻页状态（displayedHasMore），只有正式展示某一页时才更新翻页按钮。
   * gen 用于丢弃「筛选已变化但响应才回来」的旧结果：不更新英雄池；
   * 页数据本身与筛选无关，因此仍由共享层缓存复用。
   */
  async function fetchPage(n: number, gen: number = generation): Promise<{ items: BattleSummary[]; hasMore: boolean }> {
    if (disposed) throw new DOMException("aborted", "AbortError");
    const result = await feed.getPage(n, { signal: signalOf() });
    if (gen === generation) recordChampionCounts(result.data);
    return { items: result.data, hasMore: result.hasMore };
  }

  /** 把原始页追加进本地累积（筛选模式下做本地过滤时用），不改页码与选中；返回原始数据前沿 */
  async function appendRawPage(n: number, gen: number = generation): Promise<boolean> {
    const { items, hasMore } = await fetchPage(n, gen);
    if (gen !== generation) return rawHasMore.value;
    const seen = new Set(rawBattles.value.map((item) => item.game_id));
    for (const item of items) {
      if (seen.has(item.game_id)) continue;
      seen.add(item.game_id);
      rawBattles.value.push(item);
    }
    fetchedPages.value = n + 1;
    rawHasMore.value = hasMore;
    return hasMore;
  }

  async function loadPage(n: number, gen: number, presetGameId?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      if (isDefaultFilter(filter.value)) {
        const { items, hasMore } = await fetchPage(n - 1, gen);
        // 代际不同说明等待期间筛选变了：旧结果直接丢弃
        if (gen !== generation) return;
        const seen = new Set<string>();
        const fresh: BattleSummary[] = [];
        for (const item of items) {
          if (seen.has(item.game_id)) continue;
          seen.add(item.game_id);
          fresh.push(item);
        }
        rawBattles.value = fresh;
        page.value = n;
        // 只有正式展示这一页时才更新「下一页」状态
        displayedHasMore.value = hasMore;
        // 定位场景：一次性选中目标；普通翻页才按「本页第一场」兜底
        if (presetGameId && fresh.some((item) => item.game_id === presetGameId)) selectedGameId.value = presetGameId;
        else pickSelection(fresh);
        return;
      }
      while (filteredAll.value.length < n * PAGE_SIZE && rawHasMore.value && fetchedPages.value < MAX_RAW_PAGES) {
        await appendRawPage(fetchedPages.value, gen);
        if (gen !== generation) return;
      }
      if (gen !== generation) return;
      const lastPage = Math.max(1, Math.ceil(filteredAll.value.length / PAGE_SIZE));
      page.value = Math.min(n, lastPage);
      const visible = visiblePage.value;
      if (presetGameId && visible.some((item) => item.game_id === presetGameId)) selectedGameId.value = presetGameId;
      else pickSelection(visible);
    } catch (err) {
      if (gen === generation && !isAbortError(err)) error.value = err as Error;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  function goToPage(n: number, presetGameId?: string): Promise<void> {
    if (n < 1 || inflight || disposed) return Promise.resolve();
    requestedPage.value = n;
    const gen = generation;
    const run = loadPage(n, gen, presetGameId);
    inflight = run;
    run.finally(() => {
      if (inflight === run) inflight = null;
    }).catch(() => {
      /* loadPage 已内部处理错误，这里只兜住 finally 链 */
    });
    return run;
  }

  async function setFilter(patch: Partial<ListFilter>): Promise<void> {
    if (disposed) return;
    const next = { ...filter.value, ...patch };
    if (next.mode === filter.value.mode && next.champion === filter.value.champion
      && next.result === filter.value.result && next.days === filter.value.days) return;
    filter.value = next;
    // 中止在途请求（网络慢时不用等旧请求跑完），并让旧响应作废
    abortRequests();
    generation += 1;
    // 清掉共享页缓存：旧筛选下发出的响应可能带着旧数据，重新拉取才不会把旧结果展示成新筛选结果
    feed.invalidate();
    rawBattles.value = [];
    page.value = 1;
    selectedGameId.value = null;
    displayedHasMore.value = true;
    rawHasMore.value = true;
    fetchedPages.value = 0;
    const pending = inflight;
    if (pending) await pending.catch(() => {});
    await goToPage(1);
  }

  /** 刷新：清掉原始页缓存，按当前筛选与页码重新拉取；保留选中项（已不存在时再重新选择） */
  async function refresh(): Promise<boolean> {
    if (disposed || focusing) return false;
    while (inflight) await inflight.catch(() => {});
    abortRequests();
    generation += 1;
    feed.invalidate();
    rawBattles.value = [];
    rawHasMore.value = true;
    displayedHasMore.value = true;
    fetchedPages.value = 0;
    const targetPage = Math.max(1, page.value);
    await goToPage(targetPage);
    return error.value === null && !disposed;
  }

  /** 组件卸载时中止所有在途列表请求，并放弃本实例产生的缓存（共享层随之重置） */
  function dispose(): void {
    disposed = true;
    requestController?.abort();
    requestController = null;
    feed.invalidate();
  }

  function select(gameId: string): void {
    selectedGameId.value = gameId;
  }

  /** 顺序探测目标所在页（1 基）：近期对局在前，通常 1~2 次即可命中；命中缓存则不请求。
   *  探测只读：不更新当前页的翻页状态；被取消（切筛选/卸载）时静默结束。 */
  async function findPageOf(game: BattleSummary): Promise<number | null> {
    for (let n = 1; n <= MAX_RAW_PAGES; n += 1) {
      let page: { items: BattleSummary[]; hasMore: boolean };
      try {
        page = await fetchPage(n - 1);
      } catch (err) {
        if (!isAbortError(err)) error.value = err as Error;
        return null;
      }
      if (page.items.some((item) => item.game_id === game.game_id)) return n;
      if (!page.hasMore) return null;
    }
    return null;
  }

  /**
   * 定位一场对局（近期表现色块 → 列表）：
   * - 先走当前可见页快路径（命中则零请求）；
   * - 有筛选且该场不满足筛选：先重置筛选，再继续定位；
   * - 查找阶段只读原始页缓存、不改页码/选中，命中后一次性翻页并选中；
   * - 未命中时不改动当前视图（页码、选中、列表内容保持原样）。
   */
  async function focusGame(game: BattleSummary): Promise<FocusGameResult> {
    if (focusing) return { battle: null, filterReset: false };
    focusing = true;
    try {
      // 正在加载时先等它结束，避免把「定位中」误报成「找不到」
      if (inflight) await inflight.catch(() => {});
      let filterReset = false;

      const current = visiblePage.value.find((item) => item.game_id === game.game_id);
      if (current) {
        selectedGameId.value = current.game_id;
        return { battle: current, filterReset };
      }

      if (!isDefaultFilter(filter.value) && !matches(game)) {
        await setFilter({ ...DEFAULT_FILTER });
        filterReset = true;
        if (error.value) return { battle: null, filterReset };
        const afterReset = visiblePage.value.find((item) => item.game_id === game.game_id);
        if (afterReset) {
          selectedGameId.value = afterReset.game_id;
          return { battle: afterReset, filterReset };
        }
      }

      if (isDefaultFilter(filter.value)) {
        const targetPage = await findPageOf(game);
        if (targetPage === null) return { battle: null, filterReset };
        await goToPage(targetPage, game.game_id);
        if (error.value) return { battle: null, filterReset };
        const hit = visiblePage.value.find((item) => item.game_id === game.game_id) ?? null;
        if (hit) selectedGameId.value = hit.game_id;
        return { battle: hit, filterReset };
      }

      // 筛选模式：先看已累积的匹配结果，不够再续拉原始页（不改变当前页码；仅成功命中后才翻页）
      let index = filteredAll.value.findIndex((item) => item.game_id === game.game_id);
      while (index < 0 && rawHasMore.value && fetchedPages.value < MAX_RAW_PAGES) {
        try {
          await appendRawPage(fetchedPages.value);
        } catch (err) {
          if (!isAbortError(err)) error.value = err as Error;
          return { battle: null, filterReset };
        }
        index = filteredAll.value.findIndex((item) => item.game_id === game.game_id);
      }
      if (index < 0) return { battle: null, filterReset };
      const targetPage = Math.floor(index / PAGE_SIZE) + 1;
      // 与无筛选分支一致：一次翻页就选中目标，避免先选第一场再改一次选中
      await goToPage(targetPage, game.game_id);
      if (error.value) return { battle: null, filterReset };
      const hit = visiblePage.value.find((item) => item.game_id === game.game_id) ?? null;
      if (hit) selectedGameId.value = hit.game_id;
      return { battle: hit, filterReset };
    } finally {
      focusing = false;
    }
  }

  const rawLoaded = computed(() => rawBattles.value.length);
  return {
    battles: visiblePage,
    page,
    requestedPage,
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
    focusGame,
    refresh,
    dispose
  };
}
