// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import runes from "../src/data/runes.json";
import augments from "../src/data/kiwi-augments.json";

const gmGet = vi.hoisted(() => vi.fn());
vi.mock("../src/api/transport", () => ({ gmGet }));

beforeEach(() => { vi.resetModules(); gmGet.mockReset(); });

describe("静态名称与图标", () => {
  it("两个消费者共享英雄名请求，异步加载完成后名称计算自动更新", async () => {
    const { computed } = await import("vue");
    const { championName, ensureChampionNames } = await import("../src/api/staticData");
    let resolve!: (text: string) => void;
    gmGet.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const name = computed(() => championName(1));
    expect(name.value).toBe("");
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
    expect(championName(1)).toBe("");
    await ensureChampionNames();
    expect(championName(1)).toBe("安妮");
  });

  it("紧凑图标记录恢复为完整地址，已有绝对地址保持不变", async () => {
    const { getRuneInfo, runeIconUrl } = await import("../src/api/staticData");
    const base = "https://game.gtimg.cn/images/lol/act/img/rune/";
    for (const [id, entry] of Object.entries(runes)) expect(getRuneInfo(id)?.icon).toBe(base + entry.icon);
    for (const entry of Object.values(augments)) expect(runeIconUrl(entry.icon)).toBe(base + entry.icon);
    expect(runeIconUrl("https://example.invalid/icon.png")).toBe("https://example.invalid/icon.png");
  });
});
