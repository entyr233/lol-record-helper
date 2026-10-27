import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import BattleDetailView from "../src/components/BattleDetail.vue";
import { ApiError } from "../src/api/errors";
import { lolBattleApi } from "../src/api/client";
import { fetchMlolBattleDetail } from "../src/api/mlolDetail";
import type { BattleDetail as BattleDetailData, GetBattleDetailResponse, PlayerDetail, TeamDetail } from "../src/api/types";

// 接口层全部 mock：详情/召唤师信息走 wegame，掌盟源兜底
vi.mock("../src/api/client", () => ({
  lolBattleApi: {
    getBattleDetail: vi.fn(),
    getSummonerInfo: vi.fn()
  }
}));
vi.mock("../src/api/mlolDetail", () => ({
  fetchMlolBattleDetail: vi.fn()
}));

const getBattleDetailMock = vi.mocked(lolBattleApi.getBattleDetail);
const getSummonerInfoMock = vi.mocked(lolBattleApi.getSummonerInfo);
const fetchMlolMock = vi.mocked(fetchMlolBattleDetail);

/** 摘要里的英雄图标用轻量 stub：把 kind / id 落到 DOM 上便于断言 */
const IconStub = defineComponent({
  name: "GameIcon",
  props: {
    kind: { type: String, default: "" },
    id: { type: [Number, String], required: true },
    championId: { type: [Number, String], default: 0 },
    src: { type: String, default: "" },
    title: { type: String, default: "" }
  },
  setup(props) {
    return () => h("i", { class: "icon-stub", "data-kind": props.kind, "data-id": String(props.id) });
  }
});

/** 队伍行用轻量 stub：只把 openid / is-self 落到 DOM 上，避开玩家行的无关依赖 */
const PlayerStub = defineComponent({
  name: "BattleDetailPlayer",
  props: {
    player: { type: Object, required: true },
    players: { type: Array, default: () => [] },
    mode: { type: String, default: "概要" },
    hexAram: { type: Boolean, default: false },
    rankInfo: { type: Object, default: null },
    isSelf: { type: Boolean, default: false }
  },
  setup(props) {
    return () =>
      h("div", {
        class: "player-stub",
        "data-openid": (props.player as PlayerDetail).openid,
        "data-self": props.isSelf ? "1" : "0"
      });
  }
});

function makePlayer(openid: string, teamId: string, championId: number, name: string): PlayerDetail {
  return {
    openid,
    name,
    championId,
    level: 11,
    teamId,
    teamMadeSize: 1,
    championsKilled: 3,
    numDeaths: 2,
    assists: 5,
    gameScore: 1000,
    totalDamageToChampions: 12000,
    totalDamageTaken: 9000,
    magicDamageToChampions: 0,
    physicalDamageToChampions: 0,
    trueDemageToChampions: 0,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    keystoneId: 0,
    perkSubStyle: 0,
    summonSpell1Id: 4,
    summonSpell2Id: 14,
    battleHonour: {}
  };
}

function makeTeam(teamId: string, win: string): TeamDetail {
  return { teamId, win, totalKills: 10, totalDeaths: 8, totalAssists: 20 };
}

const BLUE_PLAYER = makePlayer("openid-blue", "100", 57, "蓝方玩家");
const RED_PLAYER = makePlayer("openid-red", "200", 103, "红方玩家");

/** team_details[0] 是 team 100（Win），玩家按两队混排 */
function makeDetail(): BattleDetailData {
  return {
    area_id: "1",
    game_id: "g1",
    game_start_time: "1700000000000",
    game_time_played: 1855,
    map_id: 11,
    game_queue_id: 420,
    team_details: [makeTeam("100", "Win"), makeTeam("200", "Fail")],
    player_details: [BLUE_PLAYER, RED_PLAYER]
  };
}

function makeResponse(openid: string, detail: BattleDetailData = makeDetail()): GetBattleDetailResponse {
  return { openid, battle_detail: detail };
}

/** 掌盟源：没有顶层 openid，team_details[0] 恒为 my_team */
function makeMlolDetail(): BattleDetailData {
  return {
    ...makeDetail(),
    team_details: [makeTeam("100", "Win"), makeTeam("200", "Fail")],
    player_details: [
      makePlayer("mlol-my-1", "100", 22, "掌盟我方一"),
      makePlayer("mlol-my-2", "100", 23, "掌盟我方二"),
      makePlayer("mlol-opp-1", "200", 35, "掌盟对方一")
    ]
  };
}

interface MountProps {
  area?: string;
  accountType?: string;
  id?: string;
  gameId?: string | null;
  queueId?: number | string;
}

async function mountDetail(overrides: MountProps = {}) {
  const wrapper = mount(BattleDetailView, {
    props: {
      area: "1",
      accountType: "2",
      id: "viewer-openid",
      gameId: "g1",
      ...overrides
    },
    global: { stubs: { BattleDetailPlayer: PlayerStub, GameIcon: IconStub } }
  });
  await flushPromises();
  return wrapper;
}

function selfFlags(wrapper: Awaited<ReturnType<typeof mountDetail>>): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (const row of wrapper.findAll(".player-stub")) {
    flags[String(row.attributes("data-openid"))] = row.attributes("data-self");
  }
  return flags;
}

beforeEach(() => {
  getBattleDetailMock.mockReset();
  getSummonerInfoMock.mockReset();
  getSummonerInfoMock.mockRejectedValue(new Error("需要登录"));
  fetchMlolMock.mockReset();
  fetchMlolMock.mockRejectedValue(new ApiError("MLOL_EMPTY", "GetBattleDetail(mlol)", "掌盟详情无数据"));
});

