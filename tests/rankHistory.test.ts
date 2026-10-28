// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchRankHistory, importRankHistoryHar, parseRankHistory } from "../src/api/rankHistory";
import { postJson } from "../src/api/transport";
import { rankHar, rankPayload } from "./fixtures/rankHistory";

vi.mock("../src/api/transport", () => ({ postJson: vi.fn() }));

describe("掌盟历史段位数据", () => {
  it("读取赛季记录，并按官方段位轴计算升段走势，不会误画成胜点下降", () => {
    const result = parseRankHistory(rankPayload());
    expect(result.seasons[0]).toEqual({ season: "S16 第三赛段", mode: "单双排", rank: "钻石Ⅳ", points: 25, games: 30, winRate: 60 });
    expect(result.trends[0].points.map((point) => [point.timestamp, point.value])).toEqual([[100, 90], [200, 110]]);
  });

  it("缺失数字显示未提供，错误响应和不完整结构不能伪装为空历史", () => {
    const data = rankPayload();
    delete (data.data.season_rank_list[0].list[0] as { total?: number }).total;
    expect(parseRankHistory(data).seasons[0].games).toBeNull();
    expect(() => parseRankHistory({ code: 100, msg: "private data" })).toThrow("掌盟未返回");
    expect(() => parseRankHistory({ code: 0, data: {} })).toThrow("格式不完整");
  });

  it("多角色通过具体角色 scene 匹配，取同角色最新记录，不使用默认档案昵称", () => {
    const sources = importRankHistoryHar(JSON.stringify(rankHar()));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ player: "本人测试角色#0001", area: "测试大区", capturedAt: "2026-10-28T01:00:00Z" });
    expect(sources[0].history.seasons[0].season).toBe("S16 第三赛段");
    expect(sources[1].player).toBe("其他测试角色#0002");
    expect(Object.keys(sources[0]).sort()).toEqual(["area", "capturedAt", "history", "player", "scene"]);
  });

  it("支持 base64 响应，忽略截断记录；没有有效响应时给出导出步骤", () => {
    const har = rankHar();
    const response = har.log.entries[1].response.content;
    response.text = Buffer.from(response.text, "utf8").toString("base64");
    Object.assign(response, { encoding: "base64" });
    har.log.entries[0].response.content.text = "truncated";
    expect(importRankHistoryHar(JSON.stringify(har))[0].history.seasons[0].season).toBe("S16 第三赛段");
    expect(() => importRankHistoryHar('{"log":{"entries":[]}}')).toThrow("打开本人历史段位页");
  });

  it("仅显式刷新时向固定掌盟地址发送 scene，预先取消时不请求", async () => {
    const controller = new AbortController();
    vi.mocked(postJson).mockResolvedValue({ ok: true, status: 200, json: async () => rankPayload(), headers: { get: () => null } });
    await fetchRankHistory("synthetic-self", controller.signal);
    expect(postJson).toHaveBeenCalledWith("https://mlol.qt.qq.com/go/battle_info/get_rank_trend", { scene: "synthetic-self" }, { signal: controller.signal });
    vi.mocked(postJson).mockClear();
    controller.abort();
    await expect(fetchRankHistory("synthetic-self", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(postJson).not.toHaveBeenCalled();
  });
});
