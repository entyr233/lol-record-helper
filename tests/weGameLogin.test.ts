import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeGameLoginSdk } from "../src/types/wegame-login";
import { getLoginUser, injectLoginSdk, isLoggedIn, isSdkAvailable, LoginError, triggerLogin, waitForLogin, waitForSdk } from "../src/utils/weGameLogin";

function install(overrides: Partial<WeGameLoginSdk> = {}) {
  const api: WeGameLoginSdk = {
    isLogin: () => true, logout: vi.fn(), getUserInfo: () => ({}),
    getLoginUser: vi.fn(async () => ({ uin: "10001" })), popup: vi.fn(), ...overrides
  };
  window.WegameLogin = { default: api };
  return api;
}

beforeEach(() => { vi.useFakeTimers(); delete window.WegameLogin; });
afterEach(() => { delete window.WegameLogin; vi.clearAllTimers(); vi.useRealTimers(); });

describe("WeGame SDK readiness and account recovery", () => {
  it("空 SDK 在有界等待后报告缺失，SDK 迟到后可重新读取", async () => {
    expect(isSdkAvailable()).toBe(false);
    const failed = expect(getLoginUser({ timeoutMs: 400 })).rejects.toMatchObject({ code: "SDK_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(400);
    await failed;
    const pending = getLoginUser();
    await vi.advanceTimersByTimeAsync(200);
    install();
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ uin: "10001" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("SDK 存在不代表 ready；ready 延迟时不提前读账号或弹窗", async () => {
    let ready!: () => void;
    const api = install({ readyPromise: new Promise<void>((resolve) => { ready = resolve; }) });
    const account = getLoginUser();
    const popup = triggerLogin();
    await vi.advanceTimersByTimeAsync(500);
    expect(isSdkAvailable()).toBe(true);
    expect(api.getLoginUser).not.toHaveBeenCalled();
    expect(api.popup).not.toHaveBeenCalled();
    ready();
    await expect(account).resolves.toEqual({ uin: "10001" });
    await popup;
    expect(api.popup).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["pending", "reject"])("ready %s 有界失败且不泄露 SDK 错误", async (state) => {
    install({ readyPromise: state === "pending" ? new Promise(() => {}) : Promise.reject(new Error("private SDK data")) });
    const failed = expect(waitForSdk({ timeoutMs: 300 })).rejects.toMatchObject({ code: "SDK_NOT_READY" });
    await vi.advanceTimersByTimeAsync(300);
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isLogin=true、UIN 缺失时不会提前判为登录完成，短暂恢复后返回字符串", async () => {
    const read = vi.fn().mockResolvedValueOnce({}).mockResolvedValue({ uin: "90071992547409931234" });
    install({ getLoginUser: read });
    const pending = waitForLogin({ timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(isLoggedIn()).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ uin: "90071992547409931234" });
  });

  it("UIN 始终缺失时明确失败，不把登录标志当账号", async () => {
    install({ getLoginUser: async () => ({}) });
    const failed = expect(waitForLogin({ timeoutMs: 500 })).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(500);
    await failed;
  });

  it.each(["throw", "reject", "hang"])("getLoginUser %s 不吞异常、不无限等待", async (kind) => {
    install({ getLoginUser: () => {
      if (kind === "throw") throw new Error("private SDK data");
      return kind === "reject" ? Promise.reject(new Error("private SDK data")) : new Promise(() => {});
    } });
    const result = getLoginUser({ timeoutMs: 500 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(500);
    const error = await result;
    expect(error).toBeInstanceOf(LoginError);
    expect(error).toMatchObject({ code: "ACCOUNT_READ_FAILED" });
    expect(String(error)).not.toContain("private SDK data");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("瞬时账号读取异常后重试恢复", async () => {
    install({ getLoginUser: vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue({ uin: 12345 }) });
    const pending = getLoginUser();
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ uin: "12345" });
  });

  it("拒绝已经损失精度的数值 UIN", async () => {
    install({ getLoginUser: async () => ({ uin: Number.MAX_SAFE_INTEGER + 1 }) });
    await expect(getLoginUser()).rejects.toMatchObject({ code: "UNSAFE_UIN" });
  });

  it.each([undefined, () => { throw new Error("private popup"); }, () => Promise.reject(new Error("private popup"))])(
    "popup 不存在或失败时给出明确提示", async (popup) => {
      const api = install({ popup });
      await expect(triggerLogin()).rejects.toMatchObject({ code: "POPUP_FAILED" });
      expect(api.logout).not.toHaveBeenCalled();
    }
  );

  it("未登录时显式读账号失败，等待登录可以跨过登录标志和 UIN 恢复", async () => {
    let loggedIn = false;
    install({ isLogin: () => loggedIn });
    await expect(getLoginUser()).rejects.toMatchObject({ code: "NOT_LOGGED_IN" });
    const pending = waitForLogin({ timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(200);
    loggedIn = true;
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ uin: "10001" });
  });

  it.each(["missing", "ready", "account"])("取消 %s 等待立即释放定时器，迟到结果不复活", async (stage) => {
    let resolve!: (value: { uin: string }) => void;
    if (stage !== "missing") install(stage === "ready"
      ? { readyPromise: new Promise(() => {}) }
      : { getLoginUser: () => new Promise((done) => { resolve = done; }) });
    const controller = new AbortController();
    const failed = expect(getLoginUser({ signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await failed;
    resolve?.({ uin: "12345" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("getSelfUinFromCookie（8000101 修复）", () => {
  it("p_uin 带 o 前缀与前导零时规整为数字 uin", async () => {
    document.cookie = "p_uin=o0643194418; path=/";
    const mod = await import("../src/utils/weGameLogin");
    expect(mod.getSelfUinFromCookie()).toBe("643194418");
  });

  it("无相关 cookie 时返回 null", async () => {
    document.cookie = "p_uin=; path=/; max-age=0";
    document.cookie = "uin=; path=/; max-age=0";
    const mod = await import("../src/utils/weGameLogin");
    expect(mod.getSelfUinFromCookie()).toBeNull();
  });
});

describe("按需注入 SDK", () => {
  afterEach(() => document.querySelectorAll('script[src$="/login.sdk.js"]').forEach((script) => script.remove()));

  it("已有 SDK 时不重复注入、不创建计时器", async () => {
    install();
    await expect(injectLoginSdk()).resolves.toBe(true);
    expect(document.querySelectorAll('script[src$="/login.sdk.js"]')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("脚本载入后等待 SDK 对象可用，并释放计时器", async () => {
    const pending = injectLoginSdk();
    expect(document.querySelectorAll('script[src$="/login.sdk.js"]')).toHaveLength(1);
    install();
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("SDK 超时后明确返回失败，并释放计时器", async () => {
    const pending = injectLoginSdk(600);
    await vi.advanceTimersByTimeAsync(900);
    await expect(pending).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("网络加载失败立即结束，并释放计时器", async () => {
    const pending = injectLoginSdk();
    document.querySelector('script[src$="/login.sdk.js"]')!.dispatchEvent(new Event("error"));
    await expect(pending).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
