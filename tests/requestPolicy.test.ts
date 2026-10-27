import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLolBattleApi, type LolBattleApi } from "../src/api/client";
import { route } from "../dev/mockData";
import type { GetBattleDetailResponse } from "../src/api/types";

const rq = { account_type: 2, area: 1, id: "offline-policy-player", from_src: "lol_helper" };
let api: LolBattleApi;

function response(body: unknown = { players: [] }, status = 200, retryAfter?: string): Response {
  return new Response(JSON.stringify(body), { status, headers: retryAfter === undefined ? {} : { "Retry-After": retryAfter } });
}

function slowBody(signal: AbortSignal, body: unknown = { players: [] }, ms = 80): Response {
  return new Response(new ReadableStream({
    start(controller) {
      const onAbort = () => {
        clearTimeout(timer);
        controller.error(new DOMException("aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        controller.close();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }));
}

function offlineFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(response(
    route(url.split("/").pop()!, JSON.parse(init.body as string))
  )));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  api = createLolBattleApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("429 Retry-After", () => {
  it.each([
    ["2", 2000], ["0", 0], ["Mon, 26 Oct 2026 12:00:02 GMT", 2000],
    ["Monday, 26-Oct-26 12:00:02 GMT", 2000], ["Mon Oct 26 12:00:02 2026", 2000],
    ["Mon, 26 Oct 2026 11:59:59 GMT", 0], [undefined, 1000], ["junk", 1000], ["-1", 1000], ["1.5", 1000]
  ])("waits for %s (%i ms), keeping retries bounded", async (header, ms) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 429, header))
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetchMock);
    const pending = api.searchPlayer("offline");
    await vi.advanceTimersByTimeAsync(0);
    if (ms > 0) {
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
    } else {
      await vi.runAllTimersAsync();
    }
    expect(await pending).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["11", "999999999999999999999999", "Mon, 26 Oct 2026 12:00:11 GMT"])("does not truncate over-limit %s into an early retry", async (header) => {
    const fetchMock = vi.fn(() => Promise.resolve(response({}, 429, header)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.searchPlayer("offline")).rejects.toMatchObject({ code: "429", message: "请求过于频繁，请稍后重试" });
    await vi.advanceTimersByTimeAsync(12000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("permits exactly 10 seconds but no longer", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 429, "10")).mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetchMock);
    const pending = api.searchPlayer("offline");
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds cumulative 429 waits even with a larger retry option", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({}, 429, "6")));
    vi.stubGlobal("fetch", fetchMock);
    const pending = api.searchPlayer("offline", { retries: 3 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toMatchObject({ code: "429" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry when disabled or after the default retry is exhausted", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({}, 429, "1")));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.searchPlayer("disabled", { retries: 0 })).rejects.toMatchObject({ code: "429" });
    const pending = api.searchPlayer("exhausted").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ code: "429" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, "custom", new Error("custom")])("cancels a Retry-After sleep immediately (%s)", async (reason) => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const fetchMock = vi.fn(() => Promise.resolve(response({}, 429, "10")));
    vi.stubGlobal("fetch", fetchMock);
    const pending = api.searchPlayer("offline", { signal: controller.signal }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    expect(await pending).toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps Retry-After separate from each attempt timeout and times out a stalled retry body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 429, "1"))
      .mockImplementationOnce((_url: string, init: RequestInit) => Promise.resolve(slowBody(init.signal!)));
    vi.stubGlobal("fetch", fetchMock);
    const pending = api.searchPlayer("offline", { timeoutMs: 20 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ name: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases HTTP error bodies and slots while waiting, so other requests can proceed", async () => {
    const seen = new Set<string>();
    const cancel = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const nickname = JSON.parse(init.body as string).nickname;
      if (nickname !== "fifth" && !seen.has(nickname)) {
        seen.add(nickname);
        const res = response({}, 429, "1");
        vi.spyOn(res.body!, "cancel").mockImplementation(cancel);
        return Promise.resolve(res);
      }
      return Promise.resolve(response());
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = ["one", "two", "three", "four", "fifth"].map((nickname) => api.searchPlayer(nickname));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(cancel).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await Promise.all(pending)).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("request concurrency and cancellation", () => {
  it("limits active fetch/body lifecycles to four and drains queued work", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve(slowBody(init.signal!)));
    vi.stubGlobal("fetch", fetchMock);
    const pending = Array.from({ length: 6 }, (_, i) => api.searchPlayer("offline-" + i));
    await vi.advanceTimersByTimeAsync(79);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(80);
    expect(await Promise.all(pending)).toEqual(Array.from({ length: 6 }, () => []));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes a cancelled queued request without blocking the next one", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve(slowBody(init.signal!)));
    vi.stubGlobal("fetch", fetchMock);
    const active = Array.from({ length: 4 }, (_, i) => api.searchPlayer("active-" + i));
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const cancelled = api.searchPlayer("cancelled", { signal: controller.signal }).catch((error: unknown) => error);
    const next = api.searchPlayer("next");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort("cancel queue");
    expect(await cancelled).toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(160);
    await Promise.all([...active, next]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetchMock.mock.calls[4][1].body as string).nickname).toBe("next");
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out in the queue without fetching and still releases following work", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve(slowBody(init.signal!)));
    vi.stubGlobal("fetch", fetchMock);
    const active = Array.from({ length: 4 }, (_, i) => api.searchPlayer("active-" + i));
    const expired = api.searchPlayer("expired", { timeoutMs: 20, retries: 0 }).catch((error: unknown) => error);
    const next = api.searchPlayer("next");
    await vi.advanceTimersByTimeAsync(20);
    expect(await expired).toMatchObject({ name: "TimeoutError" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(140);
    await Promise.all([...active, next]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a reserved slot before fetch starts", async () => {
    const fetchMock = offlineFetch();
    const controller = new AbortController();
    const pending = api.searchPlayer("offline", { signal: controller.signal }).catch((error: unknown) => error);
    controller.abort();
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares the same four slots across endpoint methods", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(slowBody(
      init.signal!, route(url.split("/").pop()!, JSON.parse(init.body as string))
    )));
    vi.stubGlobal("fetch", fetchMock);
    const pending = [api.searchPlayer("offline"), api.getSummonerInfo(rq), api.getBattleReport(rq),
      api.getBattleList(rq, { offset: 0, count: 10 }), api.getBattleDetail(rq, "offline-game")];
    await vi.advanceTimersByTimeAsync(79);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(81);
    expect(await Promise.all(pending)).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases slots on network, HTTP, JSON and contract failures", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline network failure"))
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(new Response("invalid json"))
      .mockResolvedValueOnce(response({ players: null }))
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetchMock);
    const pending = Array.from({ length: 5 }, (_, i) => api.searchPlayer("offline-" + i, { retries: 0 }).catch((error: unknown) => error));
    const values = await Promise.all(pending);
    expect(values[0]).toBeInstanceOf(TypeError);
    expect(values[1]).toMatchObject({ code: "403" });
    expect(values[2]).toMatchObject({ code: "INVALID_RESPONSE" });
    expect(values[3]).toMatchObject({ code: "INVALID_RESPONSE" });
    expect(values[4]).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("detail request sharing and bounded short-lived memory cache", () => {
  function slowDetails() {
    const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(slowBody(
      init.signal!, route(url.split("/").pop()!, JSON.parse(init.body as string))
    )));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("merges identical in-flight details while giving each subscriber its own result", async () => {
    const fetchMock = slowDetails();
    const first = api.getBattleDetail(rq, "offline-game");
    const second = api.getBattleDetail({ ...rq }, "offline-game");
    await vi.advanceTimersByTimeAsync(80);
    const [a, b] = await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.battle_detail.game_id).toBe("offline-game");
    expect(a).not.toBe(b);
    a.battle_detail.player_details[0].name = "mutated";
    expect(b.battle_detail.player_details[0].name).not.toBe("mutated");
    expect((await api.getBattleDetail(rq, "offline-game")).battle_detail.player_details[0].name).not.toBe("mutated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("one subscriber can cancel without aborting another subscriber", async () => {
    const fetchMock = slowDetails();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const cancelled = api.getBattleDetail(rq, "offline-game", { signal: controller.signal }).catch((error: unknown) => error);
    const survivor = api.getBattleDetail(rq, "offline-game");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort("custom");
    expect(await cancelled).toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(80);
    expect((await survivor).battle_detail.game_id).toBe("offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("all subscribers cancelling aborts transport; the next caller creates fresh work", async () => {
    const fetchMock = slowDetails();
    const controllers = [new AbortController(), new AbortController()];
    const pending = controllers.map((controller) => api.getBattleDetail(rq, "offline-game", { signal: controller.signal }).catch((error: unknown) => error));
    await vi.advanceTimersByTimeAsync(0);
    for (const controller of controllers) controller.abort();
    const next = api.getBattleDetail(rq, "offline-game");
    expect(await Promise.all(pending)).toEqual([expect.objectContaining({ name: "AbortError" }), expect.objectContaining({ name: "AbortError" })]);
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(80);
    expect((await next).battle_detail.game_id).toBe("offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start requests or serve cached data to pre-cancelled callers", async () => {
    const fetchMock = offlineFetch();
    await api.getBattleDetail(rq, "offline-game");
    const controller = new AbortController();
    controller.abort();
    for (const gameId of ["offline-game", "uncached-game"]) {
      await expect(api.getBattleDetail(rq, gameId, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { account_type: 1 }, { area: 2 }, { id: "other-offline-player" }, { from_src: "other-offline-source" }
  ])("includes every rq field in both cache and in-flight keys (%j)", async (change) => {
    const fetchMock = slowDetails();
    const original = api.getBattleDetail(rq, "offline-game");
    const changed = api.getBattleDetail({ ...rq, ...change }, "offline-game");
    await vi.advanceTimersByTimeAsync(80);
    await Promise.all([original, changed]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await api.getBattleDetail(rq, "offline-game");
    await api.getBattleDetail({ ...rq, ...change }, "offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes game ID and isolates timeout/retry policies in-flight", async () => {
    const fetchMock = slowDetails();
    const pending = [api.getBattleDetail(rq, "offline-game"), api.getBattleDetail(rq, "other-game"),
      api.getBattleDetail(rq, "offline-game", { timeoutMs: 1000 }),
      api.getBattleDetail(rq, "offline-game", { retries: 0 })];
    await vi.advanceTimersByTimeAsync(80);
    expect(await Promise.all(pending)).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires at 15 seconds after success without extending TTL on hits", async () => {
    const fetchMock = offlineFetch();
    await api.getBattleDetail(rq, "offline-game");
    await vi.advanceTimersByTimeAsync(14999);
    await api.getBattleDetail(rq, "offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await api.getBattleDetail(rq, "offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains at most 20 details and evicts the oldest insertion", async () => {
    const fetchMock = offlineFetch();
    for (let i = 0; i < 21; i++) await api.getBattleDetail(rq, "offline-game-" + i);
    await api.getBattleDetail(rq, "offline-game-1");
    expect(fetchMock).toHaveBeenCalledTimes(21);
    await api.getBattleDetail(rq, "offline-game-0");
    expect(fetchMock).toHaveBeenCalledTimes(22);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never shares or caches search, profile, report or list (including offsets)", async () => {
    const fetchMock = offlineFetch();
    const calls = () => [api.searchPlayer("offline"), api.getSummonerInfo(rq), api.getBattleReport(rq),
      api.getBattleList(rq, { count: 10, offset: 0 }), api.getBattleList(rq, { count: 10, offset: 10 })];
    const first = await Promise.all([...calls(), ...calls()]);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    const second = await Promise.all(calls());
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect((first[3] as { game_id: string }[])[0].game_id).not.toBe((second[4] as { game_id: string }[])[0].game_id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["http", "business", "contract", "json", "network"])("never caches failed %s detail requests", async (kind) => {
    const fetchMock = vi.fn().mockImplementationOnce(() => {
      if (kind === "network") return Promise.reject(new TypeError("offline network failure"));
      return Promise.resolve(kind === "http" ? response({}, 403) : kind === "json" ? new Response("bad json")
        : response(kind === "business" ? { result: { error_code: 900001 } } : {}));
    }).mockImplementation((url: string, init: RequestInit) => Promise.resolve(response(route(url.split("/").pop()!, JSON.parse(init.body as string)))));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.getBattleDetail(rq, "offline-game", { retries: 0 })).rejects.toBeInstanceOf(Error);
    await api.getBattleDetail(rq, "offline-game", { retries: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares a timeout failure, clears the in-flight entry, and lets a later call retry", async () => {
    const fetchMock = slowDetails();
    const pending = [api.getBattleDetail(rq, "offline-game", { timeoutMs: 20, retries: 0 }).catch((error: unknown) => error),
      api.getBattleDetail(rq, "offline-game", { timeoutMs: 20, retries: 0 }).catch((error: unknown) => error)];
    await vi.advanceTimersByTimeAsync(20);
    expect(await Promise.all(pending)).toEqual([expect.objectContaining({ name: "TimeoutError" }), expect.objectContaining({ name: "TimeoutError" })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const next = api.getBattleDetail(rq, "offline-game");
    await vi.advanceTimersByTimeAsync(80);
    expect((await next).battle_detail.game_id).toBe("offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([8000102, "WG_COMM_ERR_USER_CONFIG_LIMIT", 8000009, 8000021, 8000022])("invalidates cached detail on access/auth failure (%s)", async (code) => {
    const fetchMock = offlineFetch();
    await api.getBattleDetail(rq, "offline-game");
    fetchMock.mockResolvedValueOnce(response({ result: { error_code: code } }));
    await expect(api.getSummonerInfo(rq)).rejects.toMatchObject({ code });
    await api.getBattleDetail(rq, "offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403])("invalidates cached detail on HTTP access failure (%i)", async (status) => {
    const fetchMock = offlineFetch();
    await api.getBattleDetail(rq, "offline-game");
    fetchMock.mockResolvedValueOnce(response({}, status));
    await expect(api.getSummonerInfo(rq)).rejects.toMatchObject({ code: String(status) });
    await api.getBattleDetail(rq, "offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not repopulate cache from older work after access invalidation", async () => {
    let complete!: (value: Response) => void;
    const fetchMock = offlineFetch();
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const old = api.getBattleDetail(rq, "offline-game");
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockResolvedValueOnce(response({ result: { error_code: 8000102 } }));
    await expect(api.getSummonerInfo(rq)).rejects.toMatchObject({ code: 8000102 });
    complete(response(route("GetBattleDetail", { ...rq, game_id: "offline-game" })));
    await old;
    await api.getBattleDetail(rq, "offline-game");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a new API instance has no persisted cache", async () => {
    const fetchMock = offlineFetch();
    const a: GetBattleDetailResponse = await api.getBattleDetail(rq, "offline-game");
    const b = await createLolBattleApi().getBattleDetail(rq, "offline-game");
    expect(a.battle_detail.game_id).toBe(b.battle_detail.game_id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
