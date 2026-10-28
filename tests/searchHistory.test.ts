import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); localStorage.clear(); });

describe("共享搜索历史", () => {
  it("兼容旧键并过滤非法条目，新增与删除在两个消费者之间同步", async () => {
    localStorage.setItem("lol-tft-search-history", JSON.stringify([" 玩家甲 ", null, "玩家甲", 1, "玩家乙"]));
    const { useSearchHistory } = await import("../src/composables/useSearchHistory");
    const first = useSearchHistory();
    const second = useSearchHistory();
    expect(first.historyNames.value).toEqual(["玩家甲", "玩家乙"]);
    first.remember("玩家丙");
    expect(second.historyNames.value).toEqual(["玩家丙", "玩家甲", "玩家乙"]);
    second.remove("玩家甲");
    expect(first.historyNames.value).toEqual(["玩家丙", "玩家乙"]);
    expect(JSON.parse(localStorage.getItem("lol_tft:search-history")!)).toEqual(["玩家丙", "玩家乙"]);
    first.clear();
    expect(second.historyNames.value).toEqual([]);
    vi.resetModules();
    const reloaded = await import("../src/composables/useSearchHistory");
    expect(reloaded.useSearchHistory().historyNames.value).toEqual([]);
  });

  it("最多保留十条，重复搜索移到首位，其他标签页更新可以同步", async () => {
    const { useSearchHistory } = await import("../src/composables/useSearchHistory");
    const history = useSearchHistory();
    for (let i = 0; i < 12; i += 1) history.remember("玩家" + i);
    history.remember("玩家5");
    expect(history.historyNames.value).toHaveLength(10);
    expect(history.historyNames.value[0]).toBe("玩家5");
    localStorage.setItem("lol_tft:search-history", '["其他标签页"]');
    window.dispatchEvent(new StorageEvent("storage", { key: "lol_tft:search-history" }));
    expect(history.historyNames.value).toEqual(["其他标签页"]);
  });
});
