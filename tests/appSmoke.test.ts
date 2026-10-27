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

    // 对局列表：GetBattleList 分页，第一页 10 条
    const items = shadow.querySelectorAll(".battle-list-item");
    expect(items).toHaveLength(10);

    // 首局自动展开详情：两支队伍 + 10 名玩家
    await flushPromises();
    expect(shadow.querySelectorAll(".detail-team")).toHaveLength(2);
    expect(shadow.querySelectorAll(".detail-player")).toHaveLength(10);
    expect(text).toContain("蓝方");
    expect(text).toContain("红方");

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
});
