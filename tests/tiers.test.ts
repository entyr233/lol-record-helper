import { describe, expect, it } from "vitest";
import { tierLabel, tierName, tierOrder } from "../src/const/tiers";

describe("赛季段位编码（LOLKeywords + 现任前端 A/F 表）", () => {
  it("tier 数字 -> 名称", () => {
    expect(tierName(0)).toBe("最强王者");
    expect(tierName(1)).toBe("钻石");
    expect(tierName(9)).toBe("翡翠");
    expect(tierName(6)).toBe("超凡大师");
    expect(tierName(7)).toBe("傲世宗师");
    expect(tierName(8)).toBe("黑铁");
  });

  it("小分区：王者/大师/宗师无分区，其余带 Ⅰ-Ⅴ", () => {
    expect(tierLabel(1, 0)).toBe("钻石Ⅰ");
    expect(tierLabel(1, 3)).toBe("钻石Ⅳ");
    expect(tierLabel(2, 2)).toBe("铂金Ⅲ");
    expect(tierLabel(0, 0)).toBe("最强王者");
    expect(tierLabel(6, 1)).toBe("超凡大师");
  });

  it("255/未知 -> 未定级", () => {
    expect(tierLabel(255)).toBe("未定级");
    expect(tierName(undefined)).toBe("未定级");
    expect(tierOrder(255)).toBe(255);
  });

  it("排序权重：王者 < 宗师 < 大师 < 钻石 < 翡翠 < 铂金", () => {
    expect(tierOrder(0)).toBeLessThan(tierOrder(7));
    expect(tierOrder(7)).toBeLessThan(tierOrder(6));
    expect(tierOrder(6)).toBeLessThan(tierOrder(1));
    expect(tierOrder(1)).toBeLessThan(tierOrder(9));
    expect(tierOrder(9)).toBeLessThan(tierOrder(2));
  });
});
