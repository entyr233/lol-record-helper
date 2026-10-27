import { tierLabel, tierName, tierOrder, UNRANKED_TIER } from "../const/tiers";
import type { BattleSummary, RqOptions } from "./types";
import { lolBattleApi } from "./client";

export interface SeasonRankRow {
  sid: number;
  label: string;
  solo: string;
  soloPoint: number | string;
  flex: string;
  flexPoint: number | string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface TrendPoint {
  gameId: string;
  label: string;
  point: number | string;
  time: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** 赛季记录：GetBattleReport.season_list -> 展示行（最高排位优先排序用 tierOrder） */
export function buildSeasonRows(report: unknown): SeasonRankRow[] {
  const root = record(report);
  // getBattleReport 返回的是已解包的 battle_count；也兼容整包 payload
  const battleCount = record(root.battle_count ?? root);
  const list = battleCount.season_list;
  if (!Array.isArray(list)) return [];
  const rows: SeasonRankRow[] = [];
  for (const value of list) {
    const s = record(value);
    const sid = Number(s.sid);
    if (!Number.isFinite(sid)) continue;
    const soloTier = Number(s.tier);
    const teamTier = Number(s.team_tier);
    const wins = Number(s.wins);
    const losses = Number(s.losses);
    const total = Number(s.total);
    // 未定级且无战绩的远古赛季不展示
    if (soloTier === UNRANKED_TIER && total === 0) continue;
    rows.push({
      sid,
      label: "S" + sid,
      solo: tierLabel(soloTier, Number(s.queue)),
      soloPoint: typeof s.win_point === "number" || typeof s.win_point === "string" ? s.win_point : "",
      flex: tierLabel(teamTier, Number(s.team_queue)),
      flexPoint: typeof s.team_win_point === "number" || typeof s.team_win_point === "string" ? s.team_win_point : "",
      total,
      wins: Number.isFinite(wins) ? wins : 0,
      losses: Number.isFinite(losses) ? losses : 0,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0
    });
  }
  // 新赛季在前（sid 大的在前）
  rows.sort((a, b) => b.sid - a.sid);
  return rows;
}

const RANKED_QUEUES = new Set([420, 440]);

/** 近期走势：列表项 game_level 快照（仅排位对局），旧 -> 新 */
export function buildRankTrend(battles: BattleSummary[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const battle of battles) {
    if (!RANKED_QUEUES.has(Number(battle.game_queue_id))) continue;
    const raw = battle.game_level;
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { tier?: string | number; queue?: string | number; league_points?: string | number };
      const label = tierLabel(parsed.tier, parsed.queue);
      if (label === "未定级") continue;
      points.push({
        gameId: battle.game_id,
        label,
        point: typeof parsed.league_points === "string" || typeof parsed.league_points === "number" ? parsed.league_points : "",
        time: battle.game_start_time
      });
    } catch { /* 快照损坏的跳过 */ }
  }
  return points;
}

/** 拉取历史段位（赛季记录 + 近期走势），报告走 client 缓存 */
export async function fetchRankHistory(rq: RqOptions, signal?: AbortSignal): Promise<{ seasons: SeasonRankRow[]; trend: TrendPoint[]; reportKeys?: string[] }> {
  const report = await lolBattleApi.getBattleReport(rq, { signal });
  let trendBattles: BattleSummary[] = [];
  try {
    trendBattles = await lolBattleApi.getBattleList(rq, { count: 20, offset: 0 }, { signal });
  } catch { /* 走势拿不到就只给赛季记录 */ }
  const seasons = buildSeasonRows(report);
  return {
    seasons,
    trend: buildRankTrend(trendBattles),
    reportKeys: Array.isArray(report) ? ["(数组)"] : Object.keys(record(report)).slice(0, 12)
  };
}

export { tierName, tierOrder };
