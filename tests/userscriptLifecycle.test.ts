import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the editable template directly; never rebuild or rewrite a published script.
const source = readFileSync("userscript/lol-tft.template.js", "utf8");
type PanelApi = { open: () => Promise<void>; close: () => void };
const page = window as unknown as { __LOL_TFT__?: PanelApi };
let api: PanelApi;
let mount: ReturnType<typeof vi.fn>;
let unmount: ReturnType<typeof vi.fn>;
let mountHelper: ReturnType<typeof vi.fn>;

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src$="/login.sdk.js"]'));
}

beforeEach(() => {
  vi.useFakeTimers();
  unmount = vi.fn();
  mount = vi.fn(() => ({ unmount }));
  mountHelper = vi.fn();
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  new Function("LolTft", "console", source)({ mountLolTft: mount, mountHelperLogin: mountHelper }, logger);
  document.dispatchEvent(new Event("DOMContentLoaded"));
  api = page.__LOL_TFT__!;
});

afterEach(() => {
  api.close();
  delete page.__LOL_TFT__;
  document.getElementById("lol-tft-launcher")?.remove();
  document.getElementById("lol-tft-entry-style")?.remove();
  scripts().forEach((script) => script.remove());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("userscript panel lifecycle", () => {
  it("脚本启动时安装助手页入口，不需要先打开自建面板", () => {
    expect(mountHelper).toHaveBeenCalledTimes(1);
    expect(mount).not.toHaveBeenCalled();
    expect(scripts()).toHaveLength(0);
  });

  it("打开面板立即挂载，且不注入登录 SDK（登录按钮才按需注入）", async () => {
    await api.open();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(scripts()).toHaveLength(0);
    expect(document.querySelectorAll("#lol-tft-overlay")).toHaveLength(1);
    api.close();
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.getElementById("lol-tft-launcher")!.style.display).toBe("");
  });

  it("关闭重开：两个面板各挂载/卸载一次", async () => {
    await api.open();
    api.close();
    await api.open();
    expect(mount).toHaveBeenCalledTimes(2);
    api.close();
    expect(unmount).toHaveBeenCalledTimes(2);
  });

  it("同时打开只创建一个面板", async () => {
    await Promise.all([api.open(), api.open(), api.open()]);
    expect(document.querySelectorAll("#lol-tft-overlay")).toHaveLength(1);
    expect(mount).toHaveBeenCalledTimes(1);
    api.close();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it("挂载失败后关闭重开可以恢复", async () => {
    mount.mockImplementationOnce(() => { throw new Error("mount failed"); });
    await api.open();
    expect(document.getElementById("lol-tft-overlay-host")!.textContent).toContain("mount failed");
    api.close();
    await api.open();
    expect(mount).toHaveBeenCalledTimes(2);
    api.close();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it("bundle 缺失时入口按钮仍可用（手动入口保留）", () => {
    new Function("LolTft", "console", source)(undefined as unknown as { mountLolTft: unknown }, { log: vi.fn(), warn: vi.fn(), error: vi.fn() });
    expect(document.getElementById("lol-tft-launcher")).not.toBeNull();
    expect(page.__LOL_TFT__).toBeDefined();
  });
});
