import { beforeEach, describe, expect, it, vi } from "vitest";
import { watch } from "vue";
import type { BattleSummary, RqOptions } from "../src/api/types";

const getBattleList = vi.fn();

vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleList: (...args: unknown[]) => getBattleList(...args)
  }
}));

const { useBattleList, PAGE_SIZE } = await import("../src/composables/useBattleList");

const rq: RqOptions = { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" };

function battle(id: string, patch: Partial<BattleSummary> = {}): BattleSummary {
  return {
    game_id: id,
    game_start_time: "1700000000000",
    game_time_played: 1800,
    game_queue_id: 420,
    champion_id: 17,
    win: "Win",
    kills: 1,
    deaths: 2,
    assists: 3,
    ...patch
  };
}

beforeEach(() => {
  getBattleList.mockReset();
});

describe("useBattleList（翻页版）", () => {
  it("第 1 页 offset=0，满页时允许下一页", async () => {
    const page = Array.from({ length: PAGE_SIZE }, (_, i) => battle(String(i + 1)));
    getBattleList.mockResolvedValueOnce(page);

    const state = useBattleList(() => rq);
    await state.goToPage(1);

    expect(getBattleList).toHaveBeenCalledWith(rq, { count: PAGE_SIZE, offset: 0 });
    expect(state.battles.value).toHaveLength(PAGE_SIZE);
    expect(state.page.value).toBe(1);
    expect(state.hasNext.value).toBe(true);
    expect(state.hasPrev.value).toBe(false);
  });

  it("第 2 页 offset=10，整页替换不叠加", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    getBattleList.mockResolvedValueOnce(pageA).mockResolvedValueOnce(pageB);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);

    expect(getBattleList).toHaveBeenNthCalledWith(2, rq, { count: PAGE_SIZE, offset: 10 });
    expect(state.battles.value).toHaveLength(PAGE_SIZE);
    expect(state.battles.value[0].game_id).toBe("b0");
    expect(state.hasPrev.value).toBe(true);
  });

  it("不足一页时没有下一页", async () => {
    getBattleList.mockResolvedValueOnce([battle("a")]);
    const state = useBattleList(() => rq);
    await state.goToPage(1);
    expect(state.hasNext.value).toBe(false);
  });

  it("翻页后选中局不在新页时自动选中第一局", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    getBattleList.mockResolvedValueOnce(pageA).mockResolvedValueOnce(pageB);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    state.select("a3");
    await state.goToPage(2);
    expect(state.selectedGameId.value).toBe("b0");
  });

  it("页内重复 game_id 去重", async () => {
    const dup = battle("x");
    getBattleList.mockResolvedValueOnce([dup, dup, battle("y")]);
    const state = useBattleList(() => rq);
    await state.goToPage(1);
    expect(state.battles.value).toHaveLength(2);
  });

  it("请求失败记录错误，可重试", async () => {
    getBattleList.mockRejectedValueOnce(new Error("网络错误")).mockResolvedValueOnce([battle("a")]);
    const state = useBattleList(() => rq);
    await state.goToPage(1);
    expect(state.error.value?.message).toBe("网络错误");
    await state.goToPage(1);
    expect(state.error.value).toBeNull();
    expect(state.battles.value).toHaveLength(1);
  });
});

