import { afterEach, describe, expect, it, vi } from "vitest";
import { createLolBattleApi, type LolBattleApi } from "../src/api/client";
import { assertResponse } from "../src/api/contracts";
import { ApiError, toErrorMessage } from "../src/api/errors";
import { route } from "../dev/mockData";
import detailSample from "./fixtures/wegame/gameid_result.json";
import listSample from "./fixtures/wegame/gamelist_result.json";

const playerParams = { account_type: 2, area: 1, id: "offline-contract-player", from_src: "lol_helper" };
const calls: Array<[string, (api: LolBattleApi) => Promise<unknown>]> = [
  ["SearchPlayer", (api) => api.searchPlayer("离线示例")],
  ["GetSummonerInfo", (api) => api.getSummonerInfo(playerParams)],
  ["GetBattleReport", (api) => api.getBattleReport(playerParams)],
  ["GetBattleList", (api) => api.getBattleList(playerParams, { offset: 0, count: 10 })],
  ["GetBattleDetail", (api) => api.getBattleDetail(playerParams, "offline-contract-game")]
];

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("WeGame response contracts from current samples and mock routes", () => {
  it.each(calls)("%s accepts the actual offline mock route end to end", async (method, call) => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      expect(url.endsWith("/" + method)).toBe(true);
      return Promise.resolve(respond(route(method, JSON.parse(init.body as string))));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await call(createLolBattleApi())).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["GetBattleList", listSample], ["GetBattleDetail", detailSample]
  ])("%s accepts every nested record in the current redacted sample", (method, payload) => {
    expect(() => assertResponse(method as string, payload)).not.toThrow();
  });

  it.each([
    ["GetBattleList", listSample], ["GetBattleDetail", detailSample]
  ])("%s reads the actual sample through fetch/json/validation", async (method, payload) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(respond(payload))));
    const api = createLolBattleApi();
    if (method === "GetBattleList") {
      expect((await api.getBattleList(playerParams, { count: 10, offset: 0 })).length).toBe(listSample.battles.length);
    } else {
      const data = await api.getBattleDetail(playerParams, detailSample.battle_detail.game_id);
      expect(data.battle_detail.player_details.length).toBe(detailSample.battle_detail.player_details.length);
      expect(data.battle_detail.team_details.length).toBe(detailSample.battle_detail.team_details.length);
    }
  });

  it.each(calls)("%s accepts string success codes and additional fields", async (method, call) => {
    const body = route(method, { ...playerParams, game_id: "offline-contract-game" }) as Record<string, unknown>;
    body.result = { error_code: "0" };
    body.future_field = { more: true };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(respond(body))));
    expect(await call(createLolBattleApi())).toBeDefined();
  });

  it("preserves numeric-looking string identifiers, team IDs and win labels", () => {
    const copy = JSON.parse(JSON.stringify(detailSample)) as typeof detailSample;
    assertResponse("GetBattleDetail", copy);
    expect(typeof copy.battle_detail.game_id).toBe("string");
    expect(copy.battle_detail.team_details.every((team) => typeof team.teamId === "string" && typeof team.win === "string")).toBe(true);
    expect(copy.battle_detail.player_details.every((player) => typeof player.teamId === "string")).toBe(true);
  });

  it.each(calls)("%s rejects missing success data instead of reporting empty results", async (method, call) => {
    const fetchMock = vi.fn(() => Promise.resolve(respond({ result: { error_code: 0 } })));
    vi.stubGlobal("fetch", fetchMock);
    const error = await call(createLolBattleApi()).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "INVALID_RESPONSE", method });
    expect(toErrorMessage(error)).toContain("接口响应格式异常");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(calls)("%s preserves hidden/auth business errors without requiring success fields", async (_method, call) => {
    for (const code of [8000102, "8000102", "WG_COMM_ERR_USER_CONFIG_LIMIT", 8000009]) {
      const fetchMock = vi.fn(() => Promise.resolve(respond({ result: { error_code: code } })));
      vi.stubGlobal("fetch", fetchMock);
      const error = await call(createLolBattleApi()).catch((error: unknown) => error);
      expect(error).toMatchObject({ code });
      if (String(code) === "8000102") expect((error as ApiError).isUnauthenticated).toBe(true);
      if (code === "WG_COMM_ERR_USER_CONFIG_LIMIT") expect((error as ApiError).isHidden).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it.each([null, [], "text", {}, { result: null }, { result: [] }, { result: {} },
    { result: { error_code: false } }, { result: { error_code: "" } }, { result: { error_code: 0, error_message: {} } },
    { players: null }, { players: {} }, { players: [null] }, { players: [{}] },
    { players: [{ openid: "offline", area: "1", level: 1, icon_id: 1 }] }
  ])("rejects malformed search/envelope (%j) without a retry", async (body) => {
    const fetchMock = vi.fn(() => Promise.resolve(respond(body)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLolBattleApi().searchPlayer("offline")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["SearchPlayer", "GetBattleList"])("%s accepts an explicit empty array", async (method) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(respond({ [method === "SearchPlayer" ? "players" : "battles"]: [] }))));
    const api = createLolBattleApi();
    expect(await (method === "SearchPlayer" ? api.searchPlayer("offline") : api.getBattleList(playerParams, { count: 10, offset: 0 }))).toEqual([]);
  });

  it.each([
    ["GetSummonerInfo", { summoner: { name: "offline", icon_id: 1 } }],
    ["GetBattleReport", { battle_count: { total_games: 1 } }],
    ["GetBattleList", { battles: [{ game_id: "offline" }] }],
    ["GetBattleList", { battles: [null] }],
    ["GetBattleDetail", { ...detailSample, battle_detail: { ...detailSample.battle_detail, player_details: null } }],
    ["GetBattleDetail", { ...detailSample, battle_detail: { ...detailSample.battle_detail, team_details: [] } }],
    ["GetBattleDetail", { ...detailSample, battle_detail: { ...detailSample.battle_detail, player_details: [{}] } }]
  ])("%s rejects broken required structure", (method, payload) => {
    expect(() => assertResponse(method as string, payload)).toThrow(ApiError);
  });

  it("does not require optional detail telemetry or reject new fields", () => {
    const payload = JSON.parse(JSON.stringify(detailSample));
    for (const player of payload.battle_detail.player_details) {
      delete player.battleHonour;
      delete player.summonSpell1Cast;
      delete player.puuId;
      player.new_field = "extra";
    }
    expect(() => assertResponse("GetBattleDetail", payload)).not.toThrow();
  });
});
