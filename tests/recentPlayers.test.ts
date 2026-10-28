import { beforeEach, describe, expect, it, vi } from "vitest";

const RECENT_KEY = "lol-tft-recent-players";

async function loadModule() {
  vi.resetModules();
  return await import("../src/composables/useRecentPlayers");
}

beforeEach(() => {
  localStorage.clear();
});

describe("useRecentPlayers 最近查看", () => {
  it("记录打开过的玩家：新的在前、同一玩家去重、最多 10 条", async () => {
    const { MAX_RECENT_PLAYERS, useRecentPlayers } = await loadModule();
    const { recentPlayers, remember } = useRecentPlayers();

    for (let index = 0; index < 12; index += 1) {
      remember({ name: "玩家" + index, area: 1, accountType: "2", id: String(index) });
    }
    expect(MAX_RECENT_PLAYERS).toBe(10);
    expect(recentPlayers.value).toHaveLength(10);
    expect(recentPlayers.value[0]!.id).toBe("11");
    expect(recentPlayers.value[9]!.id).toBe("2");

    remember({ name: "玩家5改名", area: 1, accountType: "2", id: "5" });
    expect(recentPlayers.value[0]).toMatchObject({ id: "5", name: "玩家5改名" });
    expect(recentPlayers.value.filter((entry) => entry.id === "5")).toHaveLength(1);
  });

  it("区分大区/账号类型，并持久化到 localStorage", async () => {
    const { useRecentPlayers } = await loadModule();
    const { recentPlayers, remember, remove, clear } = useRecentPlayers();
    remember({ name: "甲", area: 1, accountType: "2", id: "10" });
    remember({ name: "乙", area: 1, accountType: "1", id: "10" });
    remember({ name: "丙", area: 2, accountType: "2", id: "10" });
    expect(recentPlayers.value).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) as string)).toHaveLength(3);

    remove({ area: 1, accountType: "2", id: "10" });
    expect(recentPlayers.value.map((entry) => entry.name)).toEqual(["丙", "乙"]);

    clear();
    expect(recentPlayers.value).toEqual([]);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) as string)).toEqual([]);
  });

  it("读取非法数据时容错为空，其他标签页 storage 事件可同步", async () => {
    localStorage.setItem(RECENT_KEY, "{oops");
    let module = await loadModule();
    expect(module.useRecentPlayers().recentPlayers.value).toEqual([]);

    localStorage.setItem(RECENT_KEY, JSON.stringify([null, 42, { name: "无 id" }]));
    module = await loadModule();
    expect(module.useRecentPlayers().recentPlayers.value).toEqual([]);

    const { recentPlayers } = module.useRecentPlayers();
    window.dispatchEvent(new StorageEvent("storage", {
      key: RECENT_KEY,
      newValue: JSON.stringify([{ name: "远端", area: 3, accountType: "1", id: "77", viewedAt: 123 }])
    }));
    expect(recentPlayers.value).toEqual([
      { name: "远端", area: 3, accountType: "1", id: "77", viewedAt: 123 }
    ]);
  });
});
