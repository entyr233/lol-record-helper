import type { BattleSummary } from "../api/types";
import { getQueueName, getTeamMadeLabel, isRankedQueue } from "../const/queues";
import { classifyBattle } from "../const/wins";

/** 常用英雄聚合项：英雄 id、出场场次、胜场（三分类口径，重开不算胜） */
export interface RecentChampionStat {
  id: number;
  count: number;
  wins: number;
}

/** 模式 / 组队分布项：占比按当前样本场次四舍五入 */
export interface RecentCountStat {
  id: string | number;
  label: string;
  count: number;
  percent: number;
}

/** 累计胜率趋势点：坐标基于 196×46 的迷你折线图 */
export interface RecentTrendPoint {
  key: string;
  label: string;
  winRate: number;
  x: number;
  y: number;
}

/** 近期表现统计结果（纯数据，可直接喂给组件模板） */
export interface RecentSummary {
  wins: number;
  losses: number;
  remakes: number;
  winRate: number;
  avgKda: string;
  streak: { count: number; lose: boolean };
  /** 场均击杀/死亡/助攻保留 1 位小数；duration 为平均时长的 m:ss */
  averages: { kills: string; deaths: string; assists: string; duration: string };
  honorCount: number;
  pentaCount: number;
  champions: RecentChampionStat[];
  queues: RecentCountStat[];
  teams: RecentCountStat[];
  trend: { points: RecentTrendPoint[]; pointsAttr: string; firstLabel: string; lastLabel: string };
}

/** 各类分布的上限，默认与 RecentStats.vue 显示口径一致 */
export interface RecentSummaryOptions {
  maxChampions?: number;
  maxQueues?: number;
  maxTeams?: number;
}

