import { describe, expect, it } from "vitest";
import type { BattleSummary } from "../src/api/types";
import { buildRankTrend, buildSeasonRows } from "../src/api/rankHistory";

const report = {
  result: { error_code: 0, error_message: "success" },
  battle_count: {
    season_list: [
      { sid: 27, total: 124, wins: 66, losses: 58, tier: 1, win_point: 75, queue: 0, team_tier: 1, team_win_point: 43, team_queue: 1 },
      { sid: 26, total: 63, wins: 37, losses: 26, tier: 6, win_point: 23, queue: 0, team_tier: 1, team_win_point: 5, team_queue: 2 },
      { sid: 22, total: 0, wins: 0, losses: 0, tier: 255, win_point: 0, queue: 0, team_tier: 255, team_win_point: 0, team_queue: 0 },
      { sid: 10, total: 2, wins: 1, losses: 1, tier: 2, win_point: 33, queue: 2, team_tier: 2, team_win_point: 3, team_queue: 2 }
    ]
  }
};

describe("历史段位（wegame season_list，无需掌盟）", () => {
  it("赛季记录：段位带小分区、胜率、新赛季在前", () => {
    const rows = buildSeasonRows(report);
    expect(rows).toHaveLength(3);
    expect(rows[0].label).toBe("S27");
    expect(rows[0].solo).toBe("钻石Ⅰ");
    expect(rows[0].soloPoint).toBe(75);
    expect(rows[0].flex).toBe("钻石Ⅱ");
    expect(rows[0].winRate).toBe(53);
    expect(rows[1].solo).toBe("超凡大师");
    expect(rows[2].label).toBe("S10");
    expect(rows[2].flex).toBe("铂金Ⅲ");
  });

  it("空赛季（255 无战绩）被过滤", () => {
    const rows = buildSeasonRows(report);
    expect(rows.some((r) => r.sid === 22)).toBe(false);
  });

  it("近期走势：仅排位对局、旧到新、损坏快照跳过", () => {
    const battle = (id: string, queue: number, level?: string): BattleSummary => ({
      game_id: id, game_start_time: "1792939509413", game_time_played: 900,
      game_queue_id: queue, champion_id: 1, win: "Win", kills: 1, deaths: 1, assists: 1,
      game_level: level
    });
    const trend = buildRankTrend([
      battle("g2", 440, JSON.stringify({ tier: "1", league_points: "50" })),
      battle("g1", 2400, JSON.stringify({ tier: "2", league_points: "9" })),
      battle("g3", 420, "{broken"),
      battle("g4", 420, JSON.stringify({ tier: "1", league_points: "43" })),
      battle("g5", 450)
    ]);
    expect(trend.map((p) => p.gameId)).toEqual(["g2", "g4"]);
    expect(trend[0].label).toBe("钻石");
    expect(trend[1].point).toBe("43");
  });
});
