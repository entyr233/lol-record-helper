/** WeGame trpc 接口返回结构（依据 sample/*.json 实测样本） */

export interface ApiResult {
  error_code?: number | string;
  error_message?: string;
}

export interface ApiEnvelope {
  result?: ApiResult;
}

/** 对局列表项（snake_case） */
export interface BattleSummary {
  game_id: string;
  game_start_time: string;
  game_time_played: number;
  map_id?: number;
  game_queue_id: number;
  was_mvp?: number;
  was_svp?: number;
  was_early_surrender?: number;
  champion_id: number;
  position?: string;
  skin_index?: number;
  game_score?: number;
  team_id?: string;
  win: string;
  kills: number;
  deaths: number;
  assists: number;
  gold_earned?: number;
  was_surrender?: number;
  was_afk?: number;
  most_kills?: number;
  most_assists?: number;
  most_minions_killed?: number;
  most_gold_earned?: number;
  most_damage_dealt_to_champions?: number;
  most_total_damage_taken?: number;
  most_turrets_killed?: number;
  double_kills?: number;
  triple_kills?: number;
  quadra_kills?: number;
  penta_kills?: number;
  unreal_kills?: number;
  team_made_size?: number;
  battle_type?: number;
  win_with_less_teammate?: number;
  /** JSON 字符串：对局时段位快照 {"tier":"1","league_points":"43","rank":"1"} */
  game_level?: string;
  /** 掌盟源对局直接给的模式名（优先于 queue id 映射显示） */
  game_mode_name?: string;
  [key: string]: unknown;
}

/** 对局详情里的玩家（camelCase） */
export interface BattleHonour {
  isSvp?: boolean;
  isMvp?: boolean;
  isPentaKills?: boolean;
}

export interface PlayerDetail {
  openid: string;
  name: string;
  championId: number;
  level: number;
  teamId: string;
  /** 预组队人数：缺失/未知（掌盟源）时为 undefined/null，不要用 1 冒充单人 */
  teamMadeSize?: number | null;
  championsKilled: number;
  numDeaths: number;
  assists: number;
  gameScore: number;
  totalDamageToChampions?: number;
  totalDamageTaken?: number;
  magicDamageToChampions?: number;
  physicalDamageToChampions?: number;
  trueDemageToChampions?: number;
  goldEarned?: number;
  /** 海克斯大乱斗（2400）的海克斯强化 id，普通模式为 0/缺省 */
  playerAugment1?: number;
  playerAugment2?: number;
  playerAugment3?: number;
  playerAugment4?: number;
  playerAugment5?: number;
  playerAugment6?: number;
  minionsKilled?: number;
  neutralMinionsKilled?: number;
  sightWardsBoughtInGame?: number;
  /** 装备位：来源未提供时为 undefined（区别于真实的空装备 0） */
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
  keystoneId?: number;
  perkSubStyle?: number;
  perkStyle?: number;
  summonSpell1Id: number;
  summonSpell2Id: number;
  summonSpell1Cast?: number;
  summonSpell2Cast?: number;
  spell1Cast?: number;
  spell2Cast?: number;
  spell3Cast?: number;
  spell4Cast?: number;
  pentaKills?: number;
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  largestMultiKill?: number;
  wasAfk?: number;
  battleHonour: BattleHonour;
  position?: string;
  puuId?: string;
  lolId?: string;
  /** 掌盟详情数据源额外提供：该玩家的段位与 LP */
  gameLevel?: { tier: number; leaguePoints: string };
  perkStyleUrl?: string;
  /** 来源字段不完整（如掌盟公开源）：缺失字段保持 undefined，不用 0 冒充，UI 显示「未提供」 */
  partial?: boolean;
}

export interface TeamDetail {
  teamId: string;
  win: string;
  /** 2026 响应已不再返回该字段 */
  teamElo?: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalGoldEarned?: number;
  totalBaronKills?: number;
  totalDragonKills?: number;
  totalTurretsKilled?: number;
  isSurrender?: number;
}

