import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../src/api/transport";
vi.mock("../src/api/transport", () => ({ postJson: vi.fn() }));

let callback: (value: { ret: number; ticket?: string }) => void;
function install() {
  vi.stubGlobal("TencentCaptcha", class {
    constructor(_id: string, done: typeof callback) { callback = done; }
    show() {}
  });
}
async function start(signal?: AbortSignal) {
  const { runCaptchaVerification } = await import("../src/api/captcha");
  const task = runCaptchaVerification(signal);
  await Promise.resolve();
  return { task };
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  vi.mocked(postJson).mockReset().mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ result: { error_code: 0 } }) });
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("验证码有界等待与重试", () => {
  it("已取消时不注入 SDK", async () => {
    const controller = new AbortController(); controller.abort();
    const { runCaptchaVerification } = await import("../src/api/captcha");
    await expect(runCaptchaVerification(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(document.querySelector('script[src$="/TCaptcha.js"]')).toBeNull();
  });

  it.each(["timeout", "network", "missing-api"])("SDK %s 后清理脚本，重试可恢复", async (kind) => {
    const { task } = await start();
    const failed = expect(task).rejects.toMatchObject({ code: "CAPTCHA_SDK" });
    const script = document.querySelector('script[src$="/TCaptcha.js"]')!;
    if (kind === "timeout") await vi.advanceTimersByTimeAsync(6000);
    else script.dispatchEvent(new Event(kind === "network" ? "error" : "load"));
    await failed;
    expect(script.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    install();
    const retry = await start(); callback({ ret: 0, ticket: "test" }); await retry.task;
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("SDK 加载期间取消单个等待，不影响其他等待者", async () => {
    const controller = new AbortController();
    const first = await start(controller.signal);
    const failed = expect(first.task).rejects.toMatchObject({ name: "AbortError" });
    const second = await start();
    expect(document.querySelectorAll('script[src$="/TCaptcha.js"]')).toHaveLength(1);
    controller.abort(); await failed;
    install();
    document.querySelector('script[src$="/TCaptcha.js"]')!.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
    callback({ ret: 0, ticket: "test" }); await second.task;
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it.each(["abort", "timeout", "cancel"])("滑块 %s 后迟到成功不提交登记", async (kind) => {
    install(); const controller = new AbortController();
    const { task } = await start(controller.signal);
    const failed = expect(task).rejects.toMatchObject(kind === "abort" ? { name: "AbortError" }
      : { code: kind === "timeout" ? "CAPTCHA_TIMEOUT" : "CAPTCHA_CANCELLED" });
    if (kind === "abort") controller.abort();
    else if (kind === "timeout") await vi.advanceTimersByTimeAsync(120000);
    else callback({ ret: 2 });
    await failed;
    callback({ ret: 0, ticket: "late" });
    expect(postJson).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("验证登记失败后可重试", async () => {
    install();
    vi.mocked(postJson).mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, json: vi.fn() });
    const first = await start(); callback({ ret: 0, ticket: "test" });
    await expect(first.task).rejects.toMatchObject({ code: "503" });
    const second = await start(); callback({ ret: 0, ticket: "retry" }); await second.task;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("登记响应体挂起也会超时并取消网络信号", async () => {
    install();
    vi.mocked(postJson).mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, json: () => new Promise(() => {}) });
    const { task } = await start();
    const failed = expect(task).rejects.toMatchObject({ code: "CAPTCHA_TIMEOUT" });
    callback({ ret: 0, ticket: "test" });
    await vi.advanceTimersByTimeAsync(12000); await failed;
    expect(vi.mocked(postJson).mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
