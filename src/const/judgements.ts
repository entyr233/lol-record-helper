/** 对局评价位掩码（battle_type） */
const JUDGEMENTS: Array<[number, string]> = [
  [1, "Carry局"],
  [2, "背锅局"],
  [4, "被虐局"],
  [8, "翻盘局"],
  [16, "福利局"],
  [32, "挂机局"],
  [64, "尽力局"],
  [128, "浪输局"],
  [256, "碾压局"],
  [512, "甩锅局"],
  [1024, "躺赢局"]
];

export function getJudgement(battleType: number | string | undefined, limit = 1): string[] {
  const mask = Number(battleType) || 0;
  if (!mask) return [];
  const result: string[] = [];
  for (const [bit, label] of JUDGEMENTS) {
    if (mask & bit) result.push(label);
    if (result.length >= limit) break;
  }
  return result;
}
