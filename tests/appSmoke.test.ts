import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { MOCK_API_PREFIX, route } from "../dev/mockData";
import { installDevLoginMock } from "../src/dev/mock";

const { mountLolTft } = await import("../src/mount");

let host: HTMLElement;

beforeEach(() => {
  window.location.hash = "";
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
    await instance.router.push({ name: "summary", params: { area: "1", accountType: "2", id: "mock" } });

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

    // 对局列表：第一页 10 条
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
