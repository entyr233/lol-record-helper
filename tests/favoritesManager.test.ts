import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import FavoritesManager from "../src/components/FavoritesManager.vue";
import { favoriteKey, useFavorites } from "../src/composables/useFavorites";

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "area", component: { template: "<div />" } },
      { path: "/summary/:area/:accountType/:id", name: "summary", component: { template: "<div />" } }
    ]
  });
}

async function mountManager() {
  const router = createTestRouter();
  await router.push("/");
  await router.isReady();
  const wrapper = mount(FavoritesManager, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  useFavorites().clear();
});

describe("FavoritesManager 收藏管理", () => {
  it("支持分组、置顶、搜索、排序和批量删除", async () => {
    const { favorites, toggle } = useFavorites();
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    toggle({ name: "乙", area: 2, accountType: "1", id: "11" });
    expect(favorites.value).toHaveLength(2);

    const wrapper = await mountManager();
    expect(wrapper.text()).toContain("收藏管理");
    expect(wrapper.findAll(".favorites-manager-row")).toHaveLength(2);

    // 给「甲」设置分组，分组标题应立即出现
    const firstRow = wrapper.findAll(".favorites-manager-row").find((row) => row.text().includes("甲"));
    expect(firstRow).toBeTruthy();
    const groupButton = firstRow!.findAll("button").find((button) => button.text() === "分组");
    expect(groupButton).toBeTruthy();
    await groupButton!.trigger("click");
    const groupInput = firstRow!.find(".favorites-manager-inline-input");
    await groupInput.setValue("车队");
    await groupInput.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(wrapper.text()).toContain("车队");
    expect(favorites.value.find((entry) => entry.name === "甲")?.group).toBe("车队");

    // 置顶（分组后 DOM 重新渲染，重新取行）
    const pinnedRow = wrapper.findAll(".favorites-manager-row").find((row) => row.text().includes("甲"));
    expect(pinnedRow).toBeTruthy();
    const pinButton = pinnedRow!.findAll("button").find((button) => button.text() === "置顶");
    await pinButton!.trigger("click");
    expect(favorites.value.find((entry) => entry.name === "甲")?.pinned).toBe(true);
    expect(wrapper.find(".favorites-manager-pin").exists()).toBe(true);

    // 搜索无结果
    await wrapper.find(".favorites-manager-search").setValue("不存在");
    expect(wrapper.text()).toContain("没有匹配的收藏");
    await wrapper.find(".favorites-manager-search").setValue("");

    // 排序不崩溃
    await wrapper.find(".favorites-manager-select").setValue("recent");
    expect(wrapper.findAll(".favorites-manager-row")).toHaveLength(2);

    // 全选后批量删除
    await wrapper.find(".favorites-manager-select-all input").setValue(true);
    const removeSelected = wrapper.findAll(".favorites-manager-foot button").find((button) => button.text().includes("删除选中"));
    await removeSelected!.trigger("click");
    expect(favorites.value).toEqual([]);

    wrapper.unmount();
  });

  it("搜索匹配备注和大区名，关闭按钮发出 close", async () => {
    const { favorites, toggle, update } = useFavorites();
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    update(favoriteKey({ area: 1, accountType: "2", id: "10" }), { note: "固定双排" });
    expect(favorites.value).toHaveLength(1);

    const wrapper = await mountManager();
    await wrapper.find(".favorites-manager-search").setValue("固定双排");
    expect(wrapper.findAll(".favorites-manager-row")).toHaveLength(1);

    await wrapper.find(".favorites-manager-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.unmount();
  });
});
