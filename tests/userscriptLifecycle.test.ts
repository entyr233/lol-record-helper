import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the editable template directly; never rebuild or rewrite a published script.
const source = readFileSync("userscript/lol-tft.user.js", "utf8");
type PanelApi = { open: () => Promise<void>; close: () => void };
const page = window as unknown as { __LOL_TFT__?: PanelApi };
let api: PanelApi;
let mount: ReturnType<typeof vi.fn>;
let unmount: ReturnType<typeof vi.fn>;
let mountHelper: ReturnType<typeof vi.fn>;

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src$="/login.sdk.js"]'));
}

function stubLocation(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal("location", {
    hostname: "www.wegame.com.cn",
    href: "https://www.wegame.com.cn/",
    pathname: "/",
    search: "",
    hash: "",
    reload: vi.fn(),
    ...overrides
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubLocation();
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
  it("脚本启动时在 WeGame 页面挂入口按钮，但不预加载 UI", () => {
    expect(mountHelper).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
    expect(document.getElementById("lol-tft-launcher")).not.toBeNull();
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

  it("脚本菜单提供自建面板与官方助手两个入口", () => {
    const commands: Record<string, () => void> = {};
    vi.stubGlobal("GM_registerMenuCommand", (title: string, run: () => void) => { commands[title] = run; });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      new Function("LolTft", "console", source)(
        { mountLolTft: mount, mountHelperLogin: mountHelper },
        { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
      );
      expect(commands["打开自建战绩面板"]).toBeTypeOf("function");
      expect(commands["打开官方助手页"]).toBeTypeOf("function");

      commands["打开自建战绩面板"]();
      expect(document.querySelectorAll("#lol-tft-overlay")).toHaveLength(1);

      commands["打开官方助手页"]();
      expect(open).toHaveBeenCalledWith("https://www.wegame.com.cn/helper/lol/", "_blank", "noopener");
    } finally {
      open.mockRestore();
      vi.unstubAllGlobals();
      document.getElementById("lol-tft-overlay")?.remove();
      document.documentElement.style.overflow = "";
    }
  });

  it("其他网站只注册菜单，不挂载悬浮入口；自建入口改为打开 WeGame 面板", () => {
    document.getElementById("lol-tft-launcher")?.remove();
    document.getElementById("lol-tft-entry-style")?.remove();
    stubLocation({ hostname: "example.com", href: "https://example.com/", pathname: "/", search: "" });
    const commands: Record<string, () => void> = {};
    vi.stubGlobal("GM_registerMenuCommand", (title: string, run: () => void) => { commands[title] = run; });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      new Function("LolTft", "console", source)(
        { mountLolTft: mount, mountHelperLogin: mountHelper },
        { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
      );
      expect(commands["打开自建战绩面板"]).toBeTypeOf("function");
      commands["打开自建战绩面板"]();
      expect(open).toHaveBeenCalledWith("https://www.wegame.com.cn/?lol_tft_panel=1", "_blank", "noopener");
      expect(document.getElementById("lol-tft-launcher")).toBeNull();
    } finally {
      open.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("官方助手页只保留内嵌助手面板，不再显示悬浮 LOL 战绩按钮", () => {
    document.getElementById("lol-tft-launcher")?.remove();
    document.getElementById("lol-tft-entry-style")?.remove();
    stubLocation({ pathname: "/helper/lol/", href: "https://www.wegame.com.cn/helper/lol/" });
    document.getElementById("lol-tft-launcher")?.remove();
    try {
      new Function("LolTft", "console", source)(
        { mountLolTft: mount, mountHelperLogin: mountHelper },
        { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
      );
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(mountHelper).toHaveBeenCalledTimes(1);
      expect(document.getElementById("lol-tft-launcher")).toBeNull();
    } finally {
      document.getElementById("lol-tft-launcher")?.remove();
    }
  });
  it("助手面板 UI 加载失败时显示可重试提示", async () => {
    stubLocation({ pathname: "/helper/lol/", href: "https://www.wegame.com.cn/helper/lol/" });
    document.getElementById("lol-tft-launcher")?.remove();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    try {
      new Function("LolTft", "console", source)(
        undefined as unknown as { mountLolTft: unknown },
        { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
      );
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(1);
      const error = document.getElementById("lol-tft-helper-error");
      expect(error).not.toBeNull();
      expect(error?.textContent).toContain("LOL 助手增强加载失败");
      expect(error?.textContent).toContain("重试");
    } finally {
      document.getElementById("lol-tft-helper-error")?.remove();
    }
  });
});
