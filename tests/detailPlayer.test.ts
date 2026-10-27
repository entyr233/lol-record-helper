import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import BattleDetailPlayer from "../src/components/BattleDetailPlayer.vue";
import type { PlayerDetail } from "../src/api/types";

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

/** 伤害条 stub：暴露 title 便于断言「悬浮说明」 */
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
    return () => h("div", { class: "hist-stub", "data-title": props.title });
  }
});

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

const PLAYER = makePlayer();

interface MountProps {
  mode?: "概要" | "技能" | "伤害";
  sameTeam?: boolean | null;
}

function mountPlayer(overrides: MountProps = {}) {
  return mount(BattleDetailPlayer, {
    props: {
      player: PLAYER,
      players: [PLAYER],
      mode: "概要",
      ...overrides
    },
    global: { stubs: { GameIcon: IconStub, Histogram: HistogramStub } }
  });
}

describe("BattleDetailPlayer 同队/对手徽标", () => {
  it("sameTeam=true 时在标签区显示「同队」", () => {
    const wrapper = mountPlayer({ sameTeam: true });

    const tag = wrapper.find(".dp-tags .tag--same");
    expect(tag.exists()).toBe(true);
    expect(tag.text()).toBe("同队");
    expect(wrapper.find(".tag--opp").exists()).toBe(false);
  });

  it("sameTeam=false 时在标签区显示「对手」", () => {
    const wrapper = mountPlayer({ sameTeam: false });

    const tag = wrapper.find(".dp-tags .tag--opp");
    expect(tag.exists()).toBe(true);
    expect(tag.text()).toBe("对手");
    expect(wrapper.find(".tag--same").exists()).toBe(false);
  });

  it("sameTeam=null（身份未知）时两种徽标都不显示", () => {
    const wrapper = mountPlayer({ sameTeam: null });

    expect(wrapper.find(".tag--same").exists()).toBe(false);
    expect(wrapper.find(".tag--opp").exists()).toBe(false);
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
