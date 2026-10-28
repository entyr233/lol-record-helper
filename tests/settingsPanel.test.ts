import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SettingsPanel from "../src/components/SettingsPanel.vue";
import { useFavorites } from "../src/composables/useFavorites";
import { useRecentPlayers } from "../src/composables/useRecentPlayers";
import { useSearchHistory } from "../src/composables/useSearchHistory";

function mockConfirm(): void {
  vi.spyOn(window, "confirm").mockReturnValue(true);
}

async function mountPanel() {
  const wrapper = mount(SettingsPanel);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useFavorites().clear();
  useRecentPlayers().clear();
  useSearchHistory().clear();
  vi.restoreAllMocks();
});

describe("SettingsPanel 设置与数据", () => {
  it("列出自管数据并单独清理搜索历史", async () => {
    mockConfirm();
    useSearchHistory().remember("测试昵称");
    localStorage.setItem("unrelated-key", "keep");
    const wrapper = await mountPanel();

    expect(wrapper.text()).toContain("设置与数据");
    expect(wrapper.text()).toContain("搜索历史");
    expect(wrapper.text()).toContain("战绩内存缓存");

    const row = wrapper.findAll(".settings-row").find((item) => item.text().includes("搜索历史"));
    expect(row).toBeTruthy();
    const clear = row!.findAll("button").find((button) => button.text() === "清理");
    await clear!.trigger("click");
    await flushPromises();

    expect(localStorage.getItem("lol_tft:search-history")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
    expect(wrapper.text()).toContain("已清空搜索历史");
    wrapper.unmount();
  });

  it("清空全部会删掉自管数据，但保留无关存储", async () => {
    mockConfirm();
    useFavorites().toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    useRecentPlayers().remember({ name: "乙", area: 1, accountType: "2", id: "11" });
    useSearchHistory().remember("丙");
    localStorage.setItem("lol_tft:last-area", "1");
    localStorage.setItem("unrelated-key", "keep");
    const wrapper = await mountPanel();

    const clearAll = wrapper.findAll("button").find((button) => button.text() === "清空全部本地数据");
    await clearAll!.trigger("click");
    await flushPromises();

    expect(useFavorites().favorites.value).toEqual([]);
    expect(useRecentPlayers().recentPlayers.value).toEqual([]);
    expect(useSearchHistory().historyNames.value).toEqual([]);
    expect(localStorage.getItem("lol-tft-favorites")).toBeNull();
    expect(localStorage.getItem("lol_tft:recent-players")).toBeNull();
    expect(localStorage.getItem("lol_tft:last-area")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
    wrapper.unmount();
  });

  it("可以打开收藏管理并发出事件", async () => {
    const wrapper = await mountPanel();
    const button = wrapper.findAll("button").find((item) => item.text() === "打开收藏管理");
    await button!.trigger("click");
    expect(wrapper.emitted("openFavorites")).toHaveLength(1);
    wrapper.unmount();
  });
});
