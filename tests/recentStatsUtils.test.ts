// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BattleSummary } from "../src/api/types";
import { summarizeRecentBattles, type RecentSummaryOptions } from "../src/utils/recentStats";

type BattlePatch = Partial<Omit<BattleSummary, "team_made_size">> & { team_made_size?: number | null };

let sequence = 0;

/** 本地正午时间戳：避免测试结果受运行时区影响（日期标签一定是当天） */
function localTs(year: number, month: number, day: number): string {
  return String(new Date(year, month - 1, day, 12, 0, 0).getTime());
}

function makeBattle(patch: BattlePatch = {}): BattleSummary {
  sequence += 1;
  return {
    game_id: "g" + sequence,
    game_start_time: localTs(2024, 1, 15),
    game_time_played: 1800,
    game_queue_id: 420,
    champion_id: 1,
    win: "Win",
    kills: 5,
    deaths: 2,
    assists: 8,
    team_made_size: 1,
    ...patch
  } as BattleSummary;
}

describe("summarizeRecentBattles：三分类与胜率", () => {
  it("LeaverWin/LeaverFail 按统一口径计数，重开单列且不进胜率分母", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ win: "Win" }),
      makeBattle({ win: "LeaverWin" }),
      makeBattle({ win: "Fail" }),
      makeBattle({ win: "LeaverFail" }),
      makeBattle({ win: "Fail", was_early_surrender: 1 }),
      makeBattle({ win: "Win", was_early_surrender: 1 }),
      makeBattle({ win: "Win" })
    ]);
    expect(summary.wins).toBe(3);
    expect(summary.losses).toBe(2);
    expect(summary.remakes).toBe(2);
    // 3 / (3 + 2) = 60%；若把重开算进分母会是 3/7 ≈ 43%
    expect(summary.winRate).toBe(60);
  });

  it("全为重开时胜率分母为 0，显示 0", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ win: "Win", was_early_surrender: 1 }),
      makeBattle({ win: "Fail", was_early_surrender: 1 })
    ]);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(0);
    expect(summary.remakes).toBe(2);
    expect(summary.winRate).toBe(0);
  });
});

describe("summarizeRecentBattles：连胜连败", () => {
  it("连败计数跳过重开、重开不打断", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ win: "Fail" }),
      makeBattle({ win: "Win", was_early_surrender: 1 }),
      makeBattle({ win: "Fail" }),
      makeBattle({ win: "Fail" }),
      makeBattle({ win: "Win" })
    ]);
    expect(summary.streak).toEqual({ count: 3, lose: true });
  });

  it("连胜计数跳过重开、重开不打断", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ win: "Win" }),
      makeBattle({ win: "Fail", was_early_surrender: 1 }),
      makeBattle({ win: "Win" }),
      makeBattle({ win: "Fail" })
    ]);
    expect(summary.streak).toEqual({ count: 2, lose: false });
  });

  it("首场重开时跳过重开取第一场非重开结果；连续不足 2 场视为无", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ win: "Fail", was_early_surrender: 1 }),
      makeBattle({ win: "Win" }),
      makeBattle({ win: "Fail" })
    ]);
    expect(summary.streak).toEqual({ count: 0, lose: false });
    expect(summarizeRecentBattles([]).streak).toEqual({ count: 0, lose: false });
  });
});

describe("summarizeRecentBattles：场均 / 时长 / KDA / 荣誉", () => {
  it("KDA 用总击杀总助攻总死亡，场均保留 1 位小数，时长 m:ss", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ kills: 10, deaths: 0, assists: 5, game_time_played: 1200 }),
      makeBattle({ kills: 4, deaths: 4, assists: 10, game_time_played: 1801 })
    ]);
    // (14 + 15) / max(1, 4) = 7.25
    expect(summary.avgKda).toBe("7.25");
    expect(summary.averages).toEqual({ kills: "7.0", deaths: "2.0", assists: "7.5", duration: "25:01" });
  });

  it("荣誉与五杀按场次/求和统计", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ was_mvp: 1, penta_kills: 1 }),
      makeBattle({ was_svp: 1 }),
      makeBattle({ was_mvp: 2 }),
      makeBattle({ penta_kills: 2 })
    ]);
    expect(summary.honorCount).toBe(2);
    expect(summary.pentaCount).toBe(3);
  });
});

