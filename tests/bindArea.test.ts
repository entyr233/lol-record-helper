import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BindAreaView from "../src/views/BindAreaView.vue";
import type { FavoriteEntry } from "../src/composables/useFavorites";
import { getSelfUinFromCookie, hasLoginState } from "../src/utils/weGameLogin";

const favorites = ref<FavoriteEntry[]>([]);
const historyNames = ref<string[]>([]);
vi.mock("../src/composables/useFavorites", () => ({
  useFavorites: () => ({ favorites }), favoriteKey: (entry: FavoriteEntry) => entry.id
}));
vi.mock("../src/composables/useSearchHistory", () => ({ useSearchHistory: () => ({ historyNames }) }));
vi.mock("../src/utils/weGameLogin", () => ({ getSelfUinFromCookie: vi.fn(), hasLoginState: vi.fn() }));

let wrapper: ReturnType<typeof mount> | undefined;
async function render() {
  const empty = { template: "<span />" };
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/", component: BindAreaView },
    { path: "/area/:area", name: "area", component: empty },
    { path: "/summary/:area/:accountType/:id", name: "summary", component: empty },
    { path: "/search/:nickname", name: "search", component: empty }
  ] });
  await router.push("/");
  wrapper = mount(BindAreaView, { global: { plugins: [router] } });
  return router;
}

beforeEach(() => {
  localStorage.clear();
  favorites.value = [];
  historyNames.value = [];
  vi.mocked(getSelfUinFromCookie).mockReturnValue(null);
  vi.mocked(hasLoginState).mockReturnValue(false);
});
afterEach(() => wrapper?.unmount());

describe("绑定大区入口", () => {
  it("未选择大区时禁用个人战绩入口，显示选择提示", async () => {
    await render();
    expect(wrapper!.get(".landing-primary").attributes("disabled")).toBeDefined();
    expect(wrapper!.text()).toContain("先在顶部选择大区");
  });

  it.each([true, false])("保存大区后根据 cookie 账号跳转（cookie=%s）", async (loggedIn) => {
    localStorage.setItem("lol_tft:last-area", JSON.stringify("3"));
    vi.mocked(getSelfUinFromCookie).mockReturnValue(loggedIn ? "10001" : null);
    vi.mocked(hasLoginState).mockReturnValue(loggedIn);
    const router = await render();
    expect(wrapper!.get(".page-title").text()).toBe(loggedIn ? "英雄联盟战绩查询" : "请先选择区服");
    await wrapper!.get(".landing-primary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe(loggedIn ? "summary" : "area");
    expect(router.currentRoute.value.params).toMatchObject(loggedIn
      ? { area: "3", accountType: "1", id: "10001" } : { area: "3" });
  });

  it("常看玩家按收藏去重，收藏与搜索分别进入对应路由", async () => {
    favorites.value = [{ name: "玩家甲", area: 1, accountType: "2", id: "player-a", savedAt: 1 }];
    historyNames.value = ["玩家甲", "玩家乙"];
    const router = await render();
    const chips = wrapper!.findAll(".landing-chip");
    expect(chips).toHaveLength(2);
    await chips[0].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.params).toEqual({ area: "1", accountType: "2", id: "player-a" });
    await chips[1].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("search");
    expect(router.currentRoute.value.params.nickname).toBe("玩家乙");
  });
});
