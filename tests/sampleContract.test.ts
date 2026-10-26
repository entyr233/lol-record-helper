import { describe, expect, it } from "vitest";
import gameidSample from "../sample/gameid_result.json";
import gamelistSample from "../sample/gamelist_result.json";

/** 详情页实际渲染的字段（battleDetailPlayer / battleDetail） */
const PLAYER_FIELDS = [
  "championId", "level", "teamId", "teamMadeSize", "name", "openid",
  "championsKilled", "numDeaths", "assists", "gameScore",
  "totalDamageToChampions", "totalDamageTaken", "magicDamageToChampions",
  "physicalDamageToChampions", "trueDemageToChampions",
  "item0", "item1", "item2", "item3", "item4", "item5", "item6",
  "keystoneId", "perkSubStyle", "summonSpell1Id", "summonSpell2Id",
  "summonSpell1Cast", "summonSpell2Cast", "spell1Cast", "spell2Cast", "spell3Cast", "spell4Cast",
  "battleHonour", "wasAfk", "pentaKills"
];
const TEAM_FIELDS = ["teamId", "win", "teamElo", "totalKills", "totalDeaths", "totalAssists"];
const BATTLE_FIELDS = [
  "game_id", "game_start_time", "game_time_played", "game_queue_id",
  "champion_id", "win", "kills", "deaths", "assists",
  "was_mvp", "was_svp", "was_early_surrender", "was_afk",
  "team_made_size", "battle_type", "penta_kills"
];

describe("接口字段契约（基于 sample/*.json 真实返回）", () => {
  const detail = (gameidSample as any).battle_detail;
  const player = detail.player_details[0];
  const team = detail.team_details[0];
  const battle = (gamelistSample as any).battles[0];

  it("对局详情：player_details 包含全部被渲染字段", () => {
    for (const field of PLAYER_FIELDS) {
      expect(player, "缺少字段: " + field).toHaveProperty(field);
    }
  });

  it("对局详情：team_details 包含全部被渲染字段", () => {
    for (const field of TEAM_FIELDS) {
      expect(team, "缺少字段: " + field).toHaveProperty(field);
    }
  });

  it("对局列表：battles 包含全部被渲染字段", () => {
    for (const field of BATTLE_FIELDS) {
      expect(battle, "缺少字段: " + field).toHaveProperty(field);
    }
  });

  it("详情内 10 名玩家、2 支队伍，且 teamId 一致可分组", () => {
    expect(detail.player_details).toHaveLength(10);
    expect(detail.team_details).toHaveLength(2);
    const teamIds = new Set(detail.player_details.map((p: any) => p.teamId));
    expect(teamIds.size).toBe(2);
  });
});
