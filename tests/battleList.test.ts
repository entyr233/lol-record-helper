import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import type { BattleSummary, RqOptions } from "../src/api/types";

const getBattleList = vi.fn();

vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleList: (...args: unknown[]) => getBattleList(...args)
  }
}));

const { useBattleList } = await import("../src/composables/useBattleList");

const rq: RqOptions = { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" };
const scopes: EffectScope[] = [];

function createState() {
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(() => useBattleList(() => rq))!;
  return { scope, state };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function battle(id: string): BattleSummary {
  return {
    game_id: id,
    game_start_time: "1700000000000",
    game_time_played: 1800,
    game_queue_id: 420,
    champion_id: 17,
    win: "Win",
    kills: 1,
    deaths: 2,
    assists: 3
  };
}

beforeEach(() => {
  getBattleList.mockReset();
});

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useBattleList", () => {
  it("offset 用服务端已消费条数，而不是去重后的本地长度", async () => {
    const page = Array.from({ length: 10 }, (_, i) => battle(String(i + 1)));
    getBattleList.mockResolvedValueOnce(page).mockResolvedValueOnce(page);

    const { state } = createState();
    await state.loadMore();
    await state.loadMore();

    expect(getBattleList).toHaveBeenNthCalledWith(1, rq, { count: 10, offset: 0 }, { signal: expect.any(AbortSignal) });
    expect(getBattleList).toHaveBeenNthCalledWith(2, rq, { count: 10, offset: 10 }, { signal: expect.any(AbortSignal) });
    // 第二页全是重复数据，本地去重后不应增长，但 offset 仍必须前进
    expect(state.battles.value).toHaveLength(10);
  });

  it("首屏自动选中第一局", async () => {
    getBattleList.mockResolvedValueOnce([battle("a"), battle("b")]);
    const { state } = createState();
    await state.loadMore();
    expect(state.selectedGameId.value).toBe("a");
  });

  it("返回不足一页时停止加载", async () => {
    getBattleList.mockResolvedValueOnce([battle("a")]);
    const { state } = createState();
    await state.loadMore();
    expect(state.hasMore.value).toBe(false);
  });

  it("请求失败时记录错误且不中断后续重试", async () => {
    getBattleList.mockRejectedValueOnce(new Error("网络错误")).mockResolvedValueOnce([battle("a")]);
    const { state } = createState();
    await state.loadMore();
    expect(state.error.value?.message).toBe("网络错误");
    await state.loadMore();
    expect(state.error.value).toBeNull();
    expect(state.battles.value).toHaveLength(1);
  });

  it("同一批次立即去重，保留首次出现的数据和原始顺序", async () => {
    getBattleList.mockResolvedValueOnce([
      battle("a"), { ...battle("a"), kills: 99 }, battle("b"), battle("a"), battle("c"), battle("b")
    ]);
    const { state } = createState();
    await state.loadMore();
    expect(state.battles.value.map((item) => item.game_id)).toEqual(["a", "b", "c"]);
    expect(state.battles.value[0]!.kills).toBe(1);
    expect(state.selectedGameId.value).toBe("a");
    expect(state.hasMore.value).toBe(false);
  });

  it("页内及跨页重复不影响服务端 offset、hasMore 和用户选择", async () => {
    getBattleList
      .mockResolvedValueOnce(Array.from({ length: 10 }, () => battle("a")))
      .mockResolvedValueOnce(Array.from({ length: 10 }, () => battle("a")))
      .mockResolvedValueOnce([battle("b"), battle("b"), battle("a"), battle("c")]);
    const { state } = createState();
    await state.loadMore();
    expect(state.hasMore.value).toBe(true);
    await state.loadMore();
    expect(state.battles.value).toHaveLength(1);
    expect(state.hasMore.value).toBe(true);
    state.select("chosen");
    await state.loadMore();
    expect(getBattleList.mock.calls.map((call) => call[1].offset)).toEqual([0, 10, 20]);
    expect(state.battles.value.map((item) => item.game_id)).toEqual(["a", "b", "c"]);
    expect(state.selectedGameId.value).toBe("chosen");
    expect(state.hasMore.value).toBe(false);
    await state.loadMore();
    expect(getBattleList).toHaveBeenCalledTimes(3);
  });

  it("销毁时 abort；忽略不响应 abort 的迟到数据，且不再发起加载", async () => {
    const response = deferred<BattleSummary[]>();
    getBattleList.mockReturnValueOnce(response.promise);
    const { scope, state } = createState();
    const pending = state.loadMore();
    const signal = getBattleList.mock.calls[0]![2].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    scope.stop();
    expect(signal.aborted).toBe(true);
    expect(state.loading.value).toBe(false);
    response.resolve([battle("late")]);
    await pending;
    expect(state.battles.value).toEqual([]);
    expect(state.selectedGameId.value).toBeNull();
    expect(state.hasMore.value).toBe(true);
    expect(state.error.value).toBeNull();
    await state.loadMore();
    expect(getBattleList).toHaveBeenCalledTimes(1);
  });

  it.each([new Error("late network failure"), new DOMException("aborted", "AbortError")])(
    "销毁后迟到错误不污染状态（%s）", async (error) => {
      const response = deferred<BattleSummary[]>();
      getBattleList.mockReturnValueOnce(response.promise);
      const { scope, state } = createState();
      const pending = state.loadMore();
      scope.stop();
      response.reject(error);
      await pending;
      expect(state.error.value).toBeNull();
      expect(state.loading.value).toBe(false);
    }
  );

  it("Promise 已完成但 continuation 未执行时销毁仍阻止状态写回", async () => {
    getBattleList.mockResolvedValueOnce([battle("late")]);
    const { scope, state } = createState();
    const pending = state.loadMore();
    scope.stop();
    await pending;
    expect(state.battles.value).toEqual([]);
    expect(state.hasMore.value).toBe(true);
  });

  it("旧实例销毁后重开，新实例不受迟到结果影响；同时加载仍只请求一次", async () => {
    const oldResponse = deferred<BattleSummary[]>();
    getBattleList.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce([battle("new")]);
    const old = createState();
    const pending = old.state.loadMore();
    await old.state.loadMore();
    expect(getBattleList).toHaveBeenCalledTimes(1);
    old.scope.stop();
    const current = createState();
    await current.state.loadMore();
    oldResponse.resolve([battle("old")]);
    await pending;
    expect(current.state.battles.value.map((item) => item.game_id)).toEqual(["new"]);
    expect(current.state.selectedGameId.value).toBe("new");
    expect(old.state.battles.value).toEqual([]);
  });

  it("真实 API 客户端退避期间销毁，取消后续重试并清理计时器", async () => {
    vi.useFakeTimers();
    const actual = await vi.importActual<typeof import("../src/api/client")>("../src/api/client");
    getBattleList.mockImplementation(actual.lolBattleApi.getBattleList);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline test"));
    vi.stubGlobal("fetch", fetchMock);
    const { scope, state } = createState();
    const pending = state.loadMore();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    await pending;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(state.error.value).toBeNull();
  });

  it.each(["headers", "body"])("真实 API 客户端等待读取 %s 时销毁，会取消请求而不重试", async (stage) => {
    vi.useFakeTimers();
    const actual = await vi.importActual<typeof import("../src/api/client")>("../src/api/client");
    getBattleList.mockImplementation(actual.lolBattleApi.getBattleList);
    let transportSignal!: AbortSignal;
    const fetchMock = vi.fn((_url, init: RequestInit) => {
      transportSignal = init.signal!;
      if (stage === "headers") return new Promise((_resolve, reject) => {
        transportSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
      return new Response(new ReadableStream({ start(controller) {
        transportSignal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { scope, state } = createState();
    const pending = state.loadMore();
    await vi.advanceTimersByTimeAsync(0);
    scope.stop();
    await pending;
    expect(transportSignal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(state.battles.value).toEqual([]);
  });
});
