/**
 * 列表与总览共用的「模式」筛选定义。
 * 两边使用同一份 id/文案，总览与对局列表的模式状态才能真正联动。
 */
import type { BattleSummary } from "../api/types";

export type ModeFilter = number | "all" | "mvp";

export interface ModeFilterOption {
  key: ModeFilter;
  label: string;
}

/** 顺序与旧版列表标签一致，总览额外使用其中的队列项 */
export const MODE_FILTER_OPTIONS: ModeFilterOption[] = [
  { key: "all", label: "全部" },
  { key: "mvp", label: "MVP/SVP" },
  { key: 430, label: "匹配" },
  { key: 450, label: "大乱斗" },
  { key: 420, label: "单双排" },
  { key: 440, label: "灵活组排" },
  { key: 2400, label: "海克斯大乱斗" }
];

export function matchesBattleMode(battle: BattleSummary, mode: ModeFilter): boolean {
  if (mode === "all") return true;
  if (mode === "mvp") return Number(battle.was_mvp) === 1 || Number(battle.was_svp) === 1;
  return Number(battle.game_queue_id) === Number(mode);
}
