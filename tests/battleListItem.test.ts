import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BattleListItem from "../src/components/BattleListItem.vue";
import type { BattleSummary } from "../src/api/types";

function makeBattle(patch: Partial<BattleSummary> = {}): BattleSummary {
  return {
    game_id: "g1",
    game_start_time: "1700000000000",
    game_time_played: 1855,
    game_queue_id: 420,
    champion_id: 17,
    win: "Win",
    kills: 8,
    deaths: 2,
    assists: 10,
    ...patch
  };
}

describe("BattleListItem", () => {
  it("胜利对局显示胜利并带 win 类名", () => {
    const wrapper = mount(BattleListItem, { props: { battle: makeBattle(), index: 0 } });
    expect(wrapper.text()).toContain("胜利");
    expect(wrapper.text()).toContain("单双排");
    expect(wrapper.classes()).toContain("win");
  });

  it("失败对局显示失败", () => {
    const wrapper = mount(BattleListItem, { props: { battle: makeBattle({ win: "Fail" }), index: 1 } });
    expect(wrapper.text()).toContain("失败");
    expect(wrapper.classes()).toContain("lose");
    expect(wrapper.text()).toContain("#2");
  });

  it("重开对局优先显示重开", () => {
    const wrapper = mount(BattleListItem, { props: { battle: makeBattle({ was_early_surrender: 1 }), index: 2 } });
    expect(wrapper.text()).toContain("重开");
    expect(wrapper.classes()).toContain("remake");
  });

  it("game_level 快照显示对局时段位", () => {
    const wrapper = mount(BattleListItem, {
      props: {
        battle: makeBattle({ game_level: JSON.stringify({ tier: "1", league_points: "43", rank: "1" }) }),
        index: 3
      }
    });
    expect(wrapper.text()).toContain("钻石");
    expect(wrapper.text()).not.toContain("未定级");
  });

  it("对局评价标签（battle_type 位掩码）", () => {
    const wrapper = mount(BattleListItem, { props: { battle: makeBattle({ battle_type: 256 }), index: 4 } });
    expect(wrapper.text()).toContain("碾压局");
  });
});
