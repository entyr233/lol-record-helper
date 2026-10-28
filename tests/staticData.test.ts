// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import runes from "../src/data/runes.json";
import augments from "../src/data/kiwi-augments.json";

const gmGet = vi.hoisted(() => vi.fn());
vi.mock("../src/api/transport", () => ({ gmGet }));

const saved = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  gmGet.mockReset();
  saved.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value)
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("静态名称与图标", () => {
  it("两个消费者共享英雄名请求，异步加载完成后名称计算自动更新", async () => {
    const { computed } = await import("vue");
    const { championName, ensureChampionNames } = await import("../src/api/staticData");
    let resolve!: (text: string) => void;
    gmGet.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const name = computed(() => championName(1));
    expect(name.value).toBe("黑暗之女");
    const first = ensureChampionNames();
    const second = ensureChampionNames();
    expect(gmGet).toHaveBeenCalledTimes(1);
    resolve('var heroList = [{"heroId":"1","name":"安妮"}];');
    await Promise.all([first, second]);
    expect(name.value).toBe("安妮");
    await ensureChampionNames();
    expect(gmGet).toHaveBeenCalledTimes(1);
  });

  it("英雄名请求失败后可重试，不永久缓存失败", async () => {
    const { championName, ensureChampionNames } = await import("../src/api/staticData");
    gmGet.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce('[{"heroId":1,"name":"安妮"}]');
    await ensureChampionNames();
    expect(championName(1)).toBe("黑暗之女");
    await ensureChampionNames();
    expect(championName(1)).toBe("安妮");
  });

  it("重新打开页面复用英雄名缓存，过期时先显示缓存再更新同一个存储条目", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    gmGet.mockResolvedValueOnce('[{"heroId":1,"name":"安妮"}]');
    await (await import("../src/api/staticData")).ensureChampionNames();
    vi.resetModules();
    const fresh = await import("../src/api/staticData");
    await fresh.ensureChampionNames();
    expect(fresh.championName(1)).toBe("安妮");
    expect(gmGet).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 24 * 60 * 60 * 1000);
    vi.resetModules();
    const stale = await import("../src/api/staticData");
    let resolve!: (text: string) => void;
    gmGet.mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
    const refreshing = stale.ensureChampionNames();
    expect(stale.championName(1)).toBe("安妮");
    resolve('[{"heroId":1,"name":"安妮"},{"heroId":2,"name":"奥拉夫"}]');
    await refreshing;
    expect(stale.championName(2)).toBe("奥拉夫");
    expect(saved.size).toBe(1);
    expect(gmGet).toHaveBeenCalledTimes(2);
  });

  it("过期英雄名刷新失败后保留名称，后续调用仍可重试", async () => {
    saved.set("lol_tft:champion-names-v1", JSON.stringify({ savedAt: Date.now() - 24 * 60 * 60 * 1000,
      entries: [[1, "安妮"]] }));
    const { championName, ensureChampionNames } = await import("../src/api/staticData");
    gmGet.mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce('[{"heroId":1,"name":"安妮"},{"heroId":2,"name":"奥拉夫"}]');
    await ensureChampionNames();
    expect(championName(1)).toBe("安妮");
    await ensureChampionNames();
    expect(championName(2)).toBe("奥拉夫");
    expect(championName(9999)).toBe("");
    expect(gmGet).toHaveBeenCalledTimes(2);
  });

  it("并发版本查询只发一次请求，失败后仍可重试", async () => {
    const { ddragonVersion, ensureDdragonVersion } = await import("../src/api/staticData");
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await ensureDdragonVersion();
    let resolve!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const first = ensureDdragonVersion();
    const second = ensureDdragonVersion();
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolve({ ok: true, json: async () => ["16.21.1"] });
    await Promise.all([first, second]);
    await ensureDdragonVersion();
    expect(ddragonVersion.value).toBe("16.21.1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("紧凑图标记录恢复为完整地址，已有绝对地址保持不变", async () => {
    const { getRuneInfo, runeIconUrl } = await import("../src/api/staticData");
    const base = "https://game.gtimg.cn/images/lol/act/img/rune/";
    for (const [id, entry] of Object.entries(runes)) expect(getRuneInfo(id)?.icon).toBe(base + entry.icon);
    for (const entry of Object.values(augments)) expect(runeIconUrl(entry.icon)).toBe(base + entry.icon);
    expect(runeIconUrl("https://example.invalid/icon.png")).toBe("https://example.invalid/icon.png");
  });
});
