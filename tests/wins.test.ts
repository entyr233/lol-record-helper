// @vitest-environment node
import { describe, expect, it } from "vitest";
import { battleResultLabel, classifyBattle, getResultClass, getResultLabel } from "../src/const/wins";

describe("classifyBattle（统一三分类口径）", () => {
  it("Win / LeaverWin 判为 win", () => {
    expect(classifyBattle({ win: "Win" })).toBe("win");
    expect(classifyBattle({ win: "LeaverWin" })).toBe("win");
  });

  it("Fail / LeaverFail 判为 lose", () => {
    expect(classifyBattle({ win: "Fail" })).toBe("lose");
    expect(classifyBattle({ win: "LeaverFail" })).toBe("lose");
  });

  it("was_early_surrender=1 优先判为重开（即使 win 是 Win/Fail）", () => {
    expect(classifyBattle({ win: "Win", was_early_surrender: 1 })).toBe("remake");
    expect(classifyBattle({ win: "Fail", was_early_surrender: 1 })).toBe("remake");
    expect(classifyBattle({ win: "LeaverWin", was_early_surrender: 1 })).toBe("remake");
  });

  it("was_early_surrender 兼容 true / \"1\" / \"true\" 之外的字符串", () => {
    expect(classifyBattle({ win: "Fail", was_early_surrender: true })).toBe("remake");
    expect(classifyBattle({ win: "Fail", was_early_surrender: "1" })).toBe("remake");
    expect(classifyBattle({ win: "Win", was_early_surrender: 0 })).toBe("win");
    expect(classifyBattle({ win: "Win", was_early_surrender: null })).toBe("win");
  });

  it("未知 win 值沿用旧兜底（remake），不影响既有行为", () => {
    expect(classifyBattle({ win: "Unknown" })).toBe("remake");
    expect(classifyBattle({})).toBe("remake");
  });
});

describe("battleResultLabel（统一结果文案）", () => {
  it("胜/负沿用旧文案（含 Leaver 变体）", () => {
    expect(battleResultLabel({ win: "Win" })).toBe("胜利");
    expect(battleResultLabel({ win: "LeaverWin" })).toBe("胜利");
    expect(battleResultLabel({ win: "Fail" })).toBe("失败");
    expect(battleResultLabel({ win: "LeaverFail" })).toBe("失败");
  });

  it("重开优先显示“重开”", () => {
    expect(battleResultLabel({ win: "Win", was_early_surrender: 1 })).toBe("重开");
    expect(battleResultLabel({ win: "Fail", was_early_surrender: true })).toBe("重开");
    expect(battleResultLabel({ win: "Fail", was_early_surrender: "1" })).toBe("重开");
  });

  it("未知 win 值原样返回（保持旧行为）", () => {
    expect(battleResultLabel({ win: "Unknown" })).toBe("Unknown");
    expect(battleResultLabel({})).toBe("");
  });
});

describe("旧 API 未被破坏", () => {
  it("getResultClass / getResultLabel 行为不变", () => {
    expect(getResultClass("LeaverWin")).toBe("win");
    expect(getResultClass("LeaverFail")).toBe("lose");
    expect(getResultClass("Unknown")).toBe("remake");
    expect(getResultLabel("Win")).toBe("胜利");
    expect(getResultLabel("LeaverFail")).toBe("失败");
    expect(getResultLabel("Unknown")).toBe("Unknown");
  });
});
