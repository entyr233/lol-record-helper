import { ApiError } from "./errors";
import { postJson } from "./transport";

const RANK_URL = "https://mlol.qt.qq.com/go/battle_info/get_rank_trend";
const PROFILE_PATH = "/go/user_profile/query/user";

export interface SeasonRank {
  season: string;
  mode: string;
  rank: string;
  points: number | null;
  games: number | null;
  winRate: number | null;
}

export interface RankTrendPoint {
  time: string;
  timestamp: number;
  rank: string;
  points: number;
  value: number;
}

export interface RankHistory {
  seasons: SeasonRank[];
  trends: Array<{ title: string; points: RankTrendPoint[] }>;
  tip: string;
}

export interface RankSource {
  scene: string;
  player: string;
  area: string;
  capturedAt: string;
  history: RankHistory;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 网络响应和本地记录共用解析边界，不把缺失字段补为零。 */
export function parseRankHistory(payload: unknown): RankHistory {
  const root = object(payload);
  if (String(root.code ?? root.result) !== "0") {
    throw new ApiError("MLOL_RANK_REJECTED", "GetRankTrend", "掌盟未返回段位记录，请重新打开本人的历史段位页并导入新记录。");
  }
  const data = object(root.data);
  const trend = object(data.trend);
  if (!Array.isArray(data.season_rank_list) || (trend.rank_trend !== undefined && !Array.isArray(trend.rank_trend))) {
    throw new ApiError("INVALID_RESPONSE", "GetRankTrend", "掌盟历史段位数据格式不完整。");
  }
  const seasons: SeasonRank[] = [];
  for (const value of data.season_rank_list) {
    const season = object(value);
    if (!text(season.title) || !Array.isArray(season.list)) throw new Error("掌盟赛季记录格式异常。");
    for (const entry of season.list) {
      const rank = object(entry);
      seasons.push({
        season: text(season.title), mode: text(rank.title), rank: text(rank.full_rank_title) || "未提供",
        points: number(rank.league_points), games: number(rank.total), winRate: number(rank.wins_rate)
      });
    }
  }
  const trends = ((trend.rank_trend ?? []) as unknown[]).map((entry) => {
    const group = object(entry);
    if (!text(group.title) || !Array.isArray(group.items) || !Array.isArray(group.axis)) throw new Error("掌盟段位走势格式异常。");
    const axis = group.axis.map(object);
    const points: RankTrendPoint[] = group.items.map((value) => {
      const point = object(value);
      const position = axis.findIndex((rank) => String(rank.tier) === String(point.tier) && String(rank.rank) === String(point.rank));
      const timestamp = number(point.ts);
      const points = number(point.points);
      if (position < 0 || timestamp === null || points === null) throw new Error("掌盟走势缺少段位或胜点信息。");
      return {
        time: text(point.time), timestamp, rank: text(axis[position].title) || "未提供", points,
        // 与官方页面一致：每个段位分区间隔 100，再加该点的胜点。
        value: position * 100 + points
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
    return { title: text(group.title), points };
  });
  return { seasons, trends, tip: text(trend.tip) };
}

function responsePayload(response: Record<string, unknown>): unknown {
  const content = object(response.content);
  const raw = text(content.text);
  const decoded = content.encoding === "base64"
    ? new TextDecoder().decode(Uint8Array.from(atob(raw), (char) => char.charCodeAt(0))) : raw;
  return JSON.parse(decoded);
}

/** 只提取成功段位记录和与 scene 严格对应的角色，不保留请求头或完整文件。 */
export function importRankHistoryHar(raw: string): RankSource[] {
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("文件不是有效的 HAR 请求记录。"); }
  const entries = object(object(payload).log).entries;
  if (!Array.isArray(entries)) throw new Error("文件不是有效的 HAR 请求记录。");
  const players = new Map<string, { player: string; area: string }>();
  const sources = new Map<string, RankSource>();
  for (const value of entries) {
    const entry = object(value);
    const request = object(entry.request);
    const response = object(entry.response);
    let url: URL;
    try { url = new URL(text(request.url)); } catch { continue; }
    if (url.origin !== "https://mlol.qt.qq.com" || request.method !== "POST" || Number(response.status) !== 200) continue;
    if (url.pathname !== new URL(RANK_URL).pathname && url.pathname !== PROFILE_PATH) continue;
    try {
      const payload = responsePayload(response);
      if (url.pathname === PROFILE_PATH) {
        const data = object(payload).data;
        if (!Array.isArray(data)) continue;
        for (const item of data) {
          const profile = object(item);
          // 档案 scene 与大区角色 scene 不同，优先使用具体角色的身份。
          const scene = text(profile.scene);
          if (scene && text(profile.gameNickName)) players.set(scene, { player: text(profile.gameNickName), area: "" });
          if (!Array.isArray(profile.gameInfoList)) continue;
          for (const value of profile.gameInfoList) {
            const role = object(value);
            if (text(role.scene) && text(role.roleName)) players.set(text(role.scene), { player: text(role.roleName), area: text(role.areaName) });
          }
        }
      } else {
        const body = object(JSON.parse(text(object(request.postData).text)));
        const scene = text(body.scene);
        if (!scene) continue;
        const source: RankSource = { scene, player: "", area: "", capturedAt: text(entry.startedDateTime), history: parseRankHistory(payload) };
        const previous = sources.get(scene);
        if (!previous || source.capturedAt >= previous.capturedAt) sources.set(scene, source);
      }
    } catch {
      // 同一文件中的截断或失败记录，不影响其他成功记录。
    }
  }
  if (!sources.size) throw new Error("没有找到成功的历史段位响应。请开始记录后，在掌盟打开本人历史段位页，再重新导出 HAR。");
  return [...sources.values()].map((source) => ({ ...source, ...players.get(source.scene) }));
}

export async function fetchRankHistory(scene: string, signal: AbortSignal): Promise<RankHistory> {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  const response = await postJson(RANK_URL, { scene }, { signal });
  if (!response.ok) throw new ApiError("MLOL_RANK_HTTP", "GetRankTrend", "掌盟段位请求失败，请稍后重试。");
  return parseRankHistory(await response.json());
}