describe("useBattleList.focusGame（跨页定位）", () => {
  it("无筛选时定位到第二页的对局并选中", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    getBattleList.mockResolvedValueOnce(pageA).mockResolvedValueOnce(pageB);

    const state = useBattleList(() => rq);
    const result = await state.focusGame(battle("b1"));

    expect(result.filterReset).toBe(false);
    expect(result.battle?.game_id).toBe("b1");
    expect(state.page.value).toBe(2);
    expect(state.selectedGameId.value).toBe("b1");
    expect(state.error.value).toBeNull();
    expect(getBattleList).toHaveBeenNthCalledWith(2, rq, { count: PAGE_SIZE, offset: 10 });
  });

  it("筛选状态且该场匹配时，在筛选结果里定位并翻到所在页", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    getBattleList.mockResolvedValueOnce(pageA).mockResolvedValueOnce(pageA).mockResolvedValueOnce(pageB);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.setFilter({ champion: 17 });
    // 筛选结果第 11 条在第二页：焦点对局会先续拉原始页 2，再翻到筛选结果第 2 页
    const result = await state.focusGame(battle("b2"));

    expect(result.filterReset).toBe(false);
    expect(result.battle?.game_id).toBe("b2");
    expect(state.filter.value.champion).toBe(17);
    expect(state.page.value).toBe(2);
    expect(state.selectedGameId.value).toBe("b2");
  });

  it("筛选状态且该场不匹配时，重置筛选后再定位", async () => {
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => battle("f" + i));
    const target = { ...battle("t9"), champion_id: 99 };
    const page1 = [target, ...Array.from({ length: PAGE_SIZE - 1 }, (_, i) => battle("r" + i))];
    getBattleList.mockImplementation((_rq: unknown, query: { offset?: number }) =>
      Promise.resolve(query.offset === 0 ? page0 : query.offset === PAGE_SIZE ? page1 : [])
    );

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.setFilter({ champion: 17 });
    const result = await state.focusGame(target);

    expect(result.filterReset).toBe(true);
    expect(result.battle?.game_id).toBe("t9");
    expect(state.filter.value).toEqual({ mode: "all", champion: null, result: "all", days: 0 });
    // 目标在原始第 2 页：重置筛选后按真实页定位
    expect(state.page.value).toBe(2);
    expect(state.selectedGameId.value).toBe("t9");
  });

  it("目标就在当前页时直接选中，不再重复拉第 1 页", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    getBattleList.mockResolvedValueOnce(pageA).mockResolvedValueOnce(pageB);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);
    getBattleList.mockClear();

    const result = await state.focusGame(battle("b4"));

    expect(result.filterReset).toBe(false);
    expect(result.battle?.game_id).toBe("b4");
    expect(state.selectedGameId.value).toBe("b4");
    expect(state.page.value).toBe(2);
    expect(getBattleList).not.toHaveBeenCalled();
  });

  it("目标不存在时回到原页并恢复选中（不把列表停在空页）", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    // 第 3 页起没有数据：总数正好 20 场
    getBattleList.mockImplementation((_options: unknown, query: { offset?: number }) =>
      Promise.resolve(query.offset === 0 ? pageA : query.offset === PAGE_SIZE ? pageB : [])
    );

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);
    state.select("b3");

    const result = await state.focusGame(battle("nope"));

    expect(result.battle).toBeNull();
    expect(state.page.value).toBe(2);
    expect(state.selectedGameId.value).toBe("b3");
    expect(state.battles.value.map((item) => item.game_id)).toEqual(pageB.map((item) => item.game_id));
  });

  it("跨页定位复用已加载页：不重复请求，且只改一次选中", async () => {
    const pageA = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const pageB = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    getBattleList.mockImplementation((_rq: unknown, query: { offset?: number }) =>
      Promise.resolve(query.offset === 0 ? pageA : pageB)
    );

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);
    getBattleList.mockClear();

    let changes = 0;
    const stop = watch(state.selectedGameId, () => { changes += 1; }, { flush: "sync" });
    const result = await state.focusGame(battle("a2"));
    stop();

    expect(result.battle?.game_id).toBe("a2");
    expect(state.page.value).toBe(1);
    // 第 1、2 页都在缓存里：定位不应该再发请求，也不该在中间页反复改选中
    expect(getBattleList).not.toHaveBeenCalled();
    expect(changes).toBe(1);
  });

  it("定位失败不改动当前页的翻页状态（末尾空页不会禁用「下一页」）", async () => {
    const pages = [
      Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i)),
      Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i)),
      Array.from({ length: PAGE_SIZE }, (_, i) => battle("c" + i))
    ];
    // 30 场：第 1~3 页有数据，第 4 页为空（查找会探测到这一页）
    getBattleList.mockImplementation((_rq: unknown, query: { offset?: number }) => {
      const offset = query.offset ?? 0;
      return Promise.resolve(pages[offset / PAGE_SIZE] ?? []);
    });

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    expect(state.hasNext.value).toBe(true);

    const result = await state.focusGame(battle("nope"));

    expect(result.battle).toBeNull();
    expect(state.page.value).toBe(1);
    // 关键：定位探测过末尾空页，但当前展示页仍是第 1 页，「下一页」必须可用
    expect(state.hasNext.value).toBe(true);
    expect(state.battles.value).toHaveLength(PAGE_SIZE);
  });

  it("筛选模式下定位时一次翻页就选中目标，不先选该页第一场", async () => {
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i));
    const page2 = Array.from({ length: PAGE_SIZE }, (_, i) => battle("c" + i));
    const target = page2[4]!;
    getBattleList.mockImplementation((_rq: unknown, query: { offset?: number }) => {
      const offset = query.offset ?? 0;
      if (offset === 0) return Promise.resolve(page0);
      if (offset === PAGE_SIZE) return Promise.resolve(page1);
      if (offset === PAGE_SIZE * 2) return Promise.resolve(page2);
      return Promise.resolve([]);
    });

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.setFilter({ champion: 17 });

    let changes = 0;
    const stop = watch(state.selectedGameId, () => { changes += 1; }, { flush: "sync" });
    const result = await state.focusGame(target);
    stop();

    expect(result.battle?.game_id).toBe(target.game_id);
    expect(state.page.value).toBe(3);
    expect(state.selectedGameId.value).toBe(target.game_id);
    // 选中顺序不应是「第 21 场 → 第 25 场」：翻页与选中一次完成
    expect(changes).toBe(1);
  });

  it("找不到时返回 null 且不改动选中", async () => {
    getBattleList.mockResolvedValue([]);
    const state = useBattleList(() => rq);
    await state.goToPage(1);
    state.select("keep-me");

    const result = await state.focusGame(battle("missing"));

    expect(result.battle).toBeNull();
    expect(result.filterReset).toBe(false);
    expect(state.selectedGameId.value).toBe("keep-me");
  });
});

