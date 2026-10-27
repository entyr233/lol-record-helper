import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecentStats from "../src/components/RecentStats.vue";
import type { BattleSummary } from "../src/api/types";

const api = vi.hoisted(() => ({ getBattleList: vi.fn() }));
vi.mock("../src/api/client", () => ({ lolBattleApi: api }));
// 英雄名走 mock（真实实现会请求 ddragon 之外的 gtimg 接口）；GameIcon 用到的纯函数保留原实现
vi.mock("../src/api/staticData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api/staticData")>();
  return {
    ...actual,
    championName: (id: number) => "英雄" + id,
    ensureChampionNames: async () => {}
  };
});

function battle(n: number, patch: Partial<BattleSummary> = {}): BattleSummary {
  return {
    game_id: "g" + n,
    game_start_time: "1700000000000",
    game_time_played: 1800,
    game_queue_id: 420,
    champion_id: 1,
    win: "Win",
    kills: 5,
    deaths: 2,
    assists: 8,
    ...patch
  };
}

function mockPages(recent: BattleSummary[], older: BattleSummary[] = []): void {
  api.getBattleList.mockImplementation(async (_rq: unknown, params: { offset: number }) =>
    params.offset === 0 ? recent : older
  );
}

function render(props: Record<string, unknown> = {}) {
  return mount(RecentStats, { props: { area: "1", accountType: "2", id: "test", ...props } });
}

/** 默认数据：5 胜（含 LeaverWin）× 4 负（含 LeaverFail）× 1 重开 = 10 场 */
const mixedRecent = [
  battle(1, { win: "Win" }),
  battle(2, { win: "LeaverWin" }),
  battle(3, { win: "Fail" }),
  battle(4, { win: "LeaverFail" }),
  battle(5, { win: "Fail", was_early_surrender: 1 }),
  battle(6, { win: "Win" }),
  battle(7, { win: "Fail" }),
  battle(8, { win: "Win" }),
  battle(9, { win: "Fail" }),
  battle(10, { win: "Win" })
];

beforeEach(() => {
  api.getBattleList.mockReset();
  mockPages(mixedRecent);
});

