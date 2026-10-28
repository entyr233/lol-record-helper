import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import BattleDetailPlayer from "../src/components/BattleDetailPlayer.vue";
import type { PlayerDetail } from "../src/api/types";
import { summarizePlayers } from "../src/utils/battlePlayers";

/** 图标与柱状条全部 stub：只把关心的 prop 落到 DOM 上，避开图标/静态数据依赖 */
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

/** 伤害条 stub：暴露 title/value/text 便于断言「悬浮说明」与缺失处理 */
const HistogramStub = defineComponent({
  name: "Histogram",
  props: {
    value: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    color: { type: String, default: "" },
    text: { type: String, default: "" },
    highlight: { type: Boolean, default: false },
    title: { type: String, default: "" }
  },
  setup(props) {
    return () =>
      h("div", {
        class: "hist-stub",
        "data-title": props.title,
        "data-value": String(props.value ?? ""),
        "data-text": props.text
      });
  }
});

const STUBS = { GameIcon: IconStub, Histogram: HistogramStub };

function makePlayer(patch: Partial<PlayerDetail> = {}): PlayerDetail {
  return {
    openid: "openid-self",
    name: "示例玩家01",
    championId: 57,
    level: 11,
    teamId: "100",
    teamMadeSize: 1,
    championsKilled: 6,
    numDeaths: 8,
    assists: 10,
    gameScore: 10000,
    totalDamageToChampions: 12000,
    totalDamageTaken: 9000,
    magicDamageToChampions: 4000,
    physicalDamageToChampions: 7000,
    trueDemageToChampions: 1000,
    goldEarned: 10500,
    minionsKilled: 120,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    keystoneId: 0,
    perkSubStyle: 0,
    summonSpell1Id: 4,
    summonSpell2Id: 14,
    battleHonour: {},
    ...patch
  };
}

/** 模拟掌盟公开源：组队/经济/补刀/装备/符文/伤害都没有，且带 partial 标记 */
function makePartialPlayer(patch: Partial<PlayerDetail> = {}): PlayerDetail {
  return makePlayer({
    teamMadeSize: undefined,
    goldEarned: undefined,
    minionsKilled: undefined,
    item0: undefined, item1: undefined, item2: undefined, item3: undefined,
    item4: undefined, item5: undefined, item6: undefined,
    keystoneId: undefined,
    perkSubStyle: undefined,
    totalDamageToChampions: undefined,
    totalDamageTaken: undefined,
    magicDamageToChampions: undefined,
    physicalDamageToChampions: undefined,
    trueDemageToChampions: undefined,
    partial: true,
    ...patch
  });
}

const PLAYER = makePlayer();

interface MountProps {
  mode?: "概要" | "技能" | "伤害";
  partial?: boolean;
}

function mountPlayer(overrides: MountProps = {}) {
  return mount(BattleDetailPlayer, {
    props: {
      player: PLAYER,
      players: [PLAYER],
      mode: "概要",
      ...overrides
    },
    global: { stubs: STUBS }
  });
}

describe("BattleDetailPlayer 组队标签", () => {
  it("相同装备和空槽更新后仍按七个槽位展示", async () => {
    const player = makePlayer({ item0: 1001, item1: 1001, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0 });
    const wrapper = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要" }, global: { stubs: STUBS }
    });
    const ids = () => wrapper.findAll('.dp-items .icon-stub').map((icon) => icon.attributes("data-id"));
    expect(ids()).toEqual(["1001", "1001", "0", "0", "0", "0", "0"]);
    await wrapper.setProps({ player: { ...player, item0: 0, item2: 1001 } });
    expect(ids()).toEqual(["0", "1001", "1001", "0", "0", "0", "0"]);
    wrapper.unmount();
  });

  it("共享统计按全场计算伤害上限，按各队计算击杀与伤害，切换玩家后重新计算", async () => {
    const own = makePlayer({ teamId: "100", championsKilled: 3, assists: 2, totalDamageToChampions: 100 });
    const mate = makePlayer({ openid: "mate", teamId: "100", championsKilled: 7, totalDamageToChampions: 300 });
    const opponent = makePlayer({ openid: "opponent", teamId: "200", championsKilled: 1, totalDamageToChampions: 900 });
    const statistics = summarizePlayers([own, mate, opponent]);
    expect(statistics.teams.get("100")).toEqual({ kills: 10, damage: 400 });
    expect(statistics.teams.get("200")).toEqual({ kills: 1, damage: 900 });
    expect(statistics.maxDamage.totalDamageToChampions).toBe(900);
    const wrapper = mount(BattleDetailPlayer, {
      props: { player: own, players: [own, mate, opponent], statistics, mode: "概要" }, global: { stubs: STUBS }
    });
    expect(wrapper.text()).toContain("50%");
    expect(wrapper.text()).toContain("25%");
    const updated = { ...own, totalDamageToChampions: 300 };
    await wrapper.setProps({ player: updated, statistics: summarizePlayers([updated, mate, opponent]) });
    expect(wrapper.text()).toContain("50%");
    wrapper.unmount();
  });

  it("组队标签按队列类型区分：排位用双排，其他模式用双人开黑", () => {
    const player = makePlayer({ teamMadeSize: 2 });
    const ranked = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要", ranked: true },
      global: { stubs: STUBS }
    });
    const normal = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要", ranked: false },
      global: { stubs: STUBS }
    });

    expect(ranked.get(".tag--team").text()).toBe("双排");
    expect(normal.get(".tag--team").text()).toBe("双人开黑");
    ranked.unmount();
    normal.unmount();
  });

  it("组队人数缺失（undefined/null/0）时不显示组队徽标，不再显示「单人」", () => {
    for (const size of [undefined, null, 0] as const) {
      const player = makePlayer({ teamMadeSize: size });
      const wrapper = mount(BattleDetailPlayer, {
        props: { player, players: [player], mode: "概要" },
        global: { stubs: STUBS }
      });

      expect(wrapper.find(".tag--team").exists()).toBe(false);
      wrapper.unmount();
    }
  });
});