describe("summarizeRecentBattles：英雄分布", () => {
  it("按 champion_id 聚合胜场（重开不算胜），按场次降序", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ champion_id: 1, win: "Win" }),
      makeBattle({ champion_id: 1, win: "Fail" }),
      makeBattle({ champion_id: 1, win: "Win" }),
      makeBattle({ champion_id: 2, win: "Win" }),
      makeBattle({ champion_id: 2, win: "Win", was_early_surrender: 1 }),
      makeBattle({ champion_id: 3, win: "Fail", was_early_surrender: 1 })
    ]);
    expect(summary.champions).toEqual([
      { id: 1, count: 3, wins: 2 },
      { id: 2, count: 2, wins: 1 },
      { id: 3, count: 1, wins: 0 }
    ]);
  });

  it("默认最多 10 个英雄，可用 maxChampions 收紧", () => {
    const sample = Array.from({ length: 12 }, (_, i) => makeBattle({ champion_id: i + 1 }));
    expect(summarizeRecentBattles(sample).champions).toHaveLength(10);
    expect(summarizeRecentBattles(sample, { maxChampions: 2 }).champions.map((c) => c.id)).toEqual([1, 2]);
  });
});

describe("summarizeRecentBattles：模式分布", () => {
  it("按队列聚合，label 用 getQueueName，按场次降序并计算百分比", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ game_queue_id: 420 }),
      makeBattle({ game_queue_id: 420 }),
      makeBattle({ game_queue_id: 420 }),
      makeBattle({ game_queue_id: 400 }),
      makeBattle({ game_queue_id: 400 }),
      makeBattle({ game_queue_id: 62 }),
      makeBattle({ game_queue_id: 440 }),
      makeBattle({ game_queue_id: 999999 })
    ]);
    // 默认最多 4 类：420×3 → 38%、400×2 → 25%、62/440 各 1 → 13%
    expect(summary.queues).toEqual([
      { id: 420, label: "单双排", count: 3, percent: 38 },
      { id: 400, label: "匹配赛", count: 2, percent: 25 },
      { id: 62, label: "大乱斗", count: 1, percent: 13 },
      { id: 440, label: "灵活排位", count: 1, percent: 13 }
    ]);
    const all = summarizeRecentBattles(
      [
        makeBattle({ game_queue_id: 420 }),
        makeBattle({ game_queue_id: 420 }),
        makeBattle({ game_queue_id: 420 }),
        makeBattle({ game_queue_id: 400 }),
        makeBattle({ game_queue_id: 400 }),
        makeBattle({ game_queue_id: 62 }),
        makeBattle({ game_queue_id: 440 }),
        makeBattle({ game_queue_id: 999999 })
      ],
      { maxQueues: 10 }
    );
    // 未知队列 id 的兜底文案仍走 getQueueName
    expect(all.queues[4]).toEqual({ id: 999999, label: "未知", count: 1, percent: 13 });
  });
});

describe("summarizeRecentBattles：组队分桶", () => {
  it("排位/非排位按人数分桶，未知 team_made_size 单独「组队未提供」", () => {
    const summary = summarizeRecentBattles(
      [
        makeBattle({ game_queue_id: 420, team_made_size: 1 }),
        makeBattle({ game_queue_id: 420, team_made_size: 2 }),
        makeBattle({ game_queue_id: 400, team_made_size: 2 }),
        makeBattle({ game_queue_id: 400, team_made_size: undefined }),
        makeBattle({ game_queue_id: 420, team_made_size: 0 }),
        makeBattle({ game_queue_id: 400, team_made_size: null }),
        makeBattle({ game_queue_id: 400, team_made_size: 6 }),
        makeBattle({ game_queue_id: 420, team_made_size: 6 })
      ],
      { maxTeams: 10 }
    );
    const byLabel = new Map(summary.teams.map((team) => [team.label, team.count]));
    expect(byLabel.get("组队未提供")).toBe(3);
    expect(byLabel.get("单排")).toBe(1);
    expect(byLabel.get("双排")).toBe(1);
    expect(byLabel.get("双人开黑")).toBe(1);
    // 超出已知人数表时回退到「排位 / 开黑」
    expect(byLabel.get("排位")).toBe(1);
    expect(byLabel.get("开黑")).toBe(1);
    // 未知人数不能并进单人桶
    expect(byLabel.has("单人")).toBe(false);
    const unknown = summary.teams.find((team) => team.label === "组队未提供");
    expect(unknown).toEqual({ id: "team-unknown", label: "组队未提供", count: 3, percent: 38 });
  });

  it("默认最多 4 个组队桶，可用 maxTeams 收紧", () => {
    const sample = [
      makeBattle({ game_queue_id: 400, team_made_size: undefined }),
      makeBattle({ game_queue_id: 400, team_made_size: undefined }),
      makeBattle({ game_queue_id: 400, team_made_size: undefined }),
      makeBattle({ game_queue_id: 420, team_made_size: 1 }),
      makeBattle({ game_queue_id: 420, team_made_size: 2 }),
      makeBattle({ game_queue_id: 400, team_made_size: 2 }),
      makeBattle({ game_queue_id: 400, team_made_size: 3 }),
      makeBattle({ game_queue_id: 400, team_made_size: 4 })
    ];
    const byDefault = summarizeRecentBattles(sample);
    expect(byDefault.teams).toHaveLength(4);
    expect(byDefault.teams[0].label).toBe("组队未提供");
    expect(summarizeRecentBattles(sample, { maxTeams: 2 }).teams).toHaveLength(2);
  });
});

