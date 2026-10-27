import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OverviewBattle, RqOptions } from "../src/api/types";

const getBattleOverview = vi.fn();

vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleOverview: (...args: unknown[]) => getBattleOverview(...args)
  }
}));

const { useBattleList } = await import("../src/composables/useBattleList");

const rq: RqOptions = { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" };

function battle(id: string): OverviewBattle {
  return {
    game_id: id,
    game_start_time: 1700000000000,
    game_time_played: 1800,
    queue_id: 420,
    champion_id: 17,
    win: "Win",
    mvp: 0,
    svp: 0
  };
}

beforeEach(() => {
  getBattleOverview.mockReset();
});

describe("useBattleList（GetBattleOverview 版）", () => {
  it("一次加载最近对局并自动选中第一局", async () => {
    getBattleOverview.mockResolvedValueOnce({
      nick: "测试",
      battles: [battle("a"), battle("b")],
      season: { sid: 100, tier: 15, win_point: 59 }
    });

    const state = useBattleList(() => rq);
    await state.load();

    expect(state.battles.value).toHaveLength(2);
    expect(state.selectedGameId.value).toBe("a");
    expect(state.overview.value?.season?.tier).toBe(15);
  });

  it("请求体使用现任格式（gameids 空数组 + source lcu）", async () => {
    getBattleOverview.mockResolvedValueOnce({ battles: [] });
    const state = useBattleList(() => rq);
    await state.load();
    expect(getBattleOverview).toHaveBeenCalledWith(rq);
  });

  it("空列表不选中、hasMore 概念不再存在", async () => {
    getBattleOverview.mockResolvedValueOnce({ battles: [] });
    const state = useBattleList(() => rq);
    await state.load();
    expect(state.selectedGameId.value).toBeNull();
    expect(state.battles.value).toHaveLength(0);
  });

  it("请求失败时记录错误且可重试", async () => {
    getBattleOverview.mockRejectedValueOnce(new Error("网络错误")).mockResolvedValueOnce({ battles: [battle("a")] });
    const state = useBattleList(() => rq);
    await state.load();
    expect(state.error.value?.message).toBe("网络错误");
    await state.load();
    expect(state.error.value).toBeNull();
    expect(state.battles.value).toHaveLength(1);
  });
});
