import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AramView from "../src/views/AramView.vue";
import { __setAramggOverviewForTest } from "../src/composables/useAramgg";
import { clearAramggApiKey, clearAramggMemoryCache, setAramggApiKey } from "../src/api/aramgg";
import type { AramggOverview } from "../src/api/aramgg";

const overview: AramggOverview = {
  dataVersion: "16.21.2",
  gamePatch: "16.21",
  generatedAt: "2026-10-24T17:54:09.213Z",
  augments: [
    {
      id: 1002,
      name: "尖端发明家",
      rarity: 1,
      rarityName: "gold",
      rarityDisplayName: "黄金",
      iconUrl: null,
      description: "装备急速提高。",
      tooltip: "",
      stats: { tier: 2, wins: null, games: null, winRate: 0.5301, pickRate: 0.0901, gamePatch: "16.21", date: "2026-10-23", source: "tencent", region: "CN" },
      topChampions: []
    },
    {
      id: 1001,
      name: "泰坦的坚决",
      rarity: 2,
      rarityName: "prismatic",
      rarityDisplayName: "棱彩",
      iconUrl: null,
      description: "每 10 层获得适应之力。",
      tooltip: "",
      stats: { tier: 5, wins: null, games: null, winRate: 0.4826, pickRate: 0.1708, gamePatch: "16.21", date: "2026-10-23", source: "tencent", region: "CN" },
      topChampions: [{ id: 223, name: "塔姆", iconUrl: null }]
    }
  ],
  champions: [
    {
      id: 17,
      alias: "Teemo",
      name: "提莫",
      title: "迅捷斥候",
      roles: ["marksman", "mage"],
      iconUrl: "https://cdn.dtodo.cn/hextech/champion-icons/17.png",
      stats: { tier: 1, wins: null, games: null, winRate: 0.5445, pickRate: 0.1366, gamePatch: "16.21", date: "2026-10-23", source: "tencent", region: "CN" }
    },
    {
      id: 157,
      alias: "Yasuo",
      name: "亚索",
      title: "疾风剑豪",
      roles: ["fighter", "assassin"],
      iconUrl: "https://cdn.dtodo.cn/hextech/champion-icons/157.png",
      stats: { tier: 2, wins: null, games: null, winRate: 0.5101, pickRate: 0.113, gamePatch: "16.21", date: "2026-10-23", source: "tencent", region: "CN" }
    }
  ]
};

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  __setAramggOverviewForTest(overview);
});

afterEach(() => {
  __setAramggOverviewForTest(null);
  clearAramggApiKey();
  clearAramggMemoryCache();
  vi.unstubAllGlobals();
});

describe("海克斯数据视图", () => {
  it("展示强化榜并按胜率排序，显示数据来源与补丁", () => {
    const wrapper = mount(AramView);
    const text = wrapper.text();
    expect(text).toContain("海克斯数据");
    expect(text).toContain("16.21.2");
    expect(text).toContain("尖端发明家");
    expect(text).toContain("泰坦的坚决");
    expect(text).toContain("53.0%");
    const firstRow = wrapper.find(".aram-row");
    expect(firstRow.text()).toContain("尖端发明家");
  });

  it("品质筛选只保留对应品质", async () => {
    const wrapper = mount(AramView);
    await wrapper.find("select").setValue("prismatic");
    const text = wrapper.text();
    expect(text).toContain("泰坦的坚决");
    expect(text).not.toContain("尖端发明家");
  });

  it("切换到英雄榜并展示英雄胜率", async () => {
    const wrapper = mount(AramView);
    const tab = wrapper.findAll("button").find((item) => item.text() === "英雄榜");
    expect(tab).toBeTruthy();
    await tab!.trigger("click");
    const text = wrapper.text();
    expect(text).toContain("提莫");
    expect(text).toContain("亚索");
    expect(text).toContain("54.4%");
  });

  it("未配置 API Key 时点击英雄给出提示，不发起请求", async () => {
    const wrapper = mount(AramView);
    const tab = wrapper.findAll("button").find((item) => item.text() === "英雄榜");
    await tab!.trigger("click");
    const row = wrapper.findAll(".aram-row").find((item) => item.text().includes("提莫"));
    await row!.trigger("click");
    expect(wrapper.text()).toContain("未配置 ARAMGG API Key");
  });

  it("配置 API Key 后展示推荐海克斯与出装", async () => {
    setAramggApiKey("hx_live_test");
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: {
          champion: overview.champions[0],
          augments: [
            {
              id: 1002,
              name: "尖端发明家",
              rarity: 1,
              rarityDisplayName: "黄金",
              iconUrl: null,
              stats: { tier: 1, rank: 1, winRate: 0.56, pickRate: 0.2 }
            }
          ],
          builds: [
            {
              tags: ["AP"],
              games: 100,
              wins: 56,
              winRate: 0.56,
              pickRate: 0.12,
              coreItems: [{ id: 6655, name: "卢登的回声" }],
              startingItems: [{ id: 1056, name: "多兰之戒" }],
              summonerSpells: [{ spells: [{ id: 4 }, { id: 12 }], winRate: 0.6, pickRate: 0.3 }],
              skillOrders: [{ skillKeys: ["E", "Q", "W", "Q"], winRate: 0.58 }]
            }
          ]
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(AramView);
    const tab = wrapper.findAll("button").find((item) => item.text() === "英雄榜");
    await tab!.trigger("click");
    const row = wrapper.findAll(".aram-row").find((item) => item.text().includes("提莫"));
    await row!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = wrapper.text();
    expect(text).toContain("推荐海克斯");
    expect(text).toContain("尖端发明家");
    expect(wrapper.html()).toContain("卢登的回声");
    expect(text).toContain("E Q W Q");
  });
});
