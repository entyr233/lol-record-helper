export type ResultClass = "win" | "lose" | "remake";

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
