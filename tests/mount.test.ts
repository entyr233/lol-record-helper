import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureDdragonVersion = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/api/staticData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api/staticData")>();
  return { ...actual, ensureDdragonVersion };
});

const { mountLolTft } = await import("../src/mount");

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  window.location.hash = "";
});

afterEach(() => {
  host.remove();
});

describe("mountLolTft", () => {
  it("默认挂载到 Shadow DOM，并把样式注入 shadow root（不外泄到宿主页）", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();

    expect(host.shadowRoot).not.toBeNull();
    const shadow = host.shadowRoot as ShadowRoot;
    expect(shadow.querySelector("style")?.textContent).toContain(".app-header");
    // 宿主页(document)里不应该出现我们的样式节点
    expect(document.querySelectorAll("style")).toHaveLength(0);
    // 渲染出了应用根节点
    expect(shadow.querySelector(".lol-tft-app")).not.toBeNull();
    instance.unmount();
  });

  it("未选大区时进入「请先选择区服」兜底页", async () => {
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const shadow = host.shadowRoot as ShadowRoot;
    expect(shadow.textContent).toContain("请先选择区服");
    instance.unmount();
  });

  it("支持关闭 Shadow DOM（调试用）", () => {
    const instance = mountLolTft({ host, shadow: false });
    expect(host.shadowRoot).toBeNull();
    expect(host.querySelector("style")).not.toBeNull();
    instance.unmount();
  });
});
