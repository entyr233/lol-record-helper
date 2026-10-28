import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import gameidSample from "./fixtures/wegame/gameid_result.json";
import gamelistSample from "./fixtures/wegame/gamelist_result.json";

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

describe("接口字段契约（基于 tests/fixtures/wegame/*.json 接口样例）", () => {
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

  it("详情玩家使用稳定合成标识和昵称，顶层 OpenID 仍关联到同一玩家", () => {
    const players = gameidSample.battle_detail.player_details;
    // Check booleans so a future privacy regression cannot print raw identities on failure.
    expect(players.every((player, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return player.openid === "sample-openid-" + suffix && player.name === "示例玩家" + suffix;
    }), "玩家身份字段必须为合成值").toBe(true);
    expect(players.filter((player) => player.openid === gameidSample.openid).length).toBe(1);
  });

  it("空账号/IP 字段保持为空，队伍关联和跨样例对局关联保留", () => {
    const players = gameidSample.battle_detail.player_details;
    expect(players.every((player) => [player.loginIp, player.lolId, player.lpl, player.puuId, player.uinId]
      .every((value) => value === "")), "空身份字段不得引入真实数据").toBe(true);
    const teamIds = new Set(gameidSample.battle_detail.team_details.map((value) => value.teamId));
    expect(players.every((player) => teamIds.has(player.teamId))).toBe(true);
    expect(gamelistSample.battles.filter((value) => value.game_id === gameidSample.battle_detail.game_id).length).toBe(1);
  });

  it("脱敏不改变 schema、字段类型及任何非身份数据", () => {
    const value = JSON.parse(JSON.stringify(gameidSample)) as typeof gameidSample;
    value.openid = "<openid:string>";
    for (const player of value.battle_detail.player_details) {
      player.openid = "<openid:string>";
      player.name = "<name:string>";
    }
    // Fingerprint captured before redaction with only these identity values elided.
    const fingerprint = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(fingerprint).toBe("daecdc78ea379d1baa80bc3cdd4b9a07e6831080a23bf3173aa5bdce9d23b50a");
  });
});
