import { afterEach, describe, expect, it, vi } from "vitest";
import { lolBattleApi } from "../src/api/client";
import { ApiError } from "../src/api/errors";
import type { RqOptions } from "../src/api/types";

const rq: RqOptions = { account_type: 2, area: 1, id: "abc", from_src: "lol_helper" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lolBattleApi", () => {
  it("正常返回时直接给出业务数据", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ result: { error_code: 0, error_message: "" }, battles: [{ game_id: "1" }] })
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
      .mockResolvedValueOnce(jsonResponse({ result: { error_code: 0 }, battle_count: { total_games: 1 } }));
    vi.stubGlobal("fetch", fetchMock);

    const count = await lolBattleApi.getBattleReport(rq);

    expect(count.total_games).toBe(1);
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
});
