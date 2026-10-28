import type { PlayerDetail } from "../api/types";

export const DAMAGE_KEYS = [
  "totalDamageToChampions", "totalDamageTaken", "magicDamageToChampions",
  "physicalDamageToChampions", "trueDemageToChampions"
] as const;
export type DamageKey = (typeof DAMAGE_KEYS)[number];

export interface PlayerStatistics {
  maxDamage: Record<DamageKey, number>;
  teams: Map<string, { kills: number; damage: number }>;
}

/** 同一场比赛的各伤害最大值与队伍合计，供所有玩家行共用。 */
export function summarizePlayers(players: PlayerDetail[]): PlayerStatistics {
  const maxDamage: Record<DamageKey, number> = {
    totalDamageToChampions: 0, totalDamageTaken: 0, magicDamageToChampions: 0,
    physicalDamageToChampions: 0, trueDemageToChampions: 0
  };
  const teams: PlayerStatistics["teams"] = new Map();
  for (const player of players) {
    for (const key of DAMAGE_KEYS) {
      const value = Number(player[key]);
      if (Number.isFinite(value) && value > maxDamage[key]) maxDamage[key] = value;
    }
    const team = teams.get(player.teamId) ?? { kills: 0, damage: 0 };
    team.kills += player.championsKilled || 0;
    team.damage += player.totalDamageToChampions || 0;
    teams.set(player.teamId, team);
  }
  return { maxDamage, teams };
}
