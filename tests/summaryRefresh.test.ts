import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import SummaryView from "../src/views/SummaryView.vue";
import type { BattleSummary } from "../src/api/types";
import { clearBattleFeedCache } from "../src/composables/useBattleFeed";

const api = vi.hoisted(() => ({
  getBattleList: vi.fn(), getSummonerInfo: vi.fn(), getBattleReport: vi.fn()
}));
vi.mock("../src/api/client", () => ({ lolBattleApi: api }));
vi.mock("../src/api/staticData", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/api/staticData")>(),
  championName: (id: number) => "英雄" + id,
  ensureChampionNames: async () => {}
}));

const rows: BattleSummary[] = Array.from({ length: 10 }, (_, index) => ({
  game_id: "g" + (index + 1), game_start_time: "1700000000000",
  game_time_played: 1800, game_queue_id: 420, champion_id: 1,
  win: "Win", kills: 5, deaths: 2, assists: 8
}));
const wrappers: VueWrapper[] = [];

function mockSuccessfulRequests(): void {
  api.getBattleList.mockImplementation(async (_rq: unknown, params: { offset: number }) =>
    rows.slice(params.offset, params.offset + 10)
  );
  api.getSummonerInfo.mockResolvedValue({ name: "测试玩家", icon_id: 1, level: 30 });
  api.getBattleReport.mockResolvedValue({
    total_games: 10, total_wins: 10, total_losts: 0,
    total_arm_games: 0, total_arm_wins: 0, total_arm_losts: 0,
    total_match_games: 0, total_match_wins: 0, total_match_losts: 0,
    total_rank_games: 10, total_rank_wins: 10, total_rank_losts: 0
  });
}

function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { render: () => null } }]
  });
  const wrapper = mount(SummaryView, {
    props: { area: "1", accountType: "2", id: "test" },
    global: { plugins: [router], stubs: { BattleDetail: true } }
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  clearBattleFeedCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  for (const method of Object.values(api)) method.mockReset();
  mockSuccessfulRequests();
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
});

describe("整页刷新结果", () => {
  it("同一次整页刷新中，近期统计和列表对原始第 0 页只请求一次", async () => {
    const wrapper = render();
    await flushPromises();
    api.getBattleList.mockClear();
    await wrapper.get(".summary-refresh").trigger("click");
    await flushPromises();
    expect(api.getBattleList.mock.calls.filter((call) => call[1].offset === 0)).toHaveLength(1);
    expect(wrapper.findAll(".battle-list-item")).toHaveLength(10);
    expect(wrapper.findAll(".strip-block--btn")).toHaveLength(10);
  });

  it("全部刷新失败时保留成功更新时间，旧近期数据带失败提示；再次成功后清除提示", async () => {
    const wrapper = render();
    await flushPromises();
    const updatedBefore = wrapper.get(".summary-updated").text();
    vi.setSystemTime(new Date("2026-10-27T12:01:00Z"));
    for (const method of Object.values(api)) method.mockRejectedValue(new Error("刷新请求失败"));

    await wrapper.get(".summary-refresh").trigger("click");
    await flushPromises();

    expect(wrapper.get(".summary-updated").text()).toBe(updatedBefore);
    const message = wrapper.get(".summary-refresh-error").text();
    for (const section of ["召唤师资料", "场次统计", "近期表现", "对局列表"]) expect(message).toContain(section);
    expect(wrapper.findAll(".strip-block--btn")).toHaveLength(10);
    expect(wrapper.get(".recent-error").text()).toContain("刷新失败，当前展示上次数据");
    expect(wrapper.get(".summary-refresh").attributes("disabled")).toBeUndefined();

    mockSuccessfulRequests();
    vi.setSystemTime(new Date("2026-10-27T12:02:00Z"));
    await wrapper.get(".summary-refresh").trigger("click");
    await flushPromises();

    expect(wrapper.get(".summary-updated").text()).not.toBe(updatedBefore);
    expect(wrapper.find(".summary-refresh-error").exists()).toBe(false);
    expect(wrapper.find(".recent-error").exists()).toBe(false);
  });

  it("部分模块失败时说明具体模块，保留成功更新时间并展示其他模块的新数据", async () => {
    const wrapper = render();
    await flushPromises();
    const updatedBefore = wrapper.get(".summary-updated").text();
    vi.setSystemTime(new Date("2026-10-27T12:01:00Z"));
    api.getBattleReport.mockRejectedValue(new Error("场次统计刷新失败"));
    api.getSummonerInfo.mockResolvedValue({ name: "已更新玩家", icon_id: 1, level: 31 });

    await wrapper.get(".summary-refresh").trigger("click");
    await flushPromises();

    expect(wrapper.get(".summary-updated").text()).toBe(updatedBefore);
    expect(wrapper.get(".summary-refresh-error").text()).toContain("场次统计");
    expect(wrapper.get(".summary-refresh-error").text()).not.toContain("近期表现");
    expect(wrapper.get(".summoner-name").text()).toContain("已更新玩家");
    expect(wrapper.findAll(".battle-list-item")).toHaveLength(10);
  });

  it("首屏列表失败时不显示成功更新时间", async () => {
    api.getBattleList.mockRejectedValue(new Error("首次请求失败"));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find(".summary-updated").exists()).toBe(false);
    expect(wrapper.get(".recent-error").text()).toContain("首次请求失败");
    expect(wrapper.get(".recent-error").text()).not.toContain("上次数据");
  });
});
