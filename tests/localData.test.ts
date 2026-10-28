import { beforeEach, describe, expect, it } from "vitest";
import {
  formatBytes,
  listLocalDataCategories,
  removeAllLocalData,
  removeLocalDataCategory
} from "../src/utils/localData";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("localData 本机数据清单", () => {
  it("按类别统计精确键、版本前缀键和会话键", () => {
    localStorage.setItem("lol-tft-favorites", JSON.stringify([{ id: "1" }]));
    localStorage.setItem("lol_tft:recent-players", "[]");
    localStorage.setItem("lol_tft:search-history", JSON.stringify(["甲"]));
    localStorage.setItem("lol_tft:aramgg-overview-v2", "{}");
    localStorage.setItem("lol_tft:aramgg-champion-v2:16.21:17", "{}");
    localStorage.setItem("lol_tft:aramgg-champion-v2:16.20:17", "{}");
    localStorage.setItem("lol_tft:ddragon-version", "{}");
    localStorage.setItem("lol_tft:last-area", "1");
    localStorage.setItem("unrelated-key", "keep");
    sessionStorage.setItem("lol_tft:aramgg-api-key-session", "session-key");

    const categories = listLocalDataCategories();
    const byId = new Map(categories.map((category) => [category.id, category]));
    expect(byId.get("favorites")!.keys).toEqual(["lol-tft-favorites"]);
    expect(byId.get("recent")!.bytes).toBeGreaterThan(0);
    expect(byId.get("search")!.keys).toEqual(["lol_tft:search-history"]);
    expect(byId.get("aramgg-cache")!.keys).toHaveLength(3);
    expect(byId.get("aramgg-key")!.keys).toContain("lol_tft:aramgg-api-key-session");
    expect(byId.get("static")!.keys).toEqual(["lol_tft:ddragon-version"]);
    expect(byId.get("preferences")!.keys).toEqual(["lol_tft:last-area"]);
    expect(byId.get("favorites")!.bytes).toBeGreaterThan(0);
  });

  it("清理单个类别只移除该类别，不影响其它数据", () => {
    localStorage.setItem("lol_tft:aramgg-overview-v2", "{}");
    localStorage.setItem("lol_tft:aramgg-champion-v2:16.21:17", "{}");
    localStorage.setItem("lol_tft:search-history", "[]");
    localStorage.setItem("unrelated-key", "keep");

    removeLocalDataCategory("aramgg-cache");
    expect(localStorage.getItem("lol_tft:aramgg-overview-v2")).toBeNull();
    expect(localStorage.getItem("lol_tft:aramgg-champion-v2:16.21:17")).toBeNull();
    expect(localStorage.getItem("lol_tft:search-history")).toBe("[]");
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
  });

  it("清空全部只移除脚本管理的键，并支持会话键", () => {
    localStorage.setItem("lol_tft:recent-players", "[]");
    localStorage.setItem("lol_tft:last-area", "1");
    sessionStorage.setItem("lol_tft:aramgg-api-key-session", "session-key");
    localStorage.setItem("unrelated-key", "keep");

    removeAllLocalData();
    expect(localStorage.getItem("lol_tft:recent-players")).toBeNull();
    expect(localStorage.getItem("lol_tft:last-area")).toBeNull();
    expect(sessionStorage.getItem("lol_tft:aramgg-api-key-session")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
  });

  it("formatBytes 覆盖 B/KB/MB 和非法值", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 2)).toBe("2.0 MB");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});
