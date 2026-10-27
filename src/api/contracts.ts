import { ApiError } from "./errors";

type RecordValue = Record<string, unknown>;

function object(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fields(value: unknown, strings: string[], numbers: string[]): value is RecordValue {
  return object(value)
    && strings.every((key) => typeof value[key] === "string")
    && numbers.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function identified(value: unknown, key: string): value is RecordValue {
  return object(value) && typeof value[key] === "string" && value[key].length > 0;
}

/** 最近接口响应（按方法记录，诊断用，__LOL_TFT_DUMP__ 一键导出） */
export const lastPayloads: Record<string, unknown> = {};

export function invalidResponse(method: string, payload?: unknown): ApiError {
  let digest = "";
  if (payload !== undefined) {
    try {
      const raw = JSON.stringify(payload);
      try { console.debug("[lol-tft] " + method + " 响应结构（完整）:", raw); } catch { /* ignore */ }
      digest = " | 响应原文: " + raw.slice(0, 600) + (raw.length > 600 ? "…" : "");
    } catch { /* ignore */ }
  }
  return new ApiError("INVALID_RESPONSE", method, "接口响应格式异常（" + method + "），请重试" + digest);
}

/** Check containers, identities and displayed core values, allowing extra/optional fields.
 * Some WeGame successes omit result; an explicit empty array is still required for no results.
 */
export function assertResponse(method: string, payload: unknown): void {
  lastPayloads[method] = payload;
  if (!object(payload)) throw invalidResponse(method, payload);
  if (payload.result !== undefined) {
    const result = payload.result;
    if (!object(result)
      || !["string", "number"].includes(typeof result.error_code)
      || (typeof result.error_code === "number" && !Number.isFinite(result.error_code))
      || String(result.error_code).trim() === ""
      || (result.error_message !== undefined && typeof result.error_message !== "string")) {
      throw invalidResponse(method, payload);
    }
    if (String(result.error_code) !== "0") {
      throw new ApiError(result.error_code as number | string, method, result.error_message as string | undefined);
    }
  }

  let valid = false;
  switch (method) {
    case "SearchPlayer":
      valid = Array.isArray(payload.players) && payload.players.every((player) =>
        identified(player, "openid") && fields(player, [], ["area", "icon_id", "level"]));
      break;
    case "GetSummonerInfo":
      valid = fields(payload.summoner, ["name"], ["icon_id", "level"]);
      break;
    case "GetBattleReport":
      valid = fields(payload.battle_count, [], [
        "total_games", "total_wins", "total_losts", "total_arm_games", "total_arm_wins", "total_arm_losts",
        "total_match_games", "total_match_wins", "total_match_losts", "total_rank_games", "total_rank_wins", "total_rank_losts"
      ]);
      break;
    case "GetBattleOverview":
      // 现任格式：{ battles: [...], season?, dimensionals?, ... }
      valid = Array.isArray(payload.battles) && payload.battles.every((battle) =>
        identified(battle, "game_id")
        && (typeof battle.game_start_time === "string"
          || (typeof battle.game_start_time === "number" && Number.isFinite(battle.game_start_time)))
        && typeof battle.win === "string"
        && fields(battle, [], ["game_time_played", "champion_id"]));
      break;
    case "GetBattleList":
      valid = Array.isArray(payload.battles) && payload.battles.every((battle) =>
        identified(battle, "game_id") && fields(battle, ["game_start_time", "win"], [
          "game_time_played", "game_queue_id", "champion_id", "kills", "deaths", "assists"
        ]));
      break;
    case "GetBattleDetail": {
      const detail = payload.battle_detail;
      // 2026 响应顶层可能不再带 openid（自己的 id 从路由已可知），故不做硬性要求
      valid = identified(detail, "game_id")
        && fields(detail, ["game_start_time"], ["game_time_played", "game_queue_id"])
        && Array.isArray(detail.team_details) && detail.team_details.length > 0
        && detail.team_details.every((team) => identified(team, "teamId")
          && fields(team, ["win"], ["totalKills", "totalDeaths", "totalAssists"]))
        && Array.isArray(detail.player_details) && detail.player_details.length > 0
        && detail.player_details.every((player) => identified(player, "openid") && identified(player, "teamId")
          && fields(player, ["name"], [
            "championId", "level", "teamMadeSize", "championsKilled", "numDeaths", "assists", "gameScore",
            "totalDamageToChampions", "totalDamageTaken", "magicDamageToChampions", "physicalDamageToChampions", "trueDemageToChampions"
          ]));
      break;
    }
  }
  if (!valid) throw invalidResponse(method, payload);
}
