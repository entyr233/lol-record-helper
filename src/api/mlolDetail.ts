import { ApiError } from "./errors";
import { postForm } from "./transport";
import type { BattleDetail, PlayerDetail, TeamDetail } from "./types";

const MLOL_DETAIL_URL = "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5";

export interface MlolDetailInput {
  gameId: string;
  areaId: number | string;
  startTime?: number | string;
  uuid?: string;
}

interface MlolPlayer {
  uuid?: string;
  puuid?: string;
  name?: string;
  team_id?: string | number;
  champion_id?: number;
  level?: number;
  champions_killed?: number;
  num_deaths?: number;
  assists?: number;
  game_score?: number;
  gold_earned?: number;
  minions_killed?: number;
  summon_spell1_id?: number;
  summon_spell2_id?: number;
  total_damage_dealt_to_champions?: number;
  total_damage_taken?: number;
  magic_damage_dealt_to_champions?: number;
  physical_damage_dealt_to_champions?: number;
  true_damage_to_champions?: number;
  item0?: number; item1?: number; item2?: number; item3?: number; item4?: number; item5?: number; item6?: number;
  perk_style_url?: string;
  perkSubStyle?: number;
  is_mvp?: number; is_svp?: number;
  game_level?: { tier?: string | number; league_points?: number | string; rank?: number | string };
  position?: string;
  [key: string]: unknown;
}

interface MlolTeamSummary {
  team_id?: string | number;
  champions_killed?: number;
  total_deaths?: number;
  num_deaths?: number;
  total_damage_dealt_to_champions?: number;
  [key: string]: unknown;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function mapPlayer(p: MlolPlayer): PlayerDetail {
  return {
    openid: String(p.puuid ?? p.uuid ?? ""),
    name: String(p.name ?? ""),
    championId: num(p.champion_id),
    level: num(p.level),
    teamId: String(p.team_id ?? ""),
    teamMadeSize: 1,
    championsKilled: num(p.champions_killed),
    numDeaths: num(p.num_deaths),
    assists: num(p.assists),
    gameScore: num(p.game_score),
    totalDamageToChampions: num(p.total_damage_dealt_to_champions),
    totalDamageTaken: num(p.total_damage_taken),
    magicDamageToChampions: num(p.magic_damage_dealt_to_champions),
    physicalDamageToChampions: num(p.physical_damage_dealt_to_champions),
    trueDemageToChampions: num(p.true_damage_to_champions),
    item0: num(p.item0), item1: num(p.item1), item2: num(p.item2), item3: num(p.item3),
    item4: num(p.item4), item5: num(p.item5), item6: num(p.item6),
    keystoneId: 0,
    perkSubStyle: num(p.perkSubStyle),
    summonSpell1Id: num(p.summon_spell1_id),
    summonSpell2Id: num(p.summon_spell2_id),
    battleHonour: { isMvp: !!p.is_mvp, isSvp: !!p.is_svp },
    gameLevel: p.game_level ? { tier: num(p.game_level.tier, 255), leaguePoints: String(p.game_level.league_points ?? "") } : undefined,
    perkStyleUrl: p.perk_style_url ? String(p.perk_style_url) : undefined
  } as PlayerDetail;
}

function teamSummary(players: MlolPlayer[], totals: MlolTeamSummary | undefined, win: boolean): TeamDetail {
  const totalKills = num(totals?.champions_killed) || players.reduce((sum, p) => sum + num(p.champions_killed), 0);
  const totalDeaths = num(totals?.total_deaths ?? totals?.num_deaths) || players.reduce((sum, p) => sum + num(p.num_deaths), 0);
  const totalAssists = players.reduce((sum, p) => sum + num(p.assists), 0);
  return {
    teamId: String(players[0]?.team_id ?? "0"),
    win: win ? "Win" : "Fail",
    teamElo: 0,
    totalKills,
    totalDeaths,
    totalAssists
  };
}

/** 掌盟公开详情接口（需要 qt.qq.com 域的登录 cookie，由 GM 传输自动携带） */
export async function fetchMlolBattleDetail(input: MlolDetailInput): Promise<BattleDetail> {
  const form = new FormData();
  form.append("uuid", input.uuid ?? "");
  form.append("area_id", String(input.areaId));
  form.append("game_id", String(input.gameId));
  form.append("start_time", input.startTime !== undefined ? String(input.startTime) : "");

  let payload: { data?: { info?: Record<string, unknown> }; result?: number; msg?: string; err_msg?: string };
  try {
    const response = await postForm(MLOL_DETAIL_URL, form);
    payload = (await response.json()) as typeof payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("MLOL_NETWORK", "GetBattleDetail(mlol)", "掌盟详情请求失败");
  }

  const info = payload.data?.info as Record<string, unknown> | undefined;
  if (!info) {
    const message = String(payload.msg ?? payload.err_msg ?? "");
    const code = payload.result ?? "MLOL_EMPTY";
    // 1001 = qt.qq.com 域没有登录 cookie：提示去官网登录一次
    if (String(code) === "1001") {
      throw new ApiError(code, "GetBattleDetail(mlol)", "需要 QQ 侧登录态：请在浏览器登录 lol.qq.com 官网后重试");
    }
    throw new ApiError(code, "GetBattleDetail(mlol)", message || "掌盟详情无数据");
  }

  const myTeam = (info.match as { my_team?: MlolPlayer[]; opponent_team?: MlolPlayer[] } | undefined)?.my_team ?? [];
  const opponentTeam = (info.match as { opponent_team?: MlolPlayer[] })?.opponent_team ?? [];
  const win = !!info.win;
  const teamSummaries = {
    my: info.my_team as MlolTeamSummary | undefined,
    opp: info.opponent_team as MlolTeamSummary | undefined
  };

  return {
    area_id: String(input.areaId),
    game_id: String(input.gameId),
    game_start_time: String(info.start_time_ts ?? input.startTime ?? ""),
    game_time_played: num(info.duration_ts),
    map_id: num(info.battle_map_id),
    game_queue_id: num(info.game_queue_id),
    team_details: [
      teamSummary(myTeam, teamSummaries.my, win),
      teamSummary(opponentTeam, teamSummaries.opp, !win)
    ],
    player_details: [...myTeam, ...opponentTeam].map(mapPlayer)
  };
}
