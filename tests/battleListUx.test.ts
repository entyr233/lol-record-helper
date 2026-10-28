import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BattleList from "../src/components/BattleList.vue";
import type { BattleSummary } from "../src/api/types";
import { clearBattleFeedCache } from "../src/composables/useBattleFeed";

const api = vi.hoisted(() => ({ getBattleList: vi.fn() }));
vi.mock("../src/api/client", () => ({ lolBattleApi: api }));
// 英雄名走 mock（真实实现会请求外部 CDN）；GameIcon 用到的其它纯函数保留原实现
vi.mock("../src/api/staticData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api/staticData")>();
  return {
    ...actual,
    championName: (id: number) => "英雄" + id,
    ensureChampionNames: async () => {}
  };
});

function battle(n: number): BattleSummary {
  return {
    game_id: "g" + n,
    game_start_time: "1700000000000",
    game_time_played: 1800,
    game_queue_id: 420,
    champion_id: 1,
    win: "Win",
    kills: 5,
    deaths: 2,
    assists: 8
  };
}

function render() {
  return mount(BattleList, {
    props: { area: "1", accountType: "2", id: "test" },
    // 详情子组件会自己请求数据：整体 stub 掉，只验证列表行为
    global: { stubs: { BattleDetail: true } }
  });
}

beforeEach(() => {
  api.getBattleList.mockReset();
  // 原始战绩页缓存是 useBattleFeed 的模块级单例：每个用例从空缓存开始，避免上一个用例的数据/空页串入
  clearBattleFeedCache();
});

describe("BattleList 加载骨架屏", () => {
  it("首屏加载中显示 6 条骨架，不再显示「加载中…」文案", async () => {
    // 请求一直挂起：保持 loading 状态
    api.getBattleList.mockImplementation(() => new Promise<BattleSummary[]>(() => {}));
    const wrapper = render();
    await flushPromises();

    const skeletons = wrapper.findAll(".battle-skeleton");
    expect(skeletons).toHaveLength(6);
    expect(wrapper.findAll(".skeleton-block--avatar")).toHaveLength(6);
    expect(wrapper.findAll(".skeleton-line")).toHaveLength(12);
    expect(wrapper.findAll(".skeleton-line--short")).toHaveLength(6);
    // 骨架仍放在原来的列表容器里，且列表侧不再有「加载中…」占位
    expect(wrapper.find("ul.battle-list-items").exists()).toBe(true);
    expect(wrapper.find("ul.battle-list-items").text()).not.toContain("加载中");
    expect(wrapper.find(".battle-list-side .state-text").exists()).toBe(false);

    wrapper.unmount();
  });
});

describe("BattleList 错误原位重试", () => {
  it("第二页失败后重试第二页，成功前保留第一页内容", async () => {
    api.getBattleList
      .mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => battle(index + 1)))
      .mockRejectedValueOnce(new Error("第二页请求失败"))
      .mockResolvedValueOnce([battle(11), battle(12)]);
    const wrapper = render();
    await flushPromises();

    await wrapper.findAll(".pager-button")[1].trigger("click");
    await flushPromises();
    expect(wrapper.get(".pager-indicator").text()).toBe("第 1 页");
    expect(wrapper.findAll(".battle-list-item")).toHaveLength(10);
    expect(wrapper.text()).toContain("第二页请求失败");

    await wrapper.get(".list-retry").trigger("click");
    await flushPromises();

    expect(api.getBattleList.mock.calls.map((call) => (call[1] as { offset: number }).offset)).toEqual([0, 10, 10]);
    expect(wrapper.get(".pager-indicator").text()).toBe("第 2 页");
    expect(wrapper.findAll(".battle-list-item")).toHaveLength(2);
    expect(wrapper.get(".battle-list-item.selected").attributes("data-game-id")).toBe("g11");
    expect(wrapper.find(".list-retry").exists()).toBe(false);
    wrapper.unmount();
  });

  it("首屏失败显示重试按钮，点击后重新请求并渲染列表", async () => {
    api.getBattleList
      .mockRejectedValueOnce(new Error("网络错误"))
      .mockResolvedValueOnce([battle(1), battle(2)]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find(".battle-list-side").text()).toContain("网络错误");
    const retry = wrapper.find(".list-retry");
    expect(retry.exists()).toBe(true);
    expect(wrapper.findAll(".battle-list-item")).toHaveLength(0);

    await retry.trigger("click");
    await flushPromises();

    expect(api.getBattleList).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll(".battle-list-item")).toHaveLength(2);
    expect(wrapper.find(".list-retry").exists()).toBe(false);
    expect(wrapper.find(".battle-list-side").text()).not.toContain("网络错误");

    wrapper.unmount();
  });
});

describe("BattleList 空态引导", () => {
  it("无筛选时提示没有对局；筛选后为空给出「清除筛选」并可恢复", async () => {
    api.getBattleList.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toContain("该玩家最近没有对局记录");
    expect(wrapper.find(".battle-empty .list-retry").exists()).toBe(false);

    // 点击「大乱斗」进入筛选：数据仍为空 → 提示当前筛选下没有对局，并给清除入口
    const tab = wrapper.findAll(".mode-filter-tab").find((item) => item.text() === "大乱斗");
    await tab!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("当前筛选下没有对局");
    const clear = wrapper.find(".battle-empty .list-retry");
    expect(clear.text()).toBe("清除筛选");

    await clear.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("该玩家最近没有对局记录");
  });
});

describe("BattleList 键盘 ↑/↓ 切换对局", () => {
  it("列表可聚焦，↑/↓ 在相邻对局间移动选中且不越界", async () => {
    api.getBattleList.mockResolvedValue([battle(1), battle(2), battle(3)]);
    const wrapper = render();
    await flushPromises();

    const list = wrapper.find("ul.battle-list-items");
    expect(list.attributes("tabindex")).toBe("0");
    const selectedId = () => wrapper.find(".battle-list-item.selected").attributes("data-game-id");
    // 首屏自动选中第一场
    expect(selectedId()).toBe("g1");

    await list.trigger("keydown", { key: "ArrowDown" });
    await flushPromises();
    expect(selectedId()).toBe("g2");

    await list.trigger("keydown", { key: "ArrowDown" });
    await flushPromises();
    expect(selectedId()).toBe("g3");

    // 已到最后一场：继续 ↓ 不越界
    await list.trigger("keydown", { key: "ArrowDown" });
    await flushPromises();
    expect(selectedId()).toBe("g3");

    await list.trigger("keydown", { key: "ArrowUp" });
    await flushPromises();
    expect(selectedId()).toBe("g2");

    // 回到第一场后继续 ↑ 同样不越界
    await list.trigger("keydown", { key: "ArrowUp" });
    await flushPromises();
    expect(selectedId()).toBe("g1");

    wrapper.unmount();
  });
});
