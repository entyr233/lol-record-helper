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
