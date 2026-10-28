import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import katarina from "./fixtures/aramgg-katarina.json";
import descriptions from "./fixtures/aramgg-descriptions.json";
import {
  AramggError,
  clearAramggApiKey,
  clearAramggMemoryCache,
  fetchAramggChampionDetail,
  fetchAramggOverview,
  getAramggApiKey,
  isAramggApiKeySessionOnly,
  parseAugment,
  parseChampionDetail,
  parseOverview,
  setAramggApiKey,
  stripHtml
} from "../src/api/aramgg";

const config = { dataVersion: "16.21.2", gamePatch: "16.21", generatedAt: "2026-10-24T17:54:09.213Z" };
const augments = {
  data: [
    {
      id: 1001,
      name: "泰坦的坚决",
      rarity: 2,
      rarityDisplayName: "棱彩",
      iconUrl: "https://cdn.dtodo.cn/augment/1001.png",
      description: "在造成或承受伤害时获得<scaleAF>适应之力</scaleAF>。",
      tooltip: "",
      stats: { tier: "5", winRate: "0.4826", pickRate: "0.1708", games: "1234", date: "2026-10-23" },
      topChampions: [{ id: 223, name: "塔姆", iconUrl: "https://cdn.dtodo.cn/champ/223.png" }]
    },
    {
      id: 1002,
      name: "尖端发明家",
      rarity: 1,
      rarityDisplayName: "黄金",
      iconUrl: null,
      stats: { tier: "2", winRate: "0.5301", pickRate: "0.0901" }
    }
  ]
};
const champions = {
  data: [
    {
      id: 17,
      name: "提莫",
      title: "迅捷斥候",
      roles: ["marksman", "mage"],
      iconUrl: "https://cdn.dtodo.cn/champ/17.png",
      stats: { tier: "1", winRate: "0.5445", pickRate: "0.1366" }
    }
  ]
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as unknown as Response;
}

describe("ARAMGG 数据解析", () => {
  it("真实卡特琳娜数组按排名而非 ID 取推荐，保留统计来源", () => {
    const detail = parseChampionDetail(katarina);
    expect(detail.augments.map(item => item.name)).toEqual(["虚幻武器", "尖端发明家", "泰坦的坚决"]);
    expect(detail.augments[0].stats).toMatchObject({ rank: 1, games: 34126, winRateSource: "aramgg-client-upload", winRateRegion: "WORLD" });
    expect(detail.builds[0]).toMatchObject({ queueId: 450, tags: ["AP"] });
    expect(detail.builds[0].coreItems.map(item => item.id)).toEqual([3146, 3020, 4645]);
  });

  it("缺失数值不会被 Number(null) 转换为 0，缺失排名按胜率排在已排名项之后", () => {
    const detail = parseChampionDetail({ data: { augments: [
      { id: 1, name: "无排名", stats: { rank: null, games: null, winRate: 0.9 } },
      { id: 2, name: "有排名", stats: { rank: 1, games: 100, winRate: 0.5 } }
    ] } });
    expect(detail.augments.map(item => item.id)).toEqual([2, 1]);
    expect(detail.augments[1].stats).toMatchObject({ rank: null, games: null, tier: null });
  });

  it("公开描述中的问号明确标记缺失，移除图标语法并保留已有数值", () => {
    for (const raw of descriptions.data) {
      const item = parseAugment(raw)!;
      expect(item.descriptionIncomplete).toBe(true);
      expect(item.description).toContain("〔未提供〕");
      expect(item.description).not.toMatch(/%i:|\?|<[^>]+>/);
    }
    expect(stripHtml("获得%i:scaleAP%<scaleAP>@Amount@</scaleAP>法术强度，冷却7秒。&#37; &#xFFFD;")).toBe("获得〔未提供〕法术强度，冷却7秒。% 〔未提供〕");
  });
  it("解析强化：去 HTML、比例转数字、保留 topChampions", () => {
    const item = parseAugment(augments.data[0]);
    expect(item).not.toBeNull();
    expect(item!.name).toBe("泰坦的坚决");
    expect(item!.description).toBe("在造成或承受伤害时获得适应之力。");
    expect(item!.stats?.winRate).toBeCloseTo(0.4826);
    expect(item!.stats?.tier).toBe(5);
    expect(item!.topChampions[0]).toMatchObject({ id: 223, name: "塔姆" });
  });

  it("解析榜单概览并拒绝缺少 dataVersion 的配置", () => {
    const overview = parseOverview(config, augments, champions);
    expect(overview.dataVersion).toBe("16.21.2");
    expect(overview.augments).toHaveLength(2);
    expect(overview.champions[0]).toMatchObject({ id: 17, name: "提莫" });
    expect(() => parseOverview({}, augments, champions)).toThrow(AramggError);
  });

  it("解析单英雄详情（推荐强化 + 出装）", () => {
    const detail = parseChampionDetail({
      data: {
        champion: champions.data[0],
        augments: [{ ...augments.data[1], stats: { tier: "1", rank: "1", winRate: "0.55", pickRate: "0.2" } }],
        builds: [
          {
            tags: ["AP"],
            games: 100,
            wins: 55,
            winRate: "0.55",
            pickRate: "0.12",
            coreItems: [{ id: 6655, name: "卢登的回声" }],
            startingItems: [{ id: 1056 }],
            summonerSpells: [{ spells: [{ id: 4 }, { id: 12 }], winRate: "0.6", pickRate: "0.3" }],
            skillOrders: [{ skillKeys: ["E", "Q", "W", "Q"], winRate: "0.58" }]
          }
        ]
      }
    });
    expect(detail.champion?.name).toBe("提莫");
    expect(detail.augments[0].stats?.rank).toBe(1);
    expect(detail.builds[0].coreItems[0]).toMatchObject({ id: 6655, name: "卢登的回声" });
    expect(detail.builds[0].skillOrders[0].skillKeys).toEqual(["E", "Q", "W", "Q"]);
  });

  it("stripHtml 保留文本并处理常见实体", () => {
    expect(stripHtml("<b>强化</b><br/>第二行 &amp; 更多")).toBe("强化 第二行 & 更多");
    expect(stripHtml(null)).toBe("");
  });
});

