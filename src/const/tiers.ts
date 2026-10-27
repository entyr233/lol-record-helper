/** 段位数字 -> 名称（来源：现任 LOL 助手排行页的 tier 表） */
const TIER_NAMES: Record<number, string> = {
  0: "王者",
  5: "宗师",
  6: "大师",
  10: "钻石",
  15: "翡翠",
  20: "铂金",
  30: "黄金",
  40: "白银",
  50: "黄铜",
  80: "黑铁"
};

export const UNRANKED_TIER = 255;

export function tierName(tier: number | string | undefined | null): string {
  const key = Number(tier);
  if (!Number.isFinite(key)) return "未定级";
  return TIER_NAMES[key] ?? "未定级";
}

/** 段位数字越小段位越高 */
export function tierOrder(tier: number | string | undefined | null): number {
  const key = Number(tier);
  return Number.isFinite(key) ? key : UNRANKED_TIER;
}
