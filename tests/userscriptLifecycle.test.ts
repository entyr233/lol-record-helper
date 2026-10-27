import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the editable template directly; never rebuild or rewrite a published script.
const source = readFileSync("userscript/lol-tft.template.js", "utf8");
type PanelApi = { open: () => Promise<void>; close: () => void };
const page = window as unknown as { __LOL_TFT__?: PanelApi };
let api: PanelApi;
let mount: ReturnType<typeof vi.fn>;
let unmount: ReturnType<typeof vi.fn>;

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src$="/login.sdk.js"]'));
}

function sdkLoaded(script: HTMLScriptElement): void {
  vi.stubGlobal("WegameLogin", { default: {} });
  script.dispatchEvent(new Event("load"));
}

beforeEach(() => {
  vi.useFakeTimers();
  unmount = vi.fn();
  mount = vi.fn(() => ({ unmount }));
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  new Function("LolTft", "console", source)({ mountLolTft: mount }, logger);
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
  it("等待 SDK 时关闭，不向 detached host 挂载", async () => {
    const pending = api.open();
    const host = document.getElementById("lol-tft-overlay-host")!;
    document.querySelector<HTMLButtonElement>(".lol-tft-overlay-close")!.click();
    sdkLoaded(scripts()[0]!);
    await pending;
    expect(host.isConnected).toBe(false);
    expect(mount).not.toHaveBeenCalled();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.getElementById("lol-tft-launcher")!.style.display).toBe("");
  });

  it.each(["old-first", "new-first"])("关闭重开，SDK %s 完成时仅新面板可挂载", async (order) => {
    const oldPending = api.open();
    const oldScript = scripts()[0]!;
    api.close();
    const newPending = api.open();
    const newScript = scripts()[1]!;
    const newHost = document.getElementById("lol-tft-overlay-host")!;
    if (order === "old-first") {
      sdkLoaded(oldScript);
      await oldPending;
      expect(mount).not.toHaveBeenCalled();
      sdkLoaded(newScript);
    } else {
      sdkLoaded(newScript);
      await newPending;
      sdkLoaded(oldScript);
    }
    await Promise.all([oldPending, newPending]);
    expect(mount).toHaveBeenCalledExactlyOnceWith({ host: newHost });
    api.close();
    api.close();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it("同时打开只创建一个面板和 SDK 请求", async () => {
    const pending = [api.open(), api.open(), api.open()];
    expect(document.querySelectorAll("#lol-tft-overlay")).toHaveLength(1);
    expect(scripts()).toHaveLength(1);
    sdkLoaded(scripts()[0]!);
    await Promise.all(pending);
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("SDK 已存在时，微任务完成前关闭也不挂载", async () => {
    vi.stubGlobal("WegameLogin", { default: {} });
    const pending = api.open();
    api.close();
    await pending;
    expect(mount).not.toHaveBeenCalled();
    expect(scripts()).toHaveLength(0);
  });

  it.each(["error", "timeout"])("SDK %s 后保留搜索功能，关闭后能恢复登录 SDK", async (failure) => {
    const pending = api.open();
    if (failure === "error") scripts()[0]!.dispatchEvent(new Event("error"));
    else await vi.advanceTimersByTimeAsync(4000);
    await pending;
    expect(mount).toHaveBeenCalledTimes(1);
    api.close();
    const reopened = api.open();
    sdkLoaded(scripts()[1]!);
    await reopened;
    expect(mount).toHaveBeenCalledTimes(2);
  });

  it("挂载失败后关闭重开可以恢复", async () => {
    vi.stubGlobal("WegameLogin", { default: {} });
    mount.mockImplementationOnce(() => { throw new Error("mount failed"); });
    await api.open();
    expect(document.getElementById("lol-tft-overlay-host")!.textContent).toContain("mount failed");
    api.close();
    await api.open();
    expect(mount).toHaveBeenCalledTimes(2);
    api.close();
    expect(unmount).toHaveBeenCalledTimes(1);
  });
});
