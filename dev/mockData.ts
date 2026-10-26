import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 本地开发 mock 数据：用仓库里的真实接口样本（sample/*.json）扩展。
 * 纯函数、无 Vite 依赖，dev server 与单测共用。
 *
 * 关键点：按玩家 id 生成**不同**的数据（名字/等级/战绩/对局列表），
 * 否则点进不同玩家看到的都是同一份，会让人误以为点击没生效。
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

const CHAMPIONS = [17, 223, 103, 64, 157, 222, 51, 40, 99, 145, 202, 81];
const QUEUES = [420, 440, 450, 100];
const ICONS = [1388, 4012, 588, 907, 29, 3567];
const NAMES = ["一只yan水鸭", "DontScared", "一万八的DIE", "无聊一起打游戏", "与月亮晚安", "繁星的世子先生", "落云不思归"];
const TEMPLATE = baseList.battles[0];

export interface MockPlayer {
  openid: string;
  name: string;
  level: number;
  iconId: number;
  area: number;
  seed: number;
}

const registry = new Map<string, MockPlayer>();

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function createPlayer(id: string, area: number, name: string): MockPlayer {
  const seed = hashString(id);
  const player: MockPlayer = {
    openid: id,
    name,
    level: 60 + (seed % 540),
    iconId: ICONS[seed % ICONS.length],
    area,
    seed
  };
  registry.set(id, player);
  return player;
}

/** 自己的账号（「我的战绩」）用固定数据 */
registry.set("10001", { openid: "10001", name: "测试召唤师（mock）", level: 512, iconId: 1388, area: 1, seed: 10001 });

export function getPlayer(id: string, area = 1): MockPlayer {
  const existing = registry.get(id);
  if (existing) return existing;
  return createPlayer(id, area, NAMES[hashString(id) % NAMES.length]);
}

export interface MockBattleList {
  battles: SampleBattle[];
}

const battleCache = new Map<string, SampleBattle[]>();

/** 每个玩家一份对局列表：起点、胜负、英雄都按 seed 变化 */
export function battlesFor(player: MockPlayer): SampleBattle[] {
  const cached = battleCache.get(player.openid);
  if (cached) return cached;

  const total = 28;
  const offset = player.seed % total;
  const list = Array.from({ length: total }, (_, index) => {
    const sourceIndex = (index + offset) % total;
    const startedAt = 1761400000000 - index * 47 * 60 * 1000;
    const lose = (sourceIndex + player.seed) % 3 === 2;
    return {
      ...TEMPLATE,
      game_id: player.openid + "-" + String(index + 1).padStart(3, "0"),
      game_start_time: String(startedAt),
      game_time_played: 1200 + ((sourceIndex * 137) % 1500),
      game_queue_id: QUEUES[(sourceIndex + player.seed) % QUEUES.length],
      champion_id: CHAMPIONS[(sourceIndex + player.seed) % CHAMPIONS.length],
      win: lose ? "Fail" : "Win",
      kills: (sourceIndex * 3 + player.seed) % 16,
      deaths: (sourceIndex * 2) % 9,
      assists: 4 + ((sourceIndex * 5) % 20),
      was_mvp: (sourceIndex + player.seed) % 5 === 0 ? 1 : 0,
      was_svp: (sourceIndex + player.seed) % 7 === 3 ? 1 : 0,
      was_early_surrender: sourceIndex === 11 ? 1 : 0,
      was_afk: sourceIndex === 17 ? 1 : 0,
      team_made_size: 1 + (sourceIndex % 5),
      penta_kills: sourceIndex === 4 ? 1 : 0
    };
  });
  battleCache.set(player.openid, list);
  return list;
}

export function mockDetail(gameId: string): SampleDetail {
  const detail = JSON.parse(JSON.stringify(baseDetail)) as SampleDetail;
  detail.battle_detail.game_id = gameId;
  const battle = getBattleListAll().find((item) => item.game_id === gameId);
  if (battle) {
    detail.battle_detail.game_start_time = battle.game_start_time;
    detail.battle_detail.game_time_played = battle.game_time_played;
    detail.battle_detail.game_queue_id = battle.game_queue_id;
  }
  return detail;
}

function getBattleListAll(): SampleBattle[] {
  return battlesFor(getPlayer("10001"));
}

export function summonerFor(player: MockPlayer) {
  return {
    name: player.name,
    icon_id: player.iconId,
    level: player.level,
    experience: 1000 + (player.seed % 90000),
    praise: player.seed % 200,
    discredit: player.seed % 5
  };
}

export function battleCountFor(player: MockPlayer) {
  const total = 300 + (player.seed % 2400);
  const wins = Math.round(total * (0.42 + ((player.seed % 17) / 100)));
  const aram = Math.round(total * 0.26);
  const match = Math.round(total * 0.48);
  const rank = total - aram - match;
  return {
    total_games: total,
    total_wins: wins,
    total_losts: total - wins,
    total_arm_games: aram,
    total_arm_wins: Math.round(aram * 0.53),
    total_arm_losts: aram - Math.round(aram * 0.53),
    total_match_games: match,
    total_match_wins: Math.round(match * 0.51),
    total_match_losts: match - Math.round(match * 0.51),
    total_rank_games: rank,
    total_rank_wins: Math.round(rank * 0.52),
    total_rank_losts: rank - Math.round(rank * 0.52)
  };
}

const SEARCH_AREAS = [1, 3, 14];

export const MOCK_API_PREFIX = "/api/v1/wegame.pallas.game.LolBattle/";

/** 根据接口方法名返回 mock 响应体 */
export function route(method: string, body: Record<string, unknown>): unknown {
  switch (method) {
    case "GetBattleList": {
      const player = getPlayer(String(body.id ?? ""), Number(body.area) || 1);
      const offset = Number(body.offset) || 0;
      const count = Number(body.count) || 10;
      return {
        result: { error_code: 0, error_message: "" },
        battles: battlesFor(player).slice(offset, offset + count)
      };
    }
    case "GetBattleDetail":
      return mockDetail(String(body.game_id ?? ""));
    case "GetSummonerInfo": {
      const player = getPlayer(String(body.id ?? ""), Number(body.area) || 1);
      return { result: { error_code: 0, error_message: "" }, summoner: summonerFor(player) };
    }
    case "GetBattleReport": {
      const player = getPlayer(String(body.id ?? ""), Number(body.area) || 1);
      return { result: { error_code: 0, error_message: "" }, battle_count: battleCountFor(player) };
    }
    case "SearchPlayer": {
      const nickname = String(body.nickname ?? "").slice(0, 16) || "无名召唤师";
      const players = SEARCH_AREAS.map((area) => {
        const player = getPlayer("mock|" + area + "|" + nickname, area);
        player.name = nickname;
        return { openid: player.openid, icon_id: player.iconId, level: player.level, area };
      });
      return { result: { error_code: 0, error_message: "" }, players };
    }
    default:
      return { result: { error_code: 4000404, error_message: "mock 未实现的方法: " + method } };
  }
}
