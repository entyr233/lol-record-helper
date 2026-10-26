import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 本地开发 mock 数据：用仓库里的真实接口样本（sample/*.json）扩展出完整数据集。
 * 纯函数、无 Vite 依赖，dev server 与单测共用。
 */

const here = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(here, "..", "sample");

export interface SampleBattle {
  game_id: string;
  game_start_time: string;
  game_time_played: number;
  game_queue_id: number;
  champion_id: number;
  win: string;
  kills: number;
  deaths: number;
  assists: number;
  [key: string]: unknown;
}

export interface SampleDetail {
  result: { error_code: number; error_message: string };
  openid: string;
  battle_detail: {
    game_id: string;
    game_start_time: string;
    game_time_played: number;
    game_queue_id: number;
    team_details: Array<Record<string, unknown>>;
    player_details: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

function readSample<T>(name: string): T {
  return JSON.parse(readFileSync(join(sampleDir, name), "utf8")) as T;
}

const baseList = readSample<{ battles: SampleBattle[] }>("gamelist_result.json");
const baseDetail = readSample<SampleDetail>("gameid_result.json");

const CHAMPIONS = [17, 223, 103, 64, 157, 222, 51, 40, 99, 145];
const QUEUES = [420, 440, 450, 100];
const TEMPLATE = baseList.battles[0];

/** 1 条样本 -> 28 条，覆盖分页、不同队列、胜负、MVP/SVP/重开/逃跑/五杀 */
export const MOCK_BATTLES: SampleBattle[] = Array.from({ length: 28 }, (_, index) => {
  const startedAt = 1761400000000 - index * 47 * 60 * 1000;
  return {
    ...TEMPLATE,
    game_id: "mock-" + String(index + 1).padStart(3, "0"),
    game_start_time: String(startedAt),
    game_time_played: 1200 + ((index * 137) % 1500),
    game_queue_id: QUEUES[index % QUEUES.length],
    champion_id: CHAMPIONS[index % CHAMPIONS.length],
    win: index % 3 === 2 ? "Fail" : "Win",
    kills: (index * 3) % 15,
    deaths: (index * 2) % 9,
    assists: 4 + ((index * 5) % 20),
    was_mvp: index % 5 === 0 ? 1 : 0,
    was_svp: index % 7 === 3 ? 1 : 0,
    was_early_surrender: index === 11 ? 1 : 0,
    was_afk: index === 17 ? 1 : 0,
    team_made_size: 1 + (index % 5),
    penta_kills: index === 4 ? 1 : 0
  };
});

export function mockDetail(gameId: string): SampleDetail {
  const battle = MOCK_BATTLES.find((item) => item.game_id === gameId);
  const detail = JSON.parse(JSON.stringify(baseDetail)) as SampleDetail;
  detail.battle_detail.game_id = gameId;
  if (battle) {
    detail.battle_detail.game_start_time = battle.game_start_time;
    detail.battle_detail.game_time_played = battle.game_time_played;
    detail.battle_detail.game_queue_id = battle.game_queue_id;
  }
  return detail;
}

export const MOCK_SUMMONER = {
  name: "测试召唤师（mock）",
  icon_id: 1388,
  level: 512,
  experience: 88213,
  praise: 128,
  discredit: 3
};

export const MOCK_BATTLE_COUNT = {
  total_games: 2317,
  total_wins: 1188,
  total_losts: 1129,
  total_arm_games: 604,
  total_arm_wins: 318,
  total_arm_losts: 286,
  total_match_games: 1102,
  total_match_wins: 561,
  total_match_losts: 541,
  total_rank_games: 611,
  total_rank_wins: 309,
  total_rank_losts: 302
};

export const MOCK_PLAYERS = [
  { openid: "mock-openid-1", icon_id: 1388, level: 512, area: 1 },
  { openid: "mock-openid-2", icon_id: 4012, level: 287, area: 3 },
  { openid: "mock-openid-3", icon_id: 588, level: 96, area: 14 }
];

export const MOCK_API_PREFIX = "/api/v1/wegame.pallas.game.LolBattle/";

/** 根据接口方法名返回 mock 响应体 */
export function route(method: string, body: Record<string, unknown>): unknown {
  switch (method) {
    case "GetBattleList": {
      const offset = Number(body.offset) || 0;
      const count = Number(body.count) || 10;
      return { result: { error_code: 0, error_message: "" }, battles: MOCK_BATTLES.slice(offset, offset + count) };
    }
    case "GetBattleDetail":
      return mockDetail(String(body.game_id ?? ""));
    case "GetSummonerInfo":
      return { result: { error_code: 0, error_message: "" }, summoner: MOCK_SUMMONER };
    case "GetBattleReport":
      return { result: { error_code: 0, error_message: "" }, battle_count: MOCK_BATTLE_COUNT };
    case "SearchPlayer":
      return { result: { error_code: 0, error_message: "" }, players: MOCK_PLAYERS };
    default:
      return { result: { error_code: 4000404, error_message: "mock 未实现的方法: " + method } };
  }
}
