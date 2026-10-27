export type ResultClass = "win" | "lose" | "remake";

/** 判定对局结果所需的最小字段（BattleSummary / OverviewBattle 都满足） */
export interface BattleResultLike {
  win?: string;
  was_early_surrender?: number | boolean | string | null;
}

export function getResultLabel(win: string | undefined): string {
  if (win === "Win" || win === "LeaverWin") return "胜利";
  if (win === "Fail" || win === "LeaverFail") return "失败";
  return win || "";
}

export function getResultClass(win: string | undefined): ResultClass {
  if (win === "Win" || win === "LeaverWin") return "win";
  if (win === "Fail" || win === "LeaverFail") return "lose";
  return "remake";
}

/** 是否重开：was_early_surrender 为 1 / true / "1"（重开优先于 win 字段） */
function isRemakeBattle(b: BattleResultLike): boolean {
  const early = b.was_early_surrender;
  return early === true || Number(early) === 1;
}

/**
 * 统一三分类口径：重开优先，其余沿用 win 字段判定。
 * 列表（BattleListItem）与总览（RecentStats）必须共用这一份判定，避免“列表胜、总览负”。
 */
export function classifyBattle(b: BattleResultLike): ResultClass {
  if (isRemakeBattle(b)) return "remake";
  return getResultClass(b.win);
}

/** 统一结果文案：重开单列；其余沿用旧文案（未知值原样返回，保持既有行为） */
export function battleResultLabel(b: BattleResultLike): string {
  if (isRemakeBattle(b)) return "重开";
  return getResultLabel(b.win);
}
