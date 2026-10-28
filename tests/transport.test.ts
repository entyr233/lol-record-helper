import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gmGet, postJson } from "../src/api/transport";

let request: { onload: (response: { status: number; responseText?: string; response?: string }) => void; onerror: () => void; ontimeout: () => void };
let abort: ReturnType<typeof vi.fn>;
let gm: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  abort = vi.fn();
  gm = vi.fn((options) => { request = options; return { abort }; });
  vi.stubGlobal("GM_xmlhttpRequest", gm);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("GM 传输生命周期", () => {
  it.each(["GET", "POST"])("%s 已取消时不发请求", async (method) => {
    const controller = new AbortController(); controller.abort();
    await expect(method === "GET" ? gmGet("https://example.com", 100, controller.signal)
      : postJson("https://example.com", {}, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(gm).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("取消会终止底层请求，移除监听和计时器，忽略迟到响应", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const task = postJson("https://example.com", {}, { signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    request.onload({ status: 200, responseText: "{}" });
    await rejected;
    expect(abort).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["timer", "callback"])("%s 超时终止请求并清理", async (source) => {
    const failed = expect(gmGet("https://example.com", 100)).rejects.toMatchObject({ code: "TIMEOUT" });
    if (source === "timer") await vi.advanceTimersByTimeAsync(100); else request.ontimeout();
    await failed;
    expect(abort).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 404, 503])("GET 状态 %s 不返回成功内容", async (status) => {
    const failed = expect(gmGet("https://example.com")).rejects.toMatchObject({ code: String(status) });
    request.onload({ status, responseText: "error" });
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("POST 保留状态 0，不将其转换为 200", async () => {
    const task = postJson("https://example.com", {});
    request.onload({ status: 0, responseText: "{}" });
    expect(await task).toMatchObject({ status: 0, ok: false });
  });

  it.each([{ responseText: "text" }, { response: "fallback" }, { responseText: "", response: "ignored" }])(
    "GET 读取文本字段 %j", async (response) => {
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const task = gmGet("https://example.com", 100, controller.signal);
      request.onload({ status: 200, ...response });
      expect(await task).toBe(response.responseText ?? response.response);
      expect(remove).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(["error", "throw"])("%s 清理计时器", async (kind) => {
    if (kind === "throw") gm.mockImplementationOnce(() => { throw new Error("transport failed"); });
    const failed = expect(gmGet("https://example.com")).rejects.toBeInstanceOf(Error);
    if (kind === "error") request.onerror();
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("fetch 传输清理", () => {
  it("已取消时不调用 fetch", async () => {
    vi.stubGlobal("GM_xmlhttpRequest", undefined);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const controller = new AbortController(); controller.abort();
    await expect(postJson("https://example.com", {}, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([true, false])("完成后清理监听与计时器（success=%s）", async (success) => {
    vi.stubGlobal("GM_xmlhttpRequest", undefined);
    vi.stubGlobal("fetch", success ? vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) : vi.fn().mockRejectedValue(new Error("offline")));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const task = postJson("https://example.com", {}, { signal: controller.signal });
    if (success) await (await task).json(); else await expect(task).rejects.toThrow("offline");
    expect(remove).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
