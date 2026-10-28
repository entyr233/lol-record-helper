import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleSummary } from "../src/api/types";

const getBattleList = vi.fn();

vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleList: (...args: unknown[]) => getBattleList(...args)
  }
}));

const { battleFeedKey, useBattleFeed, clearBattleFeedCache } = await import("../src/composables/battleFeed");

const key = { area: "1", accountType: "2", id: "abc" };

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

function page(prefix: string, count = 10): BattleSummary[] {
  return Array.from({ length: count }, (_, index) => battle(prefix + index));
}

beforeEach(() => {
  getBattleList.mockReset();
  clearBattleFeedCache();
});

describe("battleFeedKey", () => {
  it("按大区|账号类型|玩家标识拼接，三个维度都参与", () => {
    expect(battleFeedKey({ area: "1", accountType: "2", id: "abc" })).toBe("1|2|abc");
    expect(battleFeedKey({ area: "2", accountType: "2", id: "abc" })).not.toBe(
      battleFeedKey({ area: "1", accountType: "2", id: "abc" })
    );
  });
});

describe("useBattleFeed.getPage（共享缓存与在途请求）", () => {
  it("同一玩家同一页并发只发 1 次请求，所有调用方共享同一份结果", async () => {
    let resolvePage!: (items: BattleSummary[]) => void;
    getBattleList.mockReturnValueOnce(new Promise<BattleSummary[]>((resolve) => { resolvePage = resolve; }));

    const feedA = useBattleFeed(() => key);
    const feedB = useBattleFeed(() => ({ ...key }));
    const pendingA = feedA.getPage(0);
    const pendingB = feedB.getPage(0);

    // 在途请求被复用：还没返回时只调用了一次接口
    expect(getBattleList).toHaveBeenCalledTimes(1);
    resolvePage(page("a"));

    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);
    expect(resultA.data).toHaveLength(10);
    expect(resultA.hasMore).toBe(true);
    expect(resultB.data).toBe(resultA.data);
    expect(getBattleList).toHaveBeenCalledTimes(1);
    expect(getBattleList).toHaveBeenCalledWith(
      { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" },
      { count: 10, offset: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("不同玩家 / 大区 / 账号类型的缓存互不共享", async () => {
    getBattleList.mockResolvedValue(page("x"));
    const otherId = { ...key, id: "def" };
    const otherArea = { ...key, area: "2" };
    const otherType = { ...key, accountType: "1" };

    for (const target of [key, otherId, otherArea, otherType]) {
      const feed = useBattleFeed(() => target);
      await feed.getPage(0);
    }

    expect(getBattleList).toHaveBeenCalledTimes(4);
    const ids = getBattleList.mock.calls.map((call) => (call[0] as { id: string }).id);
    expect(ids).toEqual(["abc", "def", "abc", "abc"]);
    const areas = getBattleList.mock.calls.map((call) => (call[0] as { area: number }).area);
    expect(areas).toEqual([1, 1, 2, 1]);
    const types = getBattleList.mock.calls.map((call) => (call[0] as { account_type: number }).account_type);
    expect(types).toEqual([2, 2, 2, 1]);
  });

  it("TTL 内复用缓存、过期后重新请求、force 可绕过缓存", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    getBattleList.mockResolvedValue(page("a"));
    const feed = useBattleFeed(() => key);

    const first = await feed.getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(1);

    // TTL 内：直接复用，不再请求
    const second = await feed.getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(1);
    expect(second.data).toBe(first.data);

    // force 绕过缓存：重新请求
    await feed.getPage(0, { force: true });
    expect(getBattleList).toHaveBeenCalledTimes(2);

    // 超过 TTL：重新请求
    now.mockReturnValue(1_000_000 + 30_001);
    await feed.getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(3);

    now.mockRestore();
  });

  it("连续浏览时最多缓存 8 个玩家，每个玩家最多缓存 20 页", async () => {
    getBattleList.mockResolvedValue(page("a"));
    for (let id = 0; id < 9; id++) await useBattleFeed(() => ({ ...key, id: String(id) })).getPage(0);
    await useBattleFeed(() => ({ ...key, id: "8" })).getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(9);
    await useBattleFeed(() => ({ ...key, id: "0" })).getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(10);

    clearBattleFeedCache();
    getBattleList.mockClear();
    const feed = useBattleFeed(() => key);
    for (let page = 0; page < 21; page++) await feed.getPage(page);
    await feed.getPage(20);
    expect(getBattleList).toHaveBeenCalledTimes(21);
    await feed.getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(22);
  });

  it("invalidate 后重新请求，且旧的在途结果不写回缓存", async () => {
    let resolveOld!: (items: BattleSummary[]) => void;
    let resolveNew!: (items: BattleSummary[]) => void;
    getBattleList
      .mockReturnValueOnce(new Promise<BattleSummary[]>((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<BattleSummary[]>((resolve) => { resolveNew = resolve; }));

    const feed = useBattleFeed(() => key);
    const oldPending = feed.getPage(0);
    feed.invalidate();
    const newPending = feed.getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(2);

    resolveNew(page("new"));
    expect((await newPending).data[0].game_id).toBe("new0");
    // 旧请求自然结束：调用方仍能拿到结果，但结果不再复用/不再写缓存
    resolveOld(page("old"));
    expect((await oldPending).data[0].game_id).toBe("old0");

    const cached = await feed.getPage(0);
    expect(cached.data[0].game_id).toBe("new0");
    expect(getBattleList).toHaveBeenCalledTimes(2);
  });

  it("请求失败不缓存：再次取同一页会重新请求", async () => {
    getBattleList.mockRejectedValueOnce(new Error("网络错误")).mockResolvedValueOnce(page("a"));
    const feed = useBattleFeed(() => key);

    await expect(feed.getPage(0)).rejects.toThrow("网络错误");
    const retried = await feed.getPage(0);

    expect(retried.data).toHaveLength(10);
    expect(getBattleList).toHaveBeenCalledTimes(2);
  });

  it("复用别处的在途请求时，本调用方 abort 只影响自己的等待", async () => {
    let resolvePage!: (items: BattleSummary[]) => void;
    getBattleList.mockReturnValueOnce(new Promise<BattleSummary[]>((resolve) => { resolvePage = resolve; }));

    const owner = useBattleFeed(() => key);
    const joiner = useBattleFeed(() => key);
    const controller = new AbortController();
    const ownerPending = owner.getPage(0, { signal: controller.signal });
    const joinerPending = joiner.getPage(0);
    expect(getBattleList).toHaveBeenCalledTimes(1);

    // 复用方（owner）abort：自己不再等待，但共享请求不能被中止
    controller.abort();
    await expect(ownerPending).rejects.toMatchObject({ name: "AbortError" });

    resolvePage(page("a"));
    const joined = await joinerPending;
    expect(joined.data).toHaveLength(10);
    expect(getBattleList).toHaveBeenCalledTimes(1);
  });

  it("最后一个等待方 abort 时才真正中止底层请求", async () => {
    let aborted = false;
    getBattleList.mockImplementationOnce((_rq: unknown, _params: unknown, options?: { signal?: AbortSignal }) =>
      new Promise<BattleSummary[]>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    );

    const feed = useBattleFeed(() => key);
    const controller = new AbortController();
    const pending = feed.getPage(0, { signal: controller.signal });

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(aborted).toBe(true);
  });

  it("页号映射到 offset，不足一页时 hasMore=false", async () => {
    getBattleList.mockResolvedValueOnce([battle("only")]);
    const feed = useBattleFeed(() => key);

    const result = await feed.getPage(2);

    expect(getBattleList).toHaveBeenCalledWith(
      expect.objectContaining({ id: "abc" }),
      { count: 10, offset: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.hasMore).toBe(false);
    expect(result.data).toHaveLength(1);
  });

  it("已取消请求即使迟到成功，也不能覆盖同页的新缓存", async () => {
    let resolveOld!: (items: BattleSummary[]) => void;
    getBattleList.mockReturnValueOnce(new Promise<BattleSummary[]>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(page("fresh"));
    const feed = useBattleFeed(() => key);
    const controller = new AbortController();
    const pending = feed.getPage(0, { signal: controller.signal });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await cancelled;
    await feed.getPage(0);
    resolveOld(page("old"));
    await Promise.resolve();
    expect((await feed.getPage(0)).data[0].game_id).toBe("fresh0");
    expect(getBattleList).toHaveBeenCalledTimes(2);
  });
});
