import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/errors";
import SummonerInfo from "../src/components/SummonerInfo.vue";

const api = vi.hoisted(() => ({ getSummonerInfo: vi.fn(), getBattleReport: vi.fn() }));
vi.mock("../src/api/client", () => ({ lolBattleApi: api }));

const summoner = { name: "回归测试召唤师", icon_id: 1, level: 30 };
const counts = {
  total_games: 12, total_wins: 8, total_losts: 4,
  total_arm_games: 2, total_arm_wins: 1, total_arm_losts: 1,
  total_match_games: 4, total_match_wins: 3, total_match_losts: 1,
  total_rank_games: 6, total_rank_wins: 4, total_rank_losts: 2
};

function render() {
  return mount(SummonerInfo, {
    props: { area: "1", accountType: "2", id: "test" },
    global: { stubs: { GameIcon: true } }
  });
}

beforeEach(() => {
  api.getSummonerInfo.mockReset().mockResolvedValue(summoner);
  api.getBattleReport.mockReset().mockResolvedValue(counts);
});

afterEach(() => { delete window.WegameLogin; vi.useRealTimers(); });

describe("SummonerInfo independent statistics state", () => {
  it("场次统计默认可见（无需展开更多资料），并带分类胜率", async () => {
    const wrapper = render();
    try {
      await flushPromises();
      const stats = wrapper.get(".summoner-stats");
      expect(stats.findAll(".count-row")).toHaveLength(4);
      expect(stats.get(".count-rate").text()).toContain("胜率");
      // 更多资料只保留等级/赞踩等次要信息
      expect(wrapper.get(".summoner-more").findAll(".count-row")).toHaveLength(0);
    } finally { wrapper.unmount(); }
  });

  it.each([new Error("统计网络错误"), new ApiError(8000102, "GetBattleReport")])(
    "统计失败可见，只重试统计并恢复数据（%s）", async (error) => {
      api.getBattleReport.mockRejectedValueOnce(error);
      const wrapper = render();
      try {
        await flushPromises();
        expect(wrapper.text()).toContain(summoner.name);
        expect(wrapper.get(".summoner-report").text()).toContain("统计加载失败");
        expect(wrapper.get(".summoner-report").text()).toContain(error.message);
        expect(wrapper.findAll(".count-row")).toHaveLength(0);
        await wrapper.get(".summoner-report button").trigger("click");
        await flushPromises();

        expect(api.getSummonerInfo).toHaveBeenCalledTimes(1);
        expect(api.getBattleReport).toHaveBeenCalledTimes(2);
        expect(wrapper.text()).not.toContain("统计加载失败");
        expect(wrapper.findAll(".count-row")).toHaveLength(4);
        expect(wrapper.findAll(".count-row")[0]!.text()).toContain("12");
        expect(wrapper.text()).toContain(summoner.name);
      } finally { wrapper.unmount(); }
    }
  );

  it("统计等待及重试期间保持基础信息，重试再次失败仍可重试", async () => {
    let rejectReport!: (error: Error) => void;
    api.getBattleReport.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectReport = reject; }));
    const wrapper = render();
    try {
      await flushPromises();
      expect(wrapper.text()).toContain(summoner.name);
      expect(wrapper.get(".summoner-report").text()).toContain("统计加载中");
      rejectReport(new Error("首次失败"));
      await flushPromises();
      api.getBattleReport.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectReport = reject; }));
      await wrapper.get(".summoner-report button").trigger("click");
      expect(wrapper.text()).toContain(summoner.name);
      expect(wrapper.get(".summoner-report").text()).toContain("统计加载中");
      expect(wrapper.find(".summoner-report button").exists()).toBe(false);
      rejectReport(new Error("再次失败"));
      await flushPromises();
      expect(wrapper.get(".summoner-report").text()).toContain("再次失败");
      expect(wrapper.get(".summoner-report button").text()).toBe("重试统计");
      expect(api.getSummonerInfo).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it("基础信息失败仍保留原有整体重试行为", async () => {
    api.getSummonerInfo.mockRejectedValueOnce(new Error("基础信息失败"));
    const wrapper = render();
    try {
      await flushPromises();
      expect(wrapper.text()).toContain("基础信息失败");
      await wrapper.get("button").trigger("click");
      await flushPromises();
      expect(api.getSummonerInfo).toHaveBeenCalledTimes(2);
      expect(api.getBattleReport).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain(summoner.name);
      expect(wrapper.findAll(".count-row")).toHaveLength(4);
    } finally { wrapper.unmount(); }
  });

  it.each(["missing", "throw", "reject"])("重新登录 popup %s 可见失败且不调用 logout", async (kind) => {
    const logout = vi.fn();
    window.WegameLogin = { default: {
      isLogin: () => true, logout, getUserInfo: () => ({}), getLoginUser: async () => ({}),
      popup: kind === "missing" ? undefined : () => {
        if (kind === "throw") throw new Error("private SDK error");
        return Promise.reject(new Error("private SDK error"));
      }
    } };
    api.getSummonerInfo.mockRejectedValueOnce(new ApiError(8000102, "GetSummonerInfo"));
    const wrapper = render();
    try {
      await flushPromises();
      await wrapper.get("button").trigger("click");
      await flushPromises();
      expect(wrapper.text()).toContain("无法打开 WeGame 登录窗口");
      expect(wrapper.text()).not.toContain("private SDK error");
      expect(logout).not.toHaveBeenCalled();
      expect(api.getSummonerInfo).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it("重新登录等待 UIN，可取消；恢复后刷新数据且不刷新宿主页", async () => {
    vi.useFakeTimers();
    const logout = vi.fn();
    const read = vi.fn().mockResolvedValue({});
    window.WegameLogin = { default: {
      isLogin: () => true, logout, getUserInfo: () => ({}), getLoginUser: read, popup: vi.fn()
    } };
    api.getSummonerInfo.mockRejectedValueOnce(new ApiError(8000102, "GetSummonerInfo"));
    const wrapper = render();
    try {
      await flushPromises();
      await wrapper.get("button").trigger("click");
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.getSummonerInfo).toHaveBeenCalledTimes(1);
      const cancel = wrapper.findAll("button").find((item) => item.text() === "取消等待")!;
      await cancel.trigger("click");
      await flushPromises();
      expect(wrapper.text()).toContain("已取消登录操作");
      read.mockResolvedValue({ uin: "12345" });
      await wrapper.get("button").trigger("click");
      await flushPromises();
      expect(api.getSummonerInfo).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain(summoner.name);
      expect(logout).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
    expect(vi.getTimerCount()).toBe(0);
  });
});
