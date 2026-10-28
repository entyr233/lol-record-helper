import { afterEach, expect, it, vi } from "vitest";
import { createLolBattleApi } from "../src/api/client";

vi.mock("../src/api/captcha", async (original) => ({
  ...await original<typeof import("../src/api/captcha")>(), captchaAllowed: () => true
}));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("取消查询会结束真实验证码等待，迟到回调不登记、不重试原请求", async () => {
  vi.useFakeTimers();
  let callback!: (result: { ret: number; ticket: string }) => void;
  vi.stubGlobal("TencentCaptcha", class {
    constructor(_id: string, done: typeof callback) { callback = done; }
    show() {}
  });
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { error_code: 8000022 } })));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const task = createLolBattleApi().searchPlayer("test", { signal: controller.signal });
  const failed = expect(task).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  expect(callback).toBeTypeOf("function");
  controller.abort(); await failed;
  callback({ ret: 0, ticket: "late" });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
