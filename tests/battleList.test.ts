import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleSummary, RqOptions } from "../src/api/types";

const getBattleList = vi.fn();

vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleList: (...args: unknown[]) => getBattleList(...args)
  }
}));

const { useBattleList, PAGE_SIZE } = await import("../src/composables/useBattleList");

const rq: RqOptions = { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" };

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
    const filtered = Array.from({ length: PAGE_SIZE }, (_, i) => battle("f" + i));
    const target = { ...battle("t9"), champion_id: 99 };
    const refound = [target, ...Array.from({ length: PAGE_SIZE - 1 }, (_, i) => battle("r" + i))];
    getBattleList
      .mockResolvedValueOnce(filtered)
      .mockResolvedValueOnce(filtered)
      .mockResolvedValue(refound);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.setFilter({ champion: 17 });
    const result = await state.focusGame(target);

    expect(result.filterReset).toBe(true);
    expect(result.battle?.game_id).toBe("t9");
    expect(state.filter.value).toEqual({ mode: "all", champion: null, result: "all", days: 0 });
    expect(state.page.value).toBe(1);
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
  it("setFilter 后仍保留此前英雄，并继续累加场次", async () => {
    const pageP1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("p" + i), champion_id: 17 }));
    const pageP2 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("q" + i), champion_id: 22 }));
    const pageP3 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...battle("r" + i), champion_id: 17 }));
    getBattleList
      .mockResolvedValueOnce(pageP1)
      .mockResolvedValueOnce(pageP2)
      .mockResolvedValue(pageP3);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    await state.goToPage(2);
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }, { id: 22, count: 10 }]);

    await state.setFilter({ champion: 17 });
    // 筛选模式重新拉原始页：新出现的 17 继续累加，22 不因 setFilter 丢失
    expect(state.championPool.value).toEqual([{ id: 17, count: 20 }, { id: 22, count: 10 }]);
    expect(state.filter.value.champion).toBe(17);
  });

  it("同一页被重复拉取时按 game_id 去重，计数不翻倍", async () => {
    const pageP1 = Array.from({ length: PAGE_SIZE }, (_, i) => battle("p" + i));
    getBattleList.mockResolvedValueOnce(pageP1).mockResolvedValue(pageP1);

    const state = useBattleList(() => rq);
    await state.goToPage(1);
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }]);

    // 筛选模式会把同一页再拉一遍，但 game_id 已见过，不应重复计数
    await state.setFilter({ champion: 17 });
    expect(state.championPool.value).toEqual([{ id: 17, count: 10 }]);
  });
});