describe("BattleDetail 摘要身份一致", () => {
  it("顶层 openid 指向 team 200 时摘要显示失败，并取该玩家的英雄与昵称", async () => {
    getBattleDetailMock.mockResolvedValue(makeResponse("openid-red"));

    const wrapper = await mountDetail();

    const result = wrapper.find(".detail-summary-result");
    expect(result.text()).toBe("失败");
    expect(result.classes()).toContain("detail-summary-result");
    expect(result.classes()).toContain("detail-summary-result--lose");
    expect(wrapper.find(".detail-summary-name").text()).toBe("红方玩家");
    expect(wrapper.find(".icon-stub").attributes("data-id")).toBe("103");
    // 昵称只由 .detail-summary-name 展示一次，meta 里不再重复
    expect(wrapper.findAll(".detail-summary-name")).toHaveLength(1);
    expect(wrapper.find(".detail-summary-meta").text()).not.toContain("红方玩家");
    expect(wrapper.find(".detail-summary-meta").text()).toContain("单双排");
    // 高亮与摘要同源：只有被查看玩家是 self
    expect(selfFlags(wrapper)).toEqual({ "openid-blue": "0", "openid-red": "1" });
  });

  it("顶层 openid 指向 team 100 时摘要显示胜利，并取该玩家的英雄与昵称", async () => {
    getBattleDetailMock.mockResolvedValue(makeResponse("openid-blue"));

    const wrapper = await mountDetail();

    const result = wrapper.find(".detail-summary-result");
    expect(result.text()).toBe("胜利");
    expect(result.classes()).toContain("detail-summary-result--win");
    expect(wrapper.find(".detail-summary-name").text()).toBe("蓝方玩家");
    expect(wrapper.find(".icon-stub").attributes("data-id")).toBe("57");
    expect(selfFlags(wrapper)).toEqual({ "openid-blue": "1", "openid-red": "0" });
  });

  it("掌盟回退源没有 openid 时保留整场详情，但不显示个人摘要（不猜队友）", async () => {
    getBattleDetailMock.mockRejectedValue(new ApiError("8000102", "GetBattleDetail", "登录状态已失效"));
    fetchMlolMock.mockResolvedValue(makeMlolDetail());

    const wrapper = await mountDetail({ accountType: "1" });

    expect(wrapper.find(".state-text--error").exists()).toBe(false);
    // 十人详情仍然完整渲染
    expect(wrapper.findAll(".player-stub")).toHaveLength(3);
    // 没有可靠身份对应关系 → 不显示昵称/英雄/胜负，只保留场次信息
    expect(wrapper.find(".detail-summary-name").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-result").exists()).toBe(false);
    expect(wrapper.find(".detail-summary .icon-stub").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-meta").text()).toContain("单双排");
    // 掌盟源没有 wegame openid：不可高亮/跳转
    expect(selfFlags(wrapper)).toEqual({ "mlol-my-1": "0", "mlol-my-2": "0", "mlol-opp-1": "0" });
  });

  it("掌盟源从搜索页进入（accountType=2、id 为 wegame openid）同样不猜个人摘要", async () => {
    getBattleDetailMock.mockRejectedValue(new ApiError("8000102", "GetBattleDetail", "登录状态已失效"));
    fetchMlolMock.mockResolvedValue(makeMlolDetail());

    const wrapper = await mountDetail({ accountType: "2", id: "wegame-openid-viewer" });

    expect(wrapper.find(".state-text--error").exists()).toBe(false);
    expect(wrapper.findAll(".player-stub")).toHaveLength(3);
    expect(wrapper.find(".detail-summary-name").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-result").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-meta").text()).toContain("单双排");
  });

  it("详情带顶层 openid 但匹配不到任何玩家时，只保留场次信息", async () => {
    getBattleDetailMock.mockResolvedValue(makeResponse("openid-unknown"));

    const wrapper = await mountDetail();

    expect(wrapper.findAll(".player-stub")).toHaveLength(2);
    expect(wrapper.find(".detail-summary-name").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-result").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-meta").text()).toContain("单双排");
  });

  it("详情加载失败时显示错误文案与重试按钮，重试成功后恢复摘要", async () => {
    getBattleDetailMock.mockRejectedValueOnce(new ApiError("8000102", "GetBattleDetail", "登录状态已失效"));

    const wrapper = await mountDetail();

    expect(wrapper.find(".detail-summary").exists()).toBe(false);
    expect(wrapper.text()).toContain("登录状态已失效");
    const retry = wrapper.find("button.link-button");
    expect(retry.text()).toBe("重试");

    getBattleDetailMock.mockResolvedValueOnce(makeResponse("openid-blue"));
    await retry.trigger("click");
    await flushPromises();

    expect(wrapper.find(".state-text--error").exists()).toBe(false);
    expect(wrapper.find(".detail-summary-name").text()).toBe("蓝方玩家");
  });

  it("海克斯比赛不再单独占一个页签（强化名走行内图标悬浮）", async () => {
    getBattleDetailMock.mockResolvedValue(makeResponse("openid-blue"));
    const wrapper = await mountDetail({ queueId: 2400 });

    const labels = wrapper.findAll(".mode-button").map((tab) => tab.text());
    expect(labels).toEqual(["概要", "伤害", "技能"]);
    expect(wrapper.find(".mode-button.active").text()).toBe("概要");
    expect(wrapper.text()).not.toContain("本场无强化记录");
  });
});
