/**
 * 赛季段位编码 -> 名称。
 * 来源：LOLKeywords.js 的 tier 数组 + 现任助手前端的排序表 A 与分区集合 F。
 * 注意：这不是排行榜页的筛选键（那是另一套数字）。
 */
const TIER_NAMES: Record<number, string> = {
  0: "最强王者",
  1: "钻石",
  2: "铂金",
  3: "黄金",
  4: "白银",
  5: "青铜",
  6: "超凡大师",
  7: "傲世宗师",
  8: "黑铁",
  9: "翡翠"
};

/** 这些段位没有 Ⅰ/Ⅱ/Ⅲ 小分区（未定级/王者/超凡大师/傲世宗师） */
const NO_DIVISION = new Set([255, 0, 6, 7]);

const LEVELS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"];

/** 段位排序权重（越小越高）：王者0 宗师1 大师2 钻石3 翡翠4 铂金5 黄金6 白银7 青铜8 黑铁9 */
const TIER_ORDER: Record<number, number> = { 0: 0, 7: 1, 6: 2, 1: 3, 9: 4, 2: 5, 3: 6, 4: 7, 5: 8, 8: 9, 255: 255 };

export const UNRANKED_TIER = 255;

export function tierName(tier: number | string | undefined | null): string {
  const key = Number(tier);
  if (!Number.isFinite(key) || key === UNRANKED_TIER) return "未定级";
  return TIER_NAMES[key] ?? "未定级";
}

export function tierOrder(tier: number | string | undefined | null): number {
  const key = Number(tier);
  if (!Number.isFinite(key)) return UNRANKED_TIER;
  return TIER_ORDER[key] ?? UNRANKED_TIER;
}

/** 完整段位标签：钻石 + Ⅰ（有分区时带小分区） */
export function tierLabel(tier: number | string | undefined | null, queue?: number | string | null): string {
  const key = Number(tier);
  if (!Number.isFinite(key) || key === UNRANKED_TIER) return "未定级";
  const name = TIER_NAMES[key];
  if (!name) return "未定级";
  if (NO_DIVISION.has(key)) return name;
  const div = Number(queue);
  const suffix = Number.isFinite(div) && div >= 0 && div < LEVELS.length ? LEVELS[div] : "";
  return name + suffix;
}
