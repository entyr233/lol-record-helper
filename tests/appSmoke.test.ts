import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { MOCK_API_PREFIX, route } from "../dev/mockData";
import { installDevLoginMock } from "../src/dev/mock";

const { mountLolTft } = await import("../src/mount");

let host: HTMLElement;

beforeEach(async () => {
  // jsdom 里改 location.hash 会异步派发 hashchange/popstate，
  // 必须等它排空再挂载，否则会把新 router 的初始导航打回 "/"
  window.location.hash = "";
  await new Promise((resolve) => setTimeout(resolve, 30));
  installDevLoginMock();
  host = document.createElement("div");
  document.body.appendChild(host);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(MOCK_API_PREFIX)) {
        const method = url.slice(MOCK_API_PREFIX.length);
        const body = init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        return new Response(JSON.stringify(route(method, body)), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      // 图标/版本号等外部资源在测试环境一律失败，走内置回退
      return new Response("", { status: 404 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  host.remove();
});

describe("整页冒烟（mock 数据）", () => {
  it("进入战绩页后渲染召唤师信息、对局列表与首局详情", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });

    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const text = shadow.textContent || "";

    // 召唤师信息（含修正后的「匹配」映射）
    expect(text).toContain("测试召唤师（mock）");
    expect(text).toContain("所有对局");
    expect(text).toContain("匹配");
    expect(text).toContain("排位");

    // 对局列表：GetBattleList 翻页，第 1 页 10 条
    const items = shadow.querySelectorAll(".battle-list-item");
    expect(items).toHaveLength(10);
    expect(shadow.textContent).toContain("第 1 页");

    // 首局自动展开详情：两支队伍 + 10 名玩家
    await flushPromises();
    expect(shadow.querySelectorAll(".detail-team")).toHaveLength(2);
    expect(shadow.querySelectorAll(".detail-player")).toHaveLength(10);
    expect(text).toContain("蓝方");
    expect(text).toContain("红方");
    // 摘要里的英雄图标必须真的解析成组件（此前漏 import，图标静默不渲染）
    expect(shadow.querySelectorAll(".detail-summary .game-icon--champion")).toHaveLength(1);
    expect(shadow.querySelector(".detail-summary-name")?.textContent).toBeTruthy();

    instance.unmount();
  });

  it("点「我的战绩」：路由守卫解析登录用户后重定向到自己的详情页", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "area", params: { area: "1" } });

    for (let i = 0; i < 12; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // 旧实现（mock uin=0）会卡在「未能获取登录用户信息」
    const shadow = host.shadowRoot as ShadowRoot;
    const text = shadow.textContent || "";
    expect(text).not.toContain("未能获取登录用户信息");
    expect(instance.router.currentRoute.value.name).toBe("summary");
    expect(text).toContain("测试召唤师（mock）");

    instance.unmount();
  });

  it("点搜索结果进入对应玩家的战绩页（数据随玩家变化）", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "search", params: { nickname: "香辣鸡腿堡" } });

    const shadow = host.shadowRoot as ShadowRoot;
    let buttons = shadow.querySelectorAll(".search-button");
    for (let i = 0; i < 60 && buttons.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();
      buttons = shadow.querySelectorAll(".search-button");
    }
    expect(buttons.length).toBe(3);
    // 结果区要有"可点击去哪"的提示
    expect(shadow.textContent).toContain("点击其中一位查看战绩");

    (buttons[0] as HTMLElement).click();
    // 路由跳转涉及懒加载 chunk，用轮询等待
    for (let i = 0; i < 60 && instance.router.currentRoute.value.name !== "summary"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();
    }
    expect(instance.router.currentRoute.value.name).toBe("summary");

    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const text = shadow.textContent || "";
    expect(text).toContain("香辣鸡腿堡");
    expect(text).not.toContain("测试召唤师（mock）");
    expect(shadow.querySelectorAll(".battle-list-item").length).toBeGreaterThan(0);
    expect(shadow.textContent).toContain("段位");

    instance.unmount();
  });

  it("未登录时顶栏显示「登录」入口（WeGame 页面本身没有登录按钮）", async () => {
    const sdk = window.WegameLogin?.default;
    const original = sdk?.isLogin;
    if (sdk) sdk.isLogin = () => false;
    try {
      const instance = mountLolTft({ host });
      await instance.router.isReady();
      await flushPromises();
      const shadow = host.shadowRoot as ShadowRoot;
      response: {
        // 顶栏应出现登录按钮、不应出现注销
        expect(shadow.textContent).toContain("登录");
        expect(shadow.textContent).not.toContain("注销");
      }
      instance.unmount();
    } finally {
      if (sdk && original) sdk.isLogin = original;
    }
  });

  it("切换排序后名次内联展示，不再出现独立名次列", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const sortSelect = shadow.querySelector(".sort-select") as HTMLSelectElement | null;
    expect(sortSelect).not.toBeNull();
    sortSelect!.value = "damage";
    sortSelect!.dispatchEvent(new Event("change"));
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // 名次 + 对应数值内联在昵称下方，避免多占一列把内容挤出面板
    expect(shadow.querySelectorAll(".dp-rank-inline").length).toBe(10);
    expect(shadow.querySelector(".dp-rank")).toBeNull();
    instance.unmount();
  });

  it("顶栏提供 GitHub 主页入口", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await flushPromises();

    const shadow = host.shadowRoot as ShadowRoot;
    const link = shadow.querySelector(".header-link") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("https://github.com/mscststs/lol-tft");
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toContain("noopener");
    instance.unmount();
  });

  it("列表时间范围筛选会同步总览统计（近 7 天）", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const selects = Array.from(shadow.querySelectorAll<HTMLSelectElement>(".mode-filter-select"));
    const daysSelect = selects.find((select) =>
      Array.from(select.options).some((option) => option.textContent?.includes("最近 7 天"))
    );
    expect(daysSelect).toBeTruthy();
    daysSelect!.value = "7";
    daysSelect!.dispatchEvent(new Event("change"));
    for (let i = 0; i < 20; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(shadow.querySelector(".recent-title")?.textContent).toContain("近 7 天");
    expect(shadow.querySelector(".sample-note")?.textContent).toContain("符合条件");
    instance.unmount();
  });

  it("总览与列表的模式筛选双向联动", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const overviewChips = () => Array.from(shadow.querySelectorAll<HTMLElement>(".recent-modes .mode-filter-tab"));
    const listTabs = () => Array.from(shadow.querySelectorAll<HTMLElement>(".battle-list-side .mode-filter-tab"));
    const activeText = (items: HTMLElement[]) => items.find((item) => item.classList.contains("mode-filter-tab--cur"))?.textContent?.trim();

    // 总览点「大乱斗」→ 列表模式切到同一项
    overviewChips().find((chip) => chip.textContent?.trim() === "大乱斗")!.click();
    for (let i = 0; i < 15; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(activeText(listTabs())).toBe("大乱斗");
    expect(shadow.querySelector(".sample-note")?.textContent).toContain("符合条件");

    // 列表点「单双排」→ 总览模式与统计标题跟随
    listTabs().find((tab) => tab.textContent?.trim() === "单双排")!.click();
    for (let i = 0; i < 15; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(activeText(overviewChips())).toBe("单双排");
    expect(shadow.querySelector(".recent-title")?.textContent).toContain("单双排");

    instance.unmount();
  });

  it("正常状态下「刷新战绩」可点击，显示更新时间并保留当前查看的比赛", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const refreshButton = shadow.querySelector(".summary-refresh") as HTMLButtonElement | null;
    expect(refreshButton).not.toBeNull();
    expect(refreshButton!.disabled).toBe(false);
    expect(shadow.querySelector(".summary-updated")?.textContent).toMatch(/更新于 \d{2}:\d{2}/);

    const before = (shadow.querySelector(".battle-list-item.selected") as HTMLElement | null)?.getAttribute("data-game-id");
    expect(before).toBeTruthy();

    refreshButton!.click();
    for (let i = 0; i < 20; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // 刷新后：仍停在原来那场比赛，详情与更新时间都在
    const after = (shadow.querySelector(".battle-list-item.selected") as HTMLElement | null)?.getAttribute("data-game-id");
    expect(after).toBe(before);
    expect(shadow.querySelector(".summary-updated")?.textContent).toMatch(/更新于 \d{2}:\d{2}/);
    expect(refreshButton!.disabled).toBe(false);
    expect(shadow.querySelectorAll(".detail-player")).toHaveLength(10);
    instance.unmount();
  });

  it("切换「技能」tab 后渲染技能释放次数区", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "mock" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const skillButton = Array.from(shadow.querySelectorAll(".mode-button")).find((el) => el.textContent?.trim() === "技能") as HTMLElement | undefined;
    expect(skillButton).toBeTruthy();
    skillButton?.click();
    await flushPromises();

    expect(shadow.querySelectorAll(".cast").length).toBeGreaterThanOrEqual(6);
    instance.unmount();
  });

  it("点击常用英雄后总览出现清除入口，列表同步进入英雄筛选态", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const championButton = shadow.querySelector(".recent-champ") as HTMLElement | null;
    expect(championButton).not.toBeNull();
    championButton!.click();
    for (let i = 0; i < 15; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // 总览侧：出现“清除筛选：xx ×”，说明 activeChampion 真的传到了上层的 RecentStats
    const clear = shadow.querySelector(".recent-champ-filter-clear") as HTMLElement | null;
    expect(clear).not.toBeNull();
    // 列表侧：英雄下拉进入筛选态，提示文案切到“符合条件”
    expect((shadow.querySelector(".mode-filter-select") as HTMLSelectElement | null)?.value).not.toBe("");
    expect(shadow.querySelector(".sample-note")?.textContent).toContain("符合条件");

    // 清除后两侧一起回到默认态
    clear!.click();
    for (let i = 0; i < 15; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(shadow.querySelector(".recent-champ-filter-clear")).toBeNull();
    expect((shadow.querySelector(".mode-filter-select") as HTMLSelectElement | null)?.value).toBe("");
    instance.unmount();
  });

  it("点击走势色块定位到该场真实所在页并高亮（第 20 场 → 第 2 页）", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "10001" } });
    for (let i = 0; i < 10; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const shadow = host.shadowRoot as ShadowRoot;
    const blocks = Array.from(shadow.querySelectorAll<HTMLElement>(".recent-strip .strip-block--btn"));
    expect(blocks).toHaveLength(20);
    // 色块从左到右由远到近：最左是第 20 场，落在列表第 2 页（旧实现只会加载第 1 页且不高亮）
    blocks[0]!.click();
    for (let i = 0; i < 20; i++) {
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(shadow.querySelector(".pager-indicator")?.textContent).toContain("第 2 页");
    const selected = shadow.querySelector(".battle-list-item.selected");
    expect(selected?.getAttribute("data-game-id")).toBe("10001-020");
    // 选中态同步回总览：色块有且只有一个当前比赛高亮
    expect(shadow.querySelectorAll(".recent-strip .strip-block--cur")).toHaveLength(1);
    expect(shadow.querySelectorAll(".detail-player")).toHaveLength(10);
    instance.unmount();
  });
});