describe("useBattleList.championPool（英雄下拉池）", () => {
  it("setFilter 后仍保留此前英雄，重复页不重复计数", async () => {
    const pageP1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("p" + i), champion_id: 17 }));
    const pageP2 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("q" + i), champion_id: 22 }));
    getBattleList
      .mockResolvedValueOnce(pageP1)
      .mockResolvedValueOnce(pageP2)
      .mockResolvedValue(pageP1);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }, { id: 22, count: 10 }]);

    // 筛选模式复用已缓存页：既不会重复计数，也不会丢掉之前的英雄
    await state.setFilter({ champion: 17 });
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }, { id: 22, count: 10 }]);
    expect(state.filter.value.champion).toBe(17);
  });

  it("同一页被重复拉取时按 game_id 去重，计数不翻倍", async () => {
    const pageP1 = Array.from({ length: PAGE_SIZE }, (_, i) => battle("p" + i));
    getBattleList.mockResolvedValueOnce(pageP1).mockResolvedValue(pageP1);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }]);

    // 筛选模式会复用同一页，game_id 已见过，不应重复计数
    await state.setFilter({ champion: 17 });
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }]);
  });

  it("定位到新页时只累加首次出现的对局", async () => {
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("p" + i), champion_id: 17 }));
    const page2 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("q" + i), champion_id: 22 }));
    const page3 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("r" + i), champion_id: 23 }));
    getBattleList.mockImplementation((_rq: unknown, query: { offset?: number }) => {
      const offset = query.offset ?? 0;
      if (offset === 0) return Promise.resolve(page1);
      if (offset === PAGE_SIZE) return Promise.resolve(page2);
      if (offset === PAGE_SIZE * 2) return Promise.resolve(page3);
      return Promise.resolve([]);
    });

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);
    const target = page3[0]!;
    const result = await state.focusGame(target);

    expect(result.battle?.game_id).toBe(target.game_id);
    expect(state.page.value).toBe(3);
    expect(state.championPool.value).toEqual([
      { id: 17, count: 10 },
      { id: 22, count: 10 },
      { id: 23, count: 10 }
    ]);
  });
});

describe("useBattleList 筛选口径与竞态", () => {
  it("「只看胜利/失败」与总览同口径：Leaver 按胜/负算，重开两边都不算", async () => {
    const page = [
      battle("w1"),
      battle("w2", { win: "LeaverWin" }),
      battle("m1", { win: "Win", was_early_surrender: 1 }),
      battle("l1", { win: "Fail" }),
      battle("l2", { win: "LeaverFail" }),
      battle("m2", { win: "Fail", was_early_surrender: 1 })
    ];
    getBattleList.mockResolvedValue(page);

    const state = useBattleList(() => rq);
    await state.goToPage(1);

    await state.setFilter({ result: "win" });
    expect(state.battles.value.map((item) => item.game_id)).toEqual(["w1", "w2"]);

    await state.setFilter({ result: "fail" });
    expect(state.battles.value.map((item) => item.game_id)).toEqual(["l1", "l2"]);
  });

  it("筛选结果为空时清空选中（右侧不再显示已筛掉的旧对局）", async () => {
    const page = [battle("a1"), battle("a2")];
    getBattleList.mockResolvedValue(page);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    state.select("a2");
    expect(state.selectedGameId.value).toBe("a2");

    await state.setFilter({ champion: 99 });

    expect(state.battles.value).toHaveLength(0);
    expect(state.selectedGameId.value).toBeNull();
  });

  it("加载期间切换筛选：旧响应被丢弃，最终展示新筛选结果", async () => {
    const stale = Array.from({ length: PAGE_SIZE }, (_, i) => battle("a" + i));
    const fresh = Array.from({ length: PAGE_SIZE }, (_, i) => battle("b" + i, { win: "Fail" }));
    let resolveStale!: (items: BattleSummary[]) => void;
    const stalePending = new Promise<BattleSummary[]>((resolve) => { resolveStale = resolve; });
    getBattleList.mockReturnValueOnce(stalePending).mockResolvedValueOnce(fresh);

    const state = useBattleList(() => rq);
    const loading = state.goToPage(1);
    const filtering = state.setFilter({ result: "fail" });
    // 旧请求在筛选切换之后才返回：不应覆盖新筛选的结果
    resolveStale(stale);
    await Promise.all([loading, filtering]);

    expect(state.filter.value.result).toBe("fail");
    expect(state.page.value).toBe(1);
    expect(state.battles.value).toHaveLength(PAGE_SIZE);
    expect(state.battles.value.every((item) => item.win === "Fail")).toBe(true);
  });
});