const DEFAULT_MAX_CHAMPIONS = 10;
const DEFAULT_MAX_QUEUES = 4;
const DEFAULT_MAX_TEAMS = 4;
/** 趋势图与 RecentStats.vue 的 <svg width="196" height="46"> 对齐 */
const TREND_WIDTH = 196;
const TREND_PADDING = 4;
/** 未知组队人数的桶（不能并进单人/单排） */
const UNKNOWN_TEAM_ID = "team-unknown";
const UNKNOWN_TEAM_LABEL = "组队未提供";

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 上限规整：负数/非数字回退默认值，避免 slice(0, -1) 这类意外结果 */
function limitOf(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/** 对局开始时间 → 完整 YYYY-MM-DD（无效时间返回空串，与组件一致） */
function dateLabelOf(g: BattleSummary): string {
  const ts = Number(g.game_start_time);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
}

/** 秒 → m:ss */
function durationLabel(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

function percentOf(count: number, total: number): number {
  return total ? Math.round((count / total) * 100) : 0;
}

/**
 * 连胜连败：跳过重开取第一场非重开结果，之后连续相同结果计数（重开不打断）。
 * 只有 ≥2 场连续才算「有」，否则返回 { count: 0, lose: false }。
 */
function streakOf(sample: BattleSummary[]): { count: number; lose: boolean } {
  const firstIndex = sample.findIndex((g) => classifyBattle(g) !== "remake");
  if (firstIndex < 0) return { count: 0, lose: false };
  const first = classifyBattle(sample[firstIndex]);
  let count = 0;
  for (let i = firstIndex; i < sample.length; i += 1) {
    const result = classifyBattle(sample[i]);
    if (result === "remake") continue;
    if (result !== first) break;
    count += 1;
  }
  if (count < 2) return { count: 0, lose: false };
  return { count, lose: first === "lose" };
}

/**
 * 累计胜率趋势：样本按时间从旧到新逐场累计（不按天聚合），
 * 1 场时没有走势可画，返回空趋势。
 */
function trendOf(sample: BattleSummary[]): RecentSummary["trend"] {
  const list = sample.slice().reverse();
  if (list.length < 2) {
    return { points: [], pointsAttr: "", firstLabel: "", lastLabel: "" };
  }
  let wins = 0;
  let losses = 0;
  const points: Array<Pick<RecentTrendPoint, "key" | "label" | "winRate">> = list.map((g) => {
    const result = classifyBattle(g);
    if (result === "win") wins += 1;
    else if (result === "lose") losses += 1;
    const decided = wins + losses;
    return { key: g.game_id, label: dateLabelOf(g), winRate: decided ? Math.round((wins / decided) * 100) : 0 };
  });
  const step = (TREND_WIDTH - TREND_PADDING * 2) / Math.max(1, points.length - 1);
  const withCoords: RecentTrendPoint[] = points.map((point, index) => ({
    ...point,
    x: TREND_PADDING + index * step,
    y: 38 - (point.winRate / 100) * 34
  }));
  return {
    points: withCoords,
    pointsAttr: withCoords.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" "),
    firstLabel: withCoords[0].label,
    lastLabel: withCoords[withCoords.length - 1].label
  };
}

/**
 * 近 N 场统计汇总（纯函数：不依赖 Vue、不修改入参）。
 * 口径与 RecentStats.vue 现有实现一致：三分类用 classifyBattle，重开不计入胜率分母。
 */
export function summarizeRecentBattles(sample: BattleSummary[], options: RecentSummaryOptions = {}): RecentSummary {
  const size = sample.length;
  const maxChampions = limitOf(options.maxChampions, DEFAULT_MAX_CHAMPIONS);
  const maxQueues = limitOf(options.maxQueues, DEFAULT_MAX_QUEUES);
  const maxTeams = limitOf(options.maxTeams, DEFAULT_MAX_TEAMS);

  let wins = 0;
  let losses = 0;
  let remakes = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let played = 0;
  let honorCount = 0;
  let pentaCount = 0;
  const championMap = new Map<number, RecentChampionStat>();
  const queueMap = new Map<number, number>();
  const teamMap = new Map<string, { id: string; label: string; count: number }>();

  for (const g of sample) {
    const result = classifyBattle(g);
    if (result === "win") wins += 1;
    else if (result === "lose") losses += 1;
    else remakes += 1;

    kills += Number(g.kills ?? 0);
    deaths += Number(g.deaths ?? 0);
    assists += Number(g.assists ?? 0);
    played += Number(g.game_time_played ?? 0);
    if (Number(g.was_mvp) === 1 || Number(g.was_svp) === 1) honorCount += 1;
    pentaCount += Number(g.penta_kills ?? 0);

    const champion = championMap.get(g.champion_id) ?? { id: g.champion_id, count: 0, wins: 0 };
    champion.count += 1;
    if (result === "win") champion.wins += 1;
    championMap.set(g.champion_id, champion);

    const queueId = Number(g.game_queue_id) || 0;
    queueMap.set(queueId, (queueMap.get(queueId) ?? 0) + 1);

    // 组队分桶：排位/非排位 × 预组队人数；未知人数单独一桶，不当成单人
    const madeRaw = g.team_made_size as number | null | undefined;
    const made = madeRaw === null || madeRaw === undefined ? Number.NaN : Number(madeRaw);
    const known = Number.isFinite(made) && made >= 1;
    const ranked = isRankedQueue(queueId);
    const teamKey = known ? (ranked ? "rank-" : "normal-") + made : UNKNOWN_TEAM_ID;
    const teamLabel = known ? getTeamMadeLabel(made, ranked) ?? (ranked ? "排位" : "开黑") : UNKNOWN_TEAM_LABEL;
    const team = teamMap.get(teamKey) ?? { id: teamKey, label: teamLabel, count: 0 };
    team.count += 1;
    teamMap.set(teamKey, team);
  }

  const decidedTotal = wins + losses;
  const champions = [...championMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxChampions);
  const queues = [...queueMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxQueues)
    .map(([id, count]) => ({ id, label: getQueueName(id), count, percent: percentOf(count, size) }));
  const teams = [...teamMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTeams)
    .map((entry) => ({ id: entry.id, label: entry.label, count: entry.count, percent: percentOf(entry.count, size) }));

  const avgKda = !deaths && !kills ? "0.00" : ((kills + assists) / Math.max(1, deaths)).toFixed(2);
  const averages = size
    ? {
      kills: (kills / size).toFixed(1),
      deaths: (deaths / size).toFixed(1),
      assists: (assists / size).toFixed(1),
      duration: durationLabel(played / size)
    }
    : { kills: "0.0", deaths: "0.0", assists: "0.0", duration: "0:00" };

  return {
    wins,
    losses,
    remakes,
    winRate: decidedTotal ? Math.round((wins / decidedTotal) * 100) : 0,
    avgKda,
    streak: streakOf(sample),
    averages,
    honorCount,
    pentaCount,
    champions,
    queues,
    teams,
    trend: trendOf(sample)
  };
}