describe("summarizeRecentBattles：累计胜率趋势", () => {
  it("从旧到新逐场累计，坐标与 pointsAttr 对齐 196×46", () => {
    const sample = [
      makeBattle({ win: "Fail", game_start_time: localTs(2024, 1, 17) }),
      makeBattle({ win: "Win", was_early_surrender: 1, game_start_time: localTs(2024, 1, 16) }),
      makeBattle({ win: "Win", game_start_time: localTs(2024, 1, 15) })
    ];
    const summary = summarizeRecentBattles(sample);
    expect(summary.trend.points.map((point) => point.winRate)).toEqual([100, 100, 50]);
    expect(summary.trend.points.map((point) => point.label)).toEqual(["2024-01-15", "2024-01-16", "2024-01-17"]);
    expect(summary.trend.points.map((point) => point.x)).toEqual([4, 98, 192]);
    expect(summary.trend.points[0].y).toBe(4);
    // 50% → 38 - 0.5 * 34 = 21
    expect(summary.trend.points[2].y).toBe(21);
    expect(summary.trend.pointsAttr).toBe("4.0,4.0 98.0,4.0 192.0,21.0");
    expect(summary.trend.firstLabel).toBe("2024-01-15");
    expect(summary.trend.lastLabel).toBe("2024-01-17");
    // 从旧到新：points 的 key 顺序与样本相反
    expect(summary.trend.points.map((point) => point.key)).toEqual([
      sample[2].game_id,
      sample[1].game_id,
      sample[0].game_id
    ]);
  });

  it("只有 1 场时没有走势（points 为空，标签为空）", () => {
    const summary = summarizeRecentBattles([makeBattle()]);
    expect(summary.trend).toEqual({ points: [], pointsAttr: "", firstLabel: "", lastLabel: "" });
  });

  it("无效时间戳的日期标签为空串", () => {
    const summary = summarizeRecentBattles([
      makeBattle({ game_start_time: "0" }),
      makeBattle({ game_start_time: "bad" })
    ]);
    expect(summary.trend.firstLabel).toBe("");
    expect(summary.trend.lastLabel).toBe("");
  });
});

describe("summarizeRecentBattles：空样本与纯函数约束", () => {
  it("空样本返回全零默认值", () => {
    expect(summarizeRecentBattles([])).toEqual({
      wins: 0,
      losses: 0,
      remakes: 0,
      winRate: 0,
      avgKda: "0.00",
      streak: { count: 0, lose: false },
      averages: { kills: "0.0", deaths: "0.0", assists: "0.0", duration: "0:00" },
      honorCount: 0,
      pentaCount: 0,
      champions: [],
      queues: [],
      teams: [],
      trend: { points: [], pointsAttr: "", firstLabel: "", lastLabel: "" }
    });
  });

  it("不修改入参与 options，多次调用结果稳定", () => {
    const sample = [
      makeBattle({ win: "Fail", game_queue_id: 400 }),
      makeBattle({ win: "Win", game_queue_id: 420 })
    ];
    const snapshot = sample.map((battle) => ({ ...battle }));
    const options: RecentSummaryOptions = { maxChampions: 2, maxQueues: 2, maxTeams: 2 };
    const first = summarizeRecentBattles(sample, options);
    const second = summarizeRecentBattles(sample, options);
    expect(sample).toEqual(snapshot);
    expect(options).toEqual({ maxChampions: 2, maxQueues: 2, maxTeams: 2 });
    expect(second).toEqual(first);
  });
});
