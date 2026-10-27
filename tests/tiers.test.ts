import { describe, expect, it } from "vitest";
import { tierName, tierOrder } from "../src/const/tiers";

describe("tierName / tierOrder", () => {
  it("现任前端的段位数字映射", () => {
    expect(tierName(0)).toBe("王者");
    expect(tierName(5)).toBe("宗师");
    expect(tierName(6)).toBe("大师");
    expect(tierName(15)).toBe("翡翠");
    expect(tierName(20)).toBe("铂金");
    expect(tierName(80)).toBe("黑铁");
  });

  it("未知/255 归为未定级，数字越小段位越高", () => {
    expect(tierName(255)).toBe("未定级");
    expect(tierName(undefined)).toBe("未定级");
    expect(tierOrder(0)).toBeLessThan(tierOrder(6));
    expect(tierOrder(undefined)).toBe(255);
  });
});
