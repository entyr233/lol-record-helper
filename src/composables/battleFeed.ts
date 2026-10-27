import { lolBattleApi } from "../api/client";
import { toRqOptions } from "./useUserInfo";
import type { BattleSummary } from "../api/types";

/** 共享战绩页的玩家标识：大区 + 账号类型 + 玩家标识（三者缺一不可） */
export interface BattleFeedKey {
  area: string;
  accountType: string;
  id: string;
}

/** 一页原始战绩：与筛选无关，因此可以在总览/列表之间共享 */
export interface BattlePage {
  data: BattleSummary[];
  hasMore: boolean;
}

/** 共享缓存的 key：大区、账号类型、玩家标识都要参与，避免不同玩家串数据 */
export function battleFeedKey(key: BattleFeedKey): string {
  return `${key.area}|${key.accountType}|${key.id}`;
}

/** 每页条数：与对局列表的 PAGE_SIZE 对齐（缓存以「原始页」为单位共享） */
const PAGE_SIZE = 10;
/** 原始页缓存有效期：同一交互内复用，也不至于长期记住旧战绩 */
const PAGE_TTL_MS = 30000;

interface CachedPage {
  data: BattleSummary[];
  hasMore: boolean;
  /** 写入缓存的时间戳（用于 TTL 判定） */
  at: number;
}

interface FeedRequest {
  promise: Promise<BattlePage>;
  controller: AbortController;
  /** 正在等待这一页的调用方；最后一个离开时才真正中止底层请求 */
  waiters: Set<symbol>;
  settled: boolean;
  /** 被 invalidate 作废：结束后不写回缓存，也不再被复用 */
  stale: boolean;
}

interface FeedEntry {
  pages: Map<number, CachedPage>;
  inflight: Map<number, FeedRequest>;
}

/** 模块级：同一玩家（key）的战绩页缓存与在途请求在所有组件间共享 */
const feedEntries = new Map<string, FeedEntry>();

function entryOf(keyText: string): FeedEntry {
  let entry = feedEntries.get(keyText);
  if (!entry) {
    entry = { pages: new Map(), inflight: new Map() };
    feedEntries.set(keyText, entry);
  }
  return entry;
}

/** 发起一次真正的取页请求（用内部 signal，避免某个调用方的 abort 误伤其它等待方） */
function startRequest(key: BattleFeedKey, entry: FeedEntry, page: number): FeedRequest {
  const controller = new AbortController();
  const request: FeedRequest = {
    // 占位，真正的 promise 在下面同步创建后立即覆盖
    promise: Promise.resolve<BattlePage>({ data: [], hasMore: false }),
    controller,
    waiters: new Set<symbol>(),
    settled: false,
    stale: false
  };
  request.promise = run();
  // 所有等待方都可能先离开（请求被中止）：挂一个空拒绝处理，避免 unhandled rejection
  request.promise.catch(() => {});
  return request;

  async function run(): Promise<BattlePage> {
    try {
      const data = await lolBattleApi.getBattleList(
        toRqOptions(key),
        { count: PAGE_SIZE, offset: page * PAGE_SIZE },
        { signal: controller.signal }
      );
      const result: BattlePage = { data, hasMore: data.length >= PAGE_SIZE };
      // 被 invalidate 过（或被新请求取代）的响应不写缓存：否则刷新会看到旧数据
      if (!request.stale) entry.pages.set(page, { data, hasMore: result.hasMore, at: Date.now() });
      return result;
    } finally {
      request.settled = true;
      if (entry.inflight.get(page) === request) entry.inflight.delete(page);
    }
  }
}

/** 等共享请求的结果；本调用方的 signal 只影响自己的等待，不强行中止共享请求 */
function awaitRequest(request: FeedRequest, signal?: AbortSignal): Promise<BattlePage> {
  const waiter = Symbol("battle-feed-waiter");
  request.waiters.add(waiter);
  const leave = (): void => {
    request.waiters.delete(waiter);
    // 还有别的组件在等：让底层请求继续；自己是最后一个等待方时才真正中止
    if (!request.settled && request.waiters.size === 0) request.controller.abort();
  };
  return new Promise<BattlePage>((resolve, reject) => {
    if (!signal) {
      request.promise.then(
        (page) => { leave(); resolve(page); },
        (error) => { leave(); reject(error); }
      );
      return;
    }
    if (signal.aborted) {
      leave();
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      leave();
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    request.promise.then(
      (page) => {
        signal.removeEventListener("abort", onAbort);
        leave();
        resolve(page);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        leave();
        reject(error);
      }
    );
  });
}

/** 清空某个玩家的页缓存与在途标记（在途 promise 让其自然结束，不再复用/不再写缓存） */
function invalidateEntry(keyText: string): void {
  const entry = feedEntries.get(keyText);
  if (!entry) return;
  entry.pages.clear();
  for (const request of entry.inflight.values()) request.stale = true;
  entry.inflight.clear();
}

/** 测试用：清空所有玩家的缓存与在途标记 */
export function clearBattleFeedCache(): void {
  for (const keyText of [...feedEntries.keys()]) invalidateEntry(keyText);
  feedEntries.clear();
}

/**
 * 玩家级共享战绩页数据源：
 * - 同一玩家同一页的并发请求只发一次，所有调用方等同一个在途 promise；
 * - 页缓存按 TTL 复用，force 可绕过缓存；
 * - 每个调用方的 signal 只影响自己的等待，不会因为别的组件 abort 而丢掉共享结果。
 */
export function useBattleFeed(key: () => BattleFeedKey): {
  getPage(page: number, options?: { force?: boolean; signal?: AbortSignal }): Promise<BattlePage>;
  invalidate(): void;
} {
  async function getPage(
    page: number,
    options: { force?: boolean; signal?: AbortSignal } = {}
  ): Promise<BattlePage> {
    const currentKey = key();
    const entry = entryOf(battleFeedKey(currentKey));
    const cached = entry.pages.get(page);
    if (!options.force && cached) {
      const age = Date.now() - cached.at;
      // 时钟回拨（age < 0）时时间戳不可信，按过期处理
      if (age >= 0 && age < PAGE_TTL_MS) {
        return { data: cached.data, hasMore: cached.hasMore };
      }
    }
    let request = entry.inflight.get(page);
    // 最后一个等待方已经离开、底层请求正在中止：不要复用它，直接发新的
    if (request && request.controller.signal.aborted) request = undefined;
    if (!request) {
      request = startRequest(currentKey, entry, page);
      entry.inflight.set(page, request);
    }
    return awaitRequest(request, options.signal);
  }

  function invalidate(): void {
    invalidateEntry(battleFeedKey(key()));
  }

  return { getPage, invalidate };
}
