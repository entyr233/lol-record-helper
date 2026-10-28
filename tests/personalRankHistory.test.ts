import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PersonalRankHistory from "../src/components/PersonalRankHistory.vue";
import { fetchRankHistory } from "../src/api/rankHistory";
import { rankHar } from "./fixtures/rankHistory";

vi.mock("../src/api/rankHistory", async (original) => ({
  ...await original<typeof import("../src/api/rankHistory")>(), fetchRankHistory: vi.fn()
}));
afterEach(() => vi.mocked(fetchRankHistory).mockReset());

async function render() {
  const wrapper = mount(PersonalRankHistory, { props: { playerName: "本人测试角色#0001", areaName: "测试大区" } });
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, "files", { configurable: true, value: [{ text: async () => JSON.stringify(rankHar()) }] });
  await input.trigger("change");
  await flushPromises();
  return wrapper;
}

describe("本人历史段位与走势", () => {
  it("导入不联网，核对角色后显示历史与走势，切角色重新确认", async () => {
    const wrapper = await render();
    expect(wrapper.get(".personal-rank-source").text()).toContain("本人测试角色#0001");
    expect(wrapper.find("table").exists()).toBe(false);
    expect(fetchRankHistory).not.toHaveBeenCalled();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.text()).toContain("S16 第三赛段");
    expect(wrapper.text()).toContain("钻石Ⅳ");
    expect(wrapper.findAll("circle")).toHaveLength(2);
    await wrapper.findAll("select")[0].setValue("1");
    expect(wrapper.get(".personal-rank-source").text()).toContain("其他测试角色#0002");
    expect(wrapper.find("table").exists()).toBe(false);
    wrapper.unmount();
  });

  it("在线刷新失败时保留导入数据；取消后迟到响应不改变记录", async () => {
    const wrapper = await render();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    vi.mocked(fetchRankHistory).mockRejectedValueOnce(new Error("暂时不可用"));
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("仍显示已导入记录");
    expect(wrapper.text()).toContain("S16 第三赛段");
    let resolve!: (value: Awaited<ReturnType<typeof fetchRankHistory>>) => void;
    vi.mocked(fetchRankHistory).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await wrapper.get("button").trigger("click");
    await wrapper.findAll("button")[1].trigger("click");
    resolve({ seasons: [], trends: [], tip: "迟到响应" });
    await flushPromises();
    expect(wrapper.text()).toContain("S16 第三赛段");
    expect(wrapper.text()).not.toContain("迟到响应");
    wrapper.unmount();
  });
});
