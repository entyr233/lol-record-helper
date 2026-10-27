import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GameIcon from "../src/components/GameIcon.vue";

describe("GameIcon 悬停标题", () => {
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
