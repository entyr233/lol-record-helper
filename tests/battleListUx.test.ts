import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BattleList from "../src/components/BattleList.vue";
import type { BattleSummary } from "../src/api/types";

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
