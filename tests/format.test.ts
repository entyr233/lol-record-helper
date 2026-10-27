import { describe, expect, it } from "vitest";
import { barPercent, formatBattleDate, formatDuration, formatGameScore, kdaRatio } from "../src/utils/format";

describe("formatBattleDate", () => {
  it("秒与毫秒时间戳显示同一本地日期，月日补零", () => {
    const timestamp = new Date(2026, 0, 5, 12).getTime();
    expect(formatBattleDate(timestamp)).toBe("2026-01-05");
    expect(formatBattleDate(String(timestamp / 1000))).toBe("2026-01-05");
  });

  it("缺失、非数值与非正时间戳不显示日期", () => {
    for (const value of [undefined, null, "", "invalid", Number.NaN, Infinity, 0, -1]) {
      expect(formatBattleDate(value)).toBe("");
    }
  });
});

describe("formatDuration", () => {
  it("0 秒返回 0秒（旧实现返回空串）", () => {
    expect(formatDuration(0)).toBe("0秒");
  });

  it("拆成时/分/秒", () => {
    expect(formatDuration(59)).toBe("59秒");
    expect(formatDuration(3661)).toBe("1小时 1分 1秒");
    expect(formatDuration(600)).toBe("10分");
  });

  it("非法输入返回空串", () => {
    expect(formatDuration(Number.NaN)).toBe("");
    expect(formatDuration(-1)).toBe("");
    expect(formatDuration(undefined)).toBe("");
  });
});

describe("barPercent", () => {
  it("max 为 0 / 非有限值时不产生 NaN 或 Infinity", () => {
    expect(barPercent(100, 0)).toBe("0%");
    expect(barPercent(100, Number.NaN)).toBe("0%");
    expect(barPercent(0, 0)).toBe("0%");
  });

  it("正常比例并封顶 100%", () => {
    expect(barPercent(5, 10)).toBe("50.0%");
    expect(barPercent(20, 10)).toBe("100.0%");
  });
});

describe("formatGameScore / kdaRatio", () => {
  it("游戏评分换算", () => {
    expect(formatGameScore(12345)).toBe("1.2");
    expect(formatGameScore(0)).toBe("");
  });

  it("KDA 除零保护", () => {
    expect(kdaRatio(0, 0, 0)).toBe(0);
    expect(kdaRatio(3, 0, 6)).toBe(9);
    expect(kdaRatio(2, 2, 2)).toBe(2);
  });
});
