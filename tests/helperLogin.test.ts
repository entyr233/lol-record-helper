import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { mountHelperLogin } from "../src/helperLogin";
import type { WeGameLoginSdk } from "../src/types/wegame-login";

let instance: ReturnType<typeof mountHelperLogin>;
let reload: ReturnType<typeof vi.fn>;
let loggedIn: boolean;
let sdk: WeGameLoginSdk;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  reload = vi.fn();
  vi.stubGlobal("location", {
    hostname: "www.wegame.com.cn",
    pathname: "/helper/lol/",
    hash: "#/info/selection",
    reload
  });
  loggedIn = false;
  sdk = {
    isLogin: () => loggedIn,
    getUserInfo: () => ({}),
    getLoginUser: vi.fn(async () => ({ uin: "12345" })),
    popup: vi.fn(),
    logout: vi.fn()
  };
  window.WegameLogin = { default: sdk };
});

afterEach(() => {
  instance?.unmount();
  instance = null;
  delete window.WegameLogin;
  delete (window as unknown as { __LOL_TFT__?: unknown }).__LOL_TFT__;
  document.cookie = "uin=; Max-Age=0; path=/";
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function root(): ShadowRoot {
  return document.getElementById("lol-tft-helper-login")!.shadowRoot!;
}

async function login(): Promise<void> {
  instance = mountHelperLogin();
  root().querySelector<HTMLButtonElement>(".actions button")!.click();
  await flushPromises();
}

describe("官方助手登录入口", () => {
  it.each([
    ["www.wegame.com.cn", "/home/"],
    ["www.wegame.com.cn", "/helper/lol-other/"],
    ["lol.qq.com", "/helper/lol/"]
  ])("不在 %s%s 添加登录栏", (hostname, pathname) => {
    vi.stubGlobal("location", { hostname, pathname });
    expect(mountHelperLogin()).toBeNull();
    expect(document.getElementById("lol-tft-helper-login")).toBeNull();
  });

  it("使用独立样式且重复挂载不重复创建，初次展示不注入或调用登录 SDK", () => {
    delete window.WegameLogin;
    instance = mountHelperLogin();
    expect(root().querySelector("style")?.textContent).toContain(":host");
    expect(root().textContent).toContain("官方助手登录");
    expect(mountHelperLogin()).toBeNull();
    expect(document.querySelectorAll("#lol-tft-helper-login")).toHaveLength(1);
    expect(document.querySelector('script[src$="/login.sdk.js"]')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("点击后打开官方窗口，确认账号后刷新一次并保留助手页地址", async () => {
    await login();
    expect(sdk.popup).toHaveBeenCalledTimes(1);
    expect(root().textContent).toContain("等待登录");
    expect(reload).not.toHaveBeenCalled();
    root().querySelector<HTMLButtonElement>(".actions button")!.click();
    expect(sdk.popup).toHaveBeenCalledTimes(1);
    loggedIn = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(sdk.getLoginUser).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(location.pathname + location.hash).toBe("/helper/lol/#/info/selection");
  });

  it("账号仍不可读时继续等待，不把弹窗打开当成登录成功", async () => {
    loggedIn = true;
    sdk.getLoginUser = vi.fn(async () => ({}));
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    expect(root().textContent).toContain("等待登录");
  });

  it("登录窗口失败后显示可重试提示和官网入口，重试成功才刷新", async () => {
    sdk.popup = vi.fn().mockRejectedValueOnce(new Error("private login data"));
    await login();
    expect(root().querySelector('[role="alert"]')?.textContent).toContain("无法打开");
    expect(root().textContent).not.toContain("private login data");
    expect(root().querySelector("a")?.getAttribute("href")).toBe("https://www.wegame.com.cn/home/");
    expect(reload).not.toHaveBeenCalled();
    loggedIn = true;
    root().querySelector<HTMLButtonElement>(".actions button")!.click();
    await flushPromises();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("取消等待后，迟到的登录结果不刷新页面", async () => {
    await login();
    root().querySelectorAll<HTMLButtonElement>(".actions button")[1].click();
    loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    expect(root().querySelector('[role="alert"]')?.textContent).toContain("已取消");
  });

  it("卸载时结束等待，不留下定时器或刷新动作", async () => {
    await login();
    instance?.unmount();
    instance = null;
    loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.getElementById("lol-tft-helper-login")).toBeNull();
  });

  it("在官网登录后可以手动刷新原页，不重新调用登录 SDK", () => {
    instance = mountHelperLogin();
    root().querySelector<HTMLButtonElement>(".refresh")!.click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sdk.popup).not.toHaveBeenCalled();
  });

  it("选择大区后把 uin / area_id / account_type 写进 hash 再打开官方战绩", async () => {
    document.cookie = "uin=o012345; path=/";
    instance = mountHelperLogin();
    const select = root().querySelector<HTMLSelectElement>("select")!;
    select.value = "1";
    select.dispatchEvent(new Event("change"));
    await nextTick();

    root().querySelector<HTMLButtonElement>(".open-official")!.click();
    await nextTick();
    expect(location.hash).toBe("#/life/overview?uin=12345&area_id=1&account_type=1");
    expect(localStorage.getItem("lol_tft:lol-tft-helper-area")).toBe("1");
  });

  it("打开自建战绩时调用页面挂载的 __LOL_TFT__.open", () => {
    const open = vi.fn();
    (window as unknown as { __LOL_TFT__?: { open: () => void } }).__LOL_TFT__ = { open };
    instance = mountHelperLogin();
    root().querySelector<HTMLButtonElement>(".open-self")!.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("没有选择大区时官方战绩按钮不可用", () => {
    instance = mountHelperLogin();
    expect(root().querySelector<HTMLButtonElement>(".open-official")!.disabled).toBe(true);
  });

  it("面板可以收起和展开", async () => {
    instance = mountHelperLogin();
    const collapse = root().querySelector<HTMLButtonElement>(".collapse")!;
    collapse.click();
    await nextTick();
    expect(root().querySelector(".panel-body")).toBeNull();
    expect(collapse.textContent).toBe("展开");
    collapse.click();
    await nextTick();
    expect(root().querySelector(".panel-body")).not.toBeNull();
  });
});