describe("BattleDetailPlayer 悬浮说明", () => {
  it("伤害模式的 4 个柱子分别带总/魔法/物理/真实伤害说明", () => {
    const wrapper = mountPlayer({ mode: "伤害" });

    const titles = wrapper.findAll(".hist-stub").map((bar) => bar.attributes("data-title"));
    expect(titles).toEqual(["对英雄总伤害", "魔法伤害", "物理伤害", "真实伤害"]);
  });

  it("概要模式的 KDA/伤害占比/补刀三列带说明", () => {
    const wrapper = mountPlayer();

    const titles = wrapper.findAll(".dp-stat").map((stat) => stat.attributes("title"));
    expect(titles).toEqual(["击杀/死亡/助攻", "伤害占团队比例", "补刀/经济"]);
  });
});

describe("BattleDetailPlayer 缺失字段（partial）", () => {
  it("经济/补刀缺失时显示「未提供」并带来源说明，不用 0 冒充", () => {
    const player = makePartialPlayer();
    const wrapper = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要", partial: true },
      global: { stubs: STUBS }
    });

    const stats = wrapper.findAll(".dp-stat");
    // 伤害占比、补刀/经济都缺失
    expect(stats[1]!.text()).toContain("未提供");
    expect(stats[2]!.text()).toContain("未提供");
    expect(stats[2]!.text()).not.toContain("经济 0");
    expect(stats[2]!.find(".dp-missing").attributes("title")).toBe("掌盟源未提供该字段");
  });

  it("装备全空且 partial 时显示「装备未提供」，符文缺失显示「符文未提供」", () => {
    const player = makePartialPlayer();
    const wrapper = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要", partial: true },
      global: { stubs: STUBS }
    });

    const items = wrapper.find(".dp-items .dp-missing");
    expect(items.text()).toBe("装备未提供");
    expect(items.attributes("title")).toBe("掌盟源未提供该字段");
    expect(wrapper.find(".dp-mini-col .dp-missing").text()).toBe("符文未提供");
    expect(wrapper.find(".dp-mini-col .dp-missing").attributes("title")).toBe("掌盟源未提供该字段");
  });

  it("未传 partial prop 时回退读取玩家自带的 partial 标记", () => {
    const player = makePartialPlayer();
    const wrapper = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要" },
      global: { stubs: STUBS }
    });

    expect(wrapper.find(".dp-items .dp-missing").exists()).toBe(true);
  });

  it("真实 0 值仍按 0 展示，不当作缺失", () => {
    const player = makePlayer({ goldEarned: 0, minionsKilled: 0, totalDamageToChampions: 0 });
    const wrapper = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "概要" },
      global: { stubs: STUBS }
    });

    const stats = wrapper.findAll(".dp-stat");
    expect(stats[1]!.text()).toContain("0%");
    expect(stats[2]!.text()).toContain("0");
    expect(wrapper.find(".dp-missing").exists()).toBe(false);
  });

  it("伤害字段缺失时柱子传 0 且悬浮说明为「未提供」", () => {
    const player = makePartialPlayer();
    const wrapper = mount(BattleDetailPlayer, {
      props: { player, players: [player], mode: "伤害", partial: true },
      global: { stubs: STUBS }
    });

    const bars = wrapper.findAll(".hist-stub");
    expect(bars.map((bar) => bar.attributes("data-value"))).toEqual(["0", "0", "0", "0"]);
    expect(bars.map((bar) => bar.attributes("data-title"))).toEqual(["未提供", "未提供", "未提供", "未提供"]);
    expect(bars.map((bar) => bar.attributes("data-text"))).toEqual(["", "", "", ""]);
  });
});