describe("ARAMGG 请求与缓存", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAramggMemoryCache();
    clearAramggApiKey();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    clearAramggMemoryCache();
  });

  it("sessionOnly Key 不写 localStorage，清空会话后失效", () => {
    sessionStorage.clear();
    setAramggApiKey("hx_live_session", true);
    expect(getAramggApiKey()).toBe("hx_live_session");
    expect(isAramggApiKeySessionOnly()).toBe(true);
    expect(localStorage.getItem("lol_tft:aramgg-api-key")).toBeNull();
    sessionStorage.clear();
    expect(getAramggApiKey()).toBe("");
    clearAramggApiKey();
  });
  it("公开接口按 config → augments/champions 顺序拉取并缓存", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/config")) return jsonResponse(config);
      if (String(url).endsWith("/augments.json")) return jsonResponse(augments);
      if (String(url).endsWith("/champions.json")) return jsonResponse(champions);
      return jsonResponse({}, 404);
    }));

    const first = await fetchAramggOverview();
    expect(first.augments[0].name).toBe("泰坦的坚决");
    expect(calls).toHaveLength(3);
    expect(calls[0]).toBe("https://data.dtodo.cn/api/client/v1/config");

    await fetchAramggOverview();
    expect(calls).toHaveLength(3); // 命中缓存

    await fetchAramggOverview(true);
    expect(calls).toHaveLength(6);
  });

  it("单英雄详情需要 API Key，并带 Authorization 头且缓存结果", async () => {
    await expect(fetchAramggChampionDetail(17)).rejects.toMatchObject({ status: 401 });

    setAramggApiKey("hx_live_test");
    expect(getAramggApiKey()).toBe("hx_live_test");
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return jsonResponse({ data: { champion: champions.data[0], augments: [], builds: [] } });
    }));

    const detail = await fetchAramggChampionDetail(17);
    expect(detail.champion?.name).toBe("提莫");
    expect(calls[0].url).toBe("https://data.dtodo.cn/api/v1/zh-CN/champions/17.json");
    expect(calls[0].headers?.Authorization).toBe("Bearer hx_live_test");

    await fetchAramggChampionDetail(17);
    expect(calls).toHaveLength(1); // 内存缓存
  });

  it("英雄内存缓存满 12 小时后重新请求", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    setAramggApiKey("test-key");
    const fetchMock = vi.fn(async () => jsonResponse(katarina));
    vi.stubGlobal("fetch", fetchMock);
    await fetchAramggChampionDetail(55);
    await fetchAramggChampionDetail(55);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 12 * 60 * 60 * 1000;
    await fetchAramggChampionDetail(55);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("已知数据版本时无需 Key，优先读取公开英雄文件并合并同时查询", async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchAramggChampionDetail(55, { dataVersion: "16.21.3" });
    const second = fetchAramggChampionDetail(55, { dataVersion: "16.21.3" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonResponse(katarina.data));
    expect((await first).augments[0].name).toBe("虚幻武器");
    expect(await second).toEqual(await first);
    await fetchAramggChampionDetail(55, { dataVersion: "16.21.3" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://data.dtodo.cn/api/client/v1/data/16.21.3/champions/55.json", expect.objectContaining({ headers: { Accept: "application/json" } }));
  });

  it("公开文件失败才使用配置的 Key 回退；失败结果不缓存", async () => {
    setAramggApiKey("test-key");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 404)).mockResolvedValueOnce(jsonResponse({}, 503));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAramggChampionDetail(55, { dataVersion: "16.21.3" })).rejects.toMatchObject({ status: 503 });
    fetchMock.mockResolvedValueOnce(jsonResponse(katarina.data));
    await fetchAramggChampionDetail(55, { dataVersion: "16.21.3" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer test-key");
  });

  it("401/429 响应转换为可读错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 401)));
    await expect(fetchAramggOverview(true)).rejects.toMatchObject({ status: 401 });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 429)));
    await expect(fetchAramggOverview(true)).rejects.toMatchObject({ status: 429 });
  });
});
