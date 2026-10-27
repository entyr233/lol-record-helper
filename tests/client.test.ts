import { afterEach, describe, expect, it, vi } from "vitest";
import { lolBattleApi } from "../src/api/client";
import { ApiError } from "../src/api/errors";
import type { RqOptions } from "../src/api/types";
import gamelistSample from "../sample/gamelist_result.json";
import { route } from "../dev/mockData";

const rq: RqOptions = { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

// Headers arrive immediately; the response body remains pending like a slow fetch stream.
function slowJsonResponse(signal: AbortSignal, ms = 80): Response {
  return new Response(new ReadableStream({
    start(controller) {
      const onAbort = () => {
        clearTimeout(timer);
        controller.error(new DOMException("body aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ players: [] })));
        controller.close();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("lolBattleApi", () => {
  it("正常返回时直接给出业务数据", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ result: { error_code: 0, error_message: "" }, battles: [gamelistSample.battles[0]] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const battles = await lolBattleApi.getBattleList(rq, { count: 10, offset: 0 });

    expect(battles).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["trpc-caller"]).toBe("wegame.pallas.web.LolBattle");
    expect(JSON.parse(init.body)).toMatchObject({ count: 10, offset: 0, area: 1, id: "abc" });
  });

  it("未登录错误码 8000102 映射成可读提示（旧版会拿到空 message）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ result: { error_code: 8000102, error_message: "" } }))
    );

    const error = await lolBattleApi.getSummonerInfo(rq).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.isUnauthenticated).toBe(true);
    expect(apiError.message).toBe("登录状态已失效，请在 WeGame 页面重新登录");
    expect(apiError.displayMessage).toContain("8000102");
  });

  it("未知错误码也给出非空提示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ result: { error_code: 900001, error_message: "" } }))
    );

    const error = (await lolBattleApi.getBattleReport(rq).catch((err: unknown) => err)) as ApiError;

    expect(error.message).toContain("GetBattleReport");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("5xx 会重试一次", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 502))
      .mockResolvedValueOnce(jsonResponse(route("GetBattleReport", { ...rq })));
    vi.stubGlobal("fetch", fetchMock);

    const count = await lolBattleApi.getBattleReport(rq);

    expect(count.total_games).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("外部取消时抛 AbortError 且不再重试", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();

    const error = await lolBattleApi.getBattleList(rq, { count: 10, offset: 0 }, { signal: controller.signal }).catch((err: unknown) => err);

    expect((error as Error).name).toBe("AbortError");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("响应头到达后，20ms 超时仍中止 80ms 的响应体读取", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, init: RequestInit) => slowJsonResponse(init.signal!));
    vi.stubGlobal("fetch", fetchMock);
    const settled = vi.fn();
    const pending = lolBattleApi.searchPlayer("test", { timeoutMs: 20, retries: 0 }).catch(settled);

    await vi.advanceTimersByTimeAsync(20);
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "TimeoutError" }));
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["custom cancellation", new Error("custom cancellation")])(
    "响应体读取期间外部取消归一化为 AbortError，且不重试（%s）",
    async (reason) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const removeListener = vi.spyOn(controller.signal, "removeEventListener");
      const fetchMock = vi.fn((_url, init: RequestInit) => slowJsonResponse(init.signal!));
      vi.stubGlobal("fetch", fetchMock);
      const pending = lolBattleApi.searchPlayer("test", { signal: controller.signal }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);

      controller.abort(reason);

      expect(await pending).toMatchObject({ name: "AbortError" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("响应体超时可以重试，退避前清理该次计时器和外部监听", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url, init: RequestInit) => slowJsonResponse(init.signal!))
      .mockResolvedValueOnce(jsonResponse({ players: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = lolBattleApi.searchPlayer("test", { timeoutMs: 20, signal: controller.signal });

    await vi.advanceTimersByTimeAsync(20);
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1); // Only the retry backoff remains.
    await vi.advanceTimersByTimeAsync(300);

    expect(await pending).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("重试退避期间外部取消不会再发请求", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = lolBattleApi.searchPlayer("test", { signal: controller.signal }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "json", "http", "business"])("%s 路径清理超时及外部监听，错误不误重试", async (kind) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const response = kind === "json" ? new Response("invalid json") : jsonResponse(
      kind === "business" ? { result: { error_code: 900001 } } : { players: [] },
      kind === "http" ? 403 : 200
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await lolBattleApi.searchPlayer("test", { signal: controller.signal }).catch((error: unknown) => error);

    if (kind === "success") expect(result).toEqual([]);
    else if (kind === "json") expect(result).toMatchObject({ code: "INVALID_RESPONSE", method: "SearchPlayer" });
    else expect(result).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("网络错误仍重试一次", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(jsonResponse({ players: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = lolBattleApi.searchPlayer("test");
    await vi.advanceTimersByTimeAsync(300);
    expect(await pending).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("响应头之前超时仍归一化为 TimeoutError", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = lolBattleApi.searchPlayer("test", { timeoutMs: 20, retries: 0 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ name: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("5xx 重试耗尽后保留 HTTP ApiError", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({}, 502));
    vi.stubGlobal("fetch", fetchMock);
    const pending = lolBattleApi.searchPlayer("test").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(300);
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "502", method: "SearchPlayer" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