export interface BattleDetail {
  /** 被查看玩家的 openid（2026 响应顶层返回） */
  openid?: string;
  area_id: string;
  game_id: string;
  game_start_time: string;
  game_time_played: number;
  map_id: number;
  game_queue_id: number;
  game_mode?: string;
  game_type?: string;
  was_early_surrender?: number;
  team_details: TeamDetail[];
  player_details: PlayerDetail[];
}

export interface Summoner {
  name: string;
  icon_id: number;
  level: number;
  experience?: number;
  praise?: number;
  discredit?: number;
  /** 现任接口返回的赛季段位信息（tier 数字 + 胜点） */
  season?: { tier?: number; win_point?: number | string; queue?: number; [key: string]: unknown };
}

export interface BattleCount {
  total_games: number;
  /** 赛季段位信息（现行接口带 sids:[255] 请求时返回；历史赛季已于 v1.10.1 确认被服务端下线） */
  season_list?: Array<{ sid?: number; tier?: number; win_point?: number | string; [key: string]: unknown }>;
  total_wins: number;
  total_losts: number;
  total_arm_games: number;
  total_arm_wins: number;
  total_arm_losts: number;
  /** 匹配（normal） */
  total_match_games: number;
  total_match_wins: number;
  total_match_losts: number;
  /** 排位（ranked） */
  total_rank_games: number;
  total_rank_wins: number;
  total_rank_losts: number;
}

export interface PlayerSearchResult {
  openid: string;
  icon_id: number;
  level: number;
  area: number;
}

export interface UserKey {
  area: number | string;
  accountType: number | string;
  id: string | number;
}

export interface RqOptions {
  account_type: number;
  area: number;
  id: string;
  from_src: string;
}

export interface GetBattleListResponse extends ApiEnvelope {
  battles: BattleSummary[];
}
export interface GetBattleDetailResponse extends ApiEnvelope {
  openid: string;
  battle_detail: BattleDetail;
}
export interface GetSummonerInfoResponse extends ApiEnvelope {
  summoner: Summoner;
}
export interface GetBattleReportResponse extends ApiEnvelope {
  battle_count: BattleCount;
}
export interface SearchPlayerResponse extends ApiEnvelope {
  players: PlayerSearchResult[];
}

export interface ChampionSpell {
  spellKey: string;
  name: string;
  description: string;
  abilityIconPath: string;
}

/** GetBattleOverview（现任 LOL 助手使用的战绩总览接口，2026 格式） */
export interface OverviewBattle {
  game_id: string;
  game_start_time: number | string;
  game_time_played: number;
  champion_id: number;
  game_score?: number;
  win: string;
  /** 现任格式用 mvp/svp，旧格式是 was_mvp/was_svp，两者都兜住 */
  mvp?: number;
  svp?: number;
  was_mvp?: number;
  was_svp?: number;
  was_afk?: number;
  was_early_surrender?: number;
  tier?: number;
  queue?: number;
  queue_id?: number;
  game_queue_id?: number;
  battle_type?: number;
  /** JSON 字符串：对局时段位快照 {"tier":"1","league_points":"43","rank":"1"} */
  game_level?: string;
  champion?: { name?: string; cname?: string; icon?: string };
  [key: string]: unknown;
}

export interface OverviewSeason {
  sid?: number;
  total?: number;
  wins?: number;
  losses?: number;
  /** 段位数字：0王者 5宗师 6大师 10钻石 15翡翠 20铂金 30黄金 40白银 50黄铜 80黑铁 255未定级 */
  tier?: number;
  win_point?: number | string;
  queue?: number;
  team_tier?: number;
  team_win_point?: number;
  [key: string]: unknown;
}

export interface OverviewDimensional {
  value?: number;
  percent?: number;
}

export interface BattleOverview {
  nick?: string;
  win_rate?: number;
  game_score?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  damage?: number;
  total?: number;
  label?: string;
  season?: OverviewSeason;
  battles?: OverviewBattle[];
  dimensionals?: Record<string, OverviewDimensional>;
}
