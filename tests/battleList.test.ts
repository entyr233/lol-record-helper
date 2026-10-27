import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleSummary, RqOptions } from "../src/api/types";

const getBattleList = vi.fn();

vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleList: (...args: unknown[]) => getBattleList(...args)
  }
}));

const { useBattleList } = await import("../src/composables/useBattleList");

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

describe("useBattleList", () => {
  it("offset 用服务端已消费条数，而不是去重后的本地长度", async () => {
    const page = Array.from({ length: 10 }, (_, i) => battle(String(i + 1)));
    getBattleList.mockResolvedValueOnce(page).mockResolvedValueOnce(page);

    const state = useBattleList(() => rq);
    await state.loadMore();
    await state.loadMore();

    expect(getBattleList).toHaveBeenNthCalledWith(1, rq, { count: 10, offset: 0 });
    expect(getBattleList).toHaveBeenNthCalledWith(2, rq, { count: 10, offset: 10 });
    // 第二页全是重复数据，本地去重后不应增长，但 offset 仍必须前进
    expect(state.battles.value).toHaveLength(10);
  });

  it("首屏自动选中第一局", async () => {
    getBattleList.mockResolvedValueOnce([battle("a"), battle("b")]);
    const state = useBattleList(() => rq);
    await state.loadMore();
    expect(state.selectedGameId.value).toBe("a");
  });

  it("返回不足一页时停止加载", async () => {
    getBattleList.mockResolvedValueOnce([battle("a")]);
    const state = useBattleList(() => rq);
    await state.loadMore();
    expect(state.hasMore.value).toBe(false);
  });

  it("请求失败时记录错误且不中断后续重试", async () => {
    getBattleList.mockRejectedValueOnce(new Error("网络错误")).mockResolvedValueOnce([battle("a")]);
    const state = useBattleList(() => rq);
    await state.loadMore();
    expect(state.error.value?.message).toBe("网络错误");
    await state.loadMore();
    expect(state.error.value).toBeNull();
    expect(state.battles.value).toHaveLength(1);
  });
});
