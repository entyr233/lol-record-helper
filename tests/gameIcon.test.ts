import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import GameIcon from "../src/components/GameIcon.vue";
import { getChampionSpells } from "../src/api/staticData";
import type { ChampionSpell } from "../src/api/types";

vi.mock("../src/api/staticData", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/api/staticData")>(), getChampionSpells: vi.fn()
}));

describe("GameIcon 悬停标题", () => {
  it("切换英雄后迟到的旧技能响应不能覆盖新图标，改成装备后也不能回写", async () => {
    let resolveOld!: (spells: ChampionSpell[]) => void;
    let resolveNew!: (spells: ChampionSpell[]) => void;
    vi.mocked(getChampionSpells)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    const wrapper = mount(GameIcon, { props: { kind: "champion-spell", id: "q", championId: 1 } });
    await wrapper.setProps({ championId: 2 });
    resolveNew([{ spellKey: "q", name: "新技能", description: "", abilityIconPath: "https://example.invalid/new.png" }]);
    await flushPromises();
    resolveOld([{ spellKey: "q", name: "旧技能", description: "", abilityIconPath: "https://example.invalid/old.png" }]);
    await flushPromises();
    expect(wrapper.get("img").attributes("src")).toContain("new.png");
    let resolveLate!: (spells: ChampionSpell[]) => void;
    vi.mocked(getChampionSpells).mockReturnValueOnce(new Promise((resolve) => { resolveLate = resolve; }));
    await wrapper.setProps({ championId: 3 });
    await wrapper.setProps({ kind: "item", id: 1001 });
    resolveLate([{ spellKey: "q", name: "迟到技能", description: "", abilityIconPath: "https://example.invalid/late.png" }]);
    await flushPromises();
    expect(wrapper.get("img").attributes("title")).toBe("鞋子");
    expect(wrapper.get("img").attributes("src")).not.toContain("late.png");
    wrapper.unmount();
  });

  it("kind=url 时使用显式传入的 title（海克斯强化名称）", () => {
    const wrapper = mount(GameIcon, {
      props: { kind: "url", id: "augment", src: "https://example.invalid/augment.png", title: "海克斯：强化名称" }
    });
    const img = wrapper.get("img");
    expect(img.attributes("title")).toBe("海克斯：强化名称");
    expect(img.attributes("alt")).toBe("海克斯：强化名称");
  });

  it("显式 title 优先于装备自带名称", () => {
    const wrapper = mount(GameIcon, { props: { kind: "item", id: 1001, title: "自定义标题" } });
    expect(wrapper.get("img").attributes("title")).toBe("自定义标题");
  });

  it("图标加载失败时换成占位图并提示「图标加载失败」", async () => {
    const wrapper = mount(GameIcon, { props: { kind: "champion", id: 1 } });
    const img = wrapper.get("img");
    await img.trigger("error");

    expect(img.attributes("src")).toContain("data:image/svg+xml");
    expect(img.attributes("title")).toBe("图标加载失败");
  });

  it("没有显式 title 时仍回退到装备名称", () => {
    const wrapper = mount(GameIcon, { props: { kind: "item", id: 1001 } });
    expect(wrapper.get("img").attributes("title")).toBe("鞋子");
  });
});