describe("RecentStats 三分类统计口径", () => {
  it("LeaverWin 计入胜、重开单列且不计入胜率分母（5胜4负，重开1 → 56%）", async () => {
    const wrapper = render();
    try {
      await flushPromises();
      expect(wrapper.get(".recent-title").text()).toContain("最近 10 场");
      expect(wrapper.get(".recent-wl").text()).toBe("5胜4负");
      expect(wrapper.text()).toContain("（重开 1）");
      expect(wrapper.get(".recent-wr").text()).toBe("56% 胜率");
      // 色块配色按三分类落到内层 strip-bar 上
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(10);
      expect(wrapper.findAll(".strip-bar--win")).toHaveLength(5);
      expect(wrapper.findAll(".strip-bar--lose")).toHaveLength(4);
      expect(wrapper.findAll(".strip-bar--remake")).toHaveLength(1);
      // 重开不再混进按钮上的结果类
      expect(wrapper.find(".strip-win").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it("读取顶部两页（offset 0 / 10），标题显示最近 20 场", async () => {
    const older = Array.from({ length: 10 }, (_, i) => battle(11 + i, { win: "Fail" }));
    mockPages(mixedRecent, older);
    const wrapper = render();
    try {
      await flushPromises();
      expect(wrapper.get(".recent-title").text()).toContain("最近 20 场");
      expect(wrapper.get(".recent-wl").text()).toBe("5胜14负");
      expect(api.getBattleList.mock.calls.map((call) => (call[1] as { offset: number }).offset)).toEqual([0, 10]);
    } finally { wrapper.unmount(); }
  });

  it("连续失败显示连败并带 recent-streak--lose", async () => {
    mockPages([
      battle(1, { win: "Fail" }),
      battle(2, { win: "Fail" }),
      battle(3, { win: "Fail" }),
      battle(4, { win: "Win" })
    ]);
    const wrapper = render();
    try {
      await flushPromises();
      const streak = wrapper.get(".recent-streak");
      expect(streak.text()).toBe("3连败");
      expect(streak.classes()).toContain("recent-streak--lose");
    } finally { wrapper.unmount(); }
  });

  it("重开不打断连胜", async () => {
    mockPages([
      battle(1, { win: "Win" }),
      battle(2, { win: "Fail", was_early_surrender: 1 }),
      battle(3, { win: "Win" }),
      battle(4, { win: "Win" }),
      battle(5, { win: "Fail" })
    ]);
    const wrapper = render();
    try {
      await flushPromises();
      const streak = wrapper.get(".recent-streak");
      expect(streak.text()).toBe("3连胜");
      expect(streak.classes()).not.toContain("recent-streak--lose");
    } finally { wrapper.unmount(); }
  });

  it("开场为重开时跳过重开取第一场非重开结果，不误判连败", async () => {
    mockPages([
      battle(1, { win: "Fail", was_early_surrender: 1 }),
      battle(2, { win: "Win" }),
      battle(3, { win: "Win" }),
      battle(4, { win: "Fail" })
    ]);
    const wrapper = render();
    try {
      await flushPromises();
      const streak = wrapper.get(".recent-streak");
      expect(streak.text()).toBe("2连胜");
      expect(streak.classes()).not.toContain("recent-streak--lose");
    } finally { wrapper.unmount(); }
  });
});

describe("RecentStats 模式切换", () => {
  it("切换模式后只统计该模式的对局、KDA 与常用英雄", async () => {
    const recent = [
      battle(1, { game_queue_id: 420, win: "Win", kills: 8, deaths: 2, assists: 10 }),
      battle(2, { game_queue_id: 420, win: "Fail", kills: 2, deaths: 8, assists: 4 }),
      battle(3, { game_queue_id: 420, win: "Win", kills: 4, deaths: 4, assists: 8 }),
      battle(4, { game_queue_id: 450, win: "Win", kills: 1, deaths: 1, assists: 1, champion_id: 9 }),
      battle(5, { game_queue_id: 450, win: "Fail", kills: 0, deaths: 2, assists: 0, champion_id: 9 })
    ];
    mockPages(recent);
    const wrapper = render();
    try {
      await flushPromises();
      // 全部模式：5 场，KDA = (15+23)/17 ≈ 2.24
      expect(wrapper.get(".recent-title").text()).toContain("全部模式");
      expect(wrapper.get(".recent-kda").text()).toBe("2.24 KDA");

      const aram = wrapper.findAll(".recent-modes .mode-filter-tab").find((tab) => tab.text() === "大乱斗")!;
      await aram.trigger("click");
      await flushPromises();

      expect(wrapper.get(".recent-title").text()).toBe("大乱斗 · 最近 5 场中 2 场");
      expect(wrapper.get(".recent-kda").text()).toBe("0.67 KDA");
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(2);
      // 常用英雄也切到该模式样本
      expect(wrapper.findAll(".recent-champ")).toHaveLength(1);
      expect(wrapper.get(".recent-champ-meta").text()).toBe("2场 1胜");

      const all = wrapper.findAll(".recent-modes .mode-filter-tab").find((tab) => tab.text() === "全部")!;
      await all.trigger("click");
      await flushPromises();
      expect(wrapper.get(".recent-title").text()).toContain("全部模式");
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(5);
    } finally { wrapper.unmount(); }
  });

  it("指定模式会扩大回看范围以凑够样本，且只补拉缺少的页", async () => {
    const aramPage = (start: number) => Array.from({ length: 10 }, (_, i) => battle(start + i, { game_queue_id: 450 }));
    const rankedPage = (start: number) => Array.from({ length: 10 }, (_, i) => battle(start + i, { game_queue_id: 420, win: "Fail" }));
    api.getBattleList.mockImplementation(async (_rq: unknown, params: { offset: number }) => {
      if (params.offset === 0) return aramPage(1);
      if (params.offset === 10) return aramPage(11);
      if (params.offset === 20) return rankedPage(21);
      return [];
    });
    const wrapper = render();
    try {
      await flushPromises();
      // 全部模式只取最近 20 场（2 页）
      expect(api.getBattleList.mock.calls.map((call) => (call[1] as { offset: number }).offset)).toEqual([0, 10]);

      const ranked = wrapper.findAll(".recent-modes .mode-filter-tab").find((tab) => tab.text() === "单双排")!;
      await ranked.trigger("click");
      await flushPromises();

      expect(wrapper.get(".recent-title").text()).toBe("单双排 · 最近 30 场中 10 场");
      expect(wrapper.get(".recent-wl").text()).toBe("0胜10负");
      // 第 1、2 页来自缓存，只新拉第 3 页
      expect(api.getBattleList.mock.calls.map((call) => (call[1] as { offset: number }).offset)).toEqual([0, 10, 20]);
    } finally { wrapper.unmount(); }
  });

  it("受控模式下按传入 mode 统计，并对外 emit modeChange", async () => {
    const recent = [
      battle(1, { game_queue_id: 450, win: "Win" }),
      battle(2, { game_queue_id: 450, win: "Fail" }),
      battle(3, { game_queue_id: 420, win: "Win" })
    ];
    mockPages(recent);
    const wrapper = mount(RecentStats, {
      props: { area: "1", accountType: "2", id: "test", mode: 450 }
    });
    try {
      await flushPromises();
      expect(wrapper.get(".recent-title").text()).toContain("大乱斗");
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(2);

      await wrapper.findAll(".recent-modes .mode-filter-tab").find((tab) => tab.text() === "单双排")!.trigger("click");
      expect(wrapper.emitted("modeChange")).toEqual([[420]]);
    } finally { wrapper.unmount(); }
  });

  it("按时间范围过滤样本，标题显示「近 7 天」", async () => {
    const now = Date.now();
    const recent = [
      battle(1, { game_start_time: String(now - 2 * 86400000), win: "Win" }),
      battle(2, { game_start_time: String(now - 3 * 86400000), win: "Fail" }),
      battle(3, { game_start_time: String(now - 40 * 86400000), win: "Win" })
    ];
    mockPages(recent);
    const wrapper = mount(RecentStats, {
      props: { area: "1", accountType: "2", id: "test", days: 7 }
    });
    try {
      await flushPromises();
      expect(wrapper.get(".recent-title").text()).toContain("近 7 天");
      expect(wrapper.get(".recent-title").text()).toContain("3 场中 2 场");
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(2);
      expect(wrapper.get(".recent-wl").text()).toBe("1胜1负");
    } finally { wrapper.unmount(); }
  });

  it("按天聚合渲染胜率迷你趋势", async () => {
    const now = Date.now();
    const at = (daysAgo: number) => String(now - daysAgo * 86400000);
    mockPages([
      battle(1, { game_start_time: at(1), win: "Win" }),
      battle(2, { game_start_time: at(1), win: "Fail" }),
      battle(5, { game_start_time: at(1), win: "Fail" }),
      battle(3, { game_start_time: at(2), win: "Win" }),
      battle(4, { game_start_time: at(2), win: "Win" })
    ]);
    const wrapper = render();
    try {
      await flushPromises();
      const days = wrapper.findAll(".recent-trend .trend-day");
      expect(days).toHaveLength(2);
      // 左侧是更早的一天：2 胜 0 负 → 100%；右侧是昨天：1 胜 2 负 → 33%
      expect(days[0]!.attributes("title")).toContain("100% 胜率");
      expect(days[1]!.attributes("title")).toContain("33% 胜率");
      expect(wrapper.findAll(".trend-bar--low")).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });

  it("所选模式没有对局时给出空态提示，切回全部可恢复", async () => {
    const recent = Array.from({ length: 10 }, (_, i) => battle(i + 1, { game_queue_id: 420 }));
    mockPages(recent);
    const wrapper = render();
    try {
      await flushPromises();

      const aram = wrapper.findAll(".recent-modes .mode-filter-tab").find((tab) => tab.text() === "大乱斗")!;
      await aram.trigger("click");
      await flushPromises();

      expect(wrapper.get(".recent-empty").text()).toContain("大乱斗");
      expect(wrapper.get(".recent-empty").text()).toContain("最近 10 场");
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(0);

      const all = wrapper.findAll(".recent-modes .mode-filter-tab").find((tab) => tab.text() === "全部")!;
      await all.trigger("click");
      await flushPromises();
      expect(wrapper.find(".recent-empty").exists()).toBe(false);
      expect(wrapper.findAll(".strip-block--btn")).toHaveLength(10);
    } finally { wrapper.unmount(); }
  });
});

describe("RecentStats 交互", () => {
  it("activeChampion 时出现清除筛选按钮，点击 emit filterChampion(null)", async () => {
    const wrapper = render({ activeChampion: 17 });
    try {
      await flushPromises();
      const clear = wrapper.get(".recent-champ-filter-clear");
      expect(clear.text()).toBe("清除筛选：英雄17 ×");
      await clear.trigger("click");
      expect(wrapper.emitted("filterChampion")).toEqual([[null]]);
    } finally { wrapper.unmount(); }
  });

  it("activeGameId 对应色块带 strip-block--cur 与 aria-pressed", async () => {
    const wrapper = render({ activeGameId: "g5" });
    try {
      await flushPromises();
      const current = wrapper.findAll(".strip-block--cur");
      expect(current).toHaveLength(1);
      expect(current[0]!.attributes("aria-pressed")).toBe("true");
      expect(current[0]!.find(".strip-bar--remake").exists()).toBe(true);
      expect(current[0]!.attributes("title")).toContain("重开");
      expect(current[0]!.attributes("title")).toContain("点击定位");
    } finally { wrapper.unmount(); }
  });

  it("点击色块 emit focusGame 且 payload.game_id 正确", async () => {
    const wrapper = render();
    try {
      await flushPromises();
      const blocks = wrapper.findAll(".strip-block--btn");
      expect(blocks).toHaveLength(10);
      // 色块从左到右由远到近，最左侧是最后一场 g10
      await blocks[0]!.trigger("click");
      await blocks[2]!.trigger("click");
      const emitted = wrapper.emitted("focusGame");
      expect(emitted).toHaveLength(2);
      expect((emitted![0]![0] as BattleSummary).game_id).toBe("g10");
      expect((emitted![1]![0] as BattleSummary).game_id).toBe("g8");
    } finally { wrapper.unmount(); }
  });
});
