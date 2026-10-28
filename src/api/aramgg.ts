/**
 * ARAMGG（aramgg.com / data.dtodo.cn）海克斯大乱斗数据接入。
 *
 * - 榜单数据走公开客户端接口 /api/client/v1/*（无需 API Key，限流）；
 * - 单英雄推荐强化/出装走开发者接口 /api/v1/zh-CN/champions/{id}.json（需要 API Key，
 *   每次 2 credits，见 developer.html）；Key 只存本机 localStorage，不写进代码或仓库。
 * - 数据比例字段均为 0-1 小数。
 */
import { readStorage, writeStorage } from "../utils/storage";

const ORIGIN = "https://data.dtodo.cn";
const CLIENT_API = ORIGIN + "/api/client/v1";
const DATA_API = ORIGIN + "/api/v1/zh-CN";
const API_KEY_STORAGE = "aramgg-api-key";
const OVERVIEW_CACHE_STORAGE = "aramgg-overview";
const CHAMPION_CACHE_PREFIX = "aramgg-champion:";
const OVERVIEW_TTL_MS = 6 * 60 * 60 * 1000;
const CHAMPION_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

export class AramggError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AramggError";
    this.status = status;
  }
}

export interface AramggStats {
  tier: number | null;
  wins: number | null;
  games: number | null;
  winRate: number | null;
  pickRate: number | null;
  gamePatch: string | null;
  date: string | null;
  source: string | null;
  region: string | null;
  /** 单英雄推荐顺序（仅 /champions/{id}.json 的 augments 返回） */
  rank?: number | null;
  total?: number | null;
}

export interface AramggTopChampion {
  id: number;
  name: string;
  iconUrl: string | null;
  rank?: number | null;
  stats?: AramggStats | null;
}

export interface AramggAugment {
  id: number;
  name: string;
  rarity: number | null;
  rarityName: string | null;
  rarityDisplayName: string | null;
  iconUrl: string | null;
  description: string | null;
  tooltip: string | null;
  stats: AramggStats | null;
  topChampions: AramggTopChampion[];
}

export interface AramggChampion {
  id: number;
  alias: string | null;
  name: string;
  title: string | null;
  roles: string[];
  iconUrl: string;
  stats: AramggStats | null;
}

export interface AramggOverview {
  dataVersion: string;
  gamePatch: string;
  generatedAt: string | null;
  augments: AramggAugment[];
  champions: AramggChampion[];
}

export interface AramggItemRef {
  id: number;
  name?: string;
  iconUrl?: string;
}

export interface AramggBuild {
  tags: string[];
  games: number | null;
  wins: number | null;
  pickRate: number | null;
  winRate: number | null;
  coreItems: AramggItemRef[];
  startingItems: AramggItemRef[];
  situationalItems: AramggItemRef[];
  summonerSpells: Array<{ spells: AramggItemRef[]; winRate: number | null; pickRate: number | null }>;
  skillOrders: Array<{ skillKeys: string[]; winRate: number | null; pickRate: number | null }>;
}

export interface AramggChampionDetail {
  champion: AramggChampion | null;
  augments: AramggAugment[];
  builds: AramggBuild[];
}

export interface AramggOverviewCache {
  savedAt: number;
  dataVersion: string;
  overview: AramggOverview;
}

/* ------------------------------ API Key ------------------------------ */

export function getAramggApiKey(): string {
  return String(readStorage<string>(API_KEY_STORAGE, "") || "").trim();
}

export function hasAramggApiKey(): boolean {
  return getAramggApiKey().length > 0;
}

export function setAramggApiKey(key: string): void {
  writeStorage(API_KEY_STORAGE, key.trim());
}

export function clearAramggApiKey(): void {
  writeStorage(API_KEY_STORAGE, "");
}

/* ------------------------------ 数据解析 ------------------------------ */

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseStats(raw: unknown): AramggStats | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  return {
    tier: num(v.tier),
    wins: num(v.wins),
    games: num(v.games),
    winRate: num(v.winRate),
    pickRate: num(v.pickRate),
    gamePatch: str(v.gamePatch),
    date: str(v.date),
    source: str(v.source),
    region: str(v.region),
    rank: num(v.rank),
    total: num(v.total)
  };
}

function parseTopChampions(raw: unknown): AramggTopChampion[] {
  if (!Array.isArray(raw)) return [];
  const list: AramggTopChampion[] = [];
  for (const entry of raw) {
    const v = (entry ?? {}) as Record<string, unknown>;
    const id = num(v.id);
    const name = str(v.name);
    if (id === null || !name) continue;
    list.push({ id, name, iconUrl: str(v.iconUrl), rank: num(v.rank), stats: parseStats(v.stats) });
  }
  return list;
}

export function parseAugment(raw: unknown): AramggAugment | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = num(v.id);
  const name = str(v.name);
  if (id === null || !name) return null;
  return {
    id,
    name,
    rarity: num(v.rarity),
    rarityName: str(v.rarityName),
    rarityDisplayName: str(v.rarityDisplayName),
    iconUrl: str(v.iconUrl),
    description: stripHtml(str(v.description)),
    tooltip: stripHtml(str(v.tooltip)),
    stats: parseStats(v.stats),
    topChampions: parseTopChampions(v.topChampions)
  };
}

export function parseChampion(raw: unknown): AramggChampion | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = num(v.id);
  const name = str(v.name);
  if (id === null || !name) return null;
  const roles = Array.isArray(v.roles) ? v.roles.filter((role): role is string => typeof role === "string") : [];
  return {
    id,
    alias: str(v.alias),
    name,
    title: str(v.title),
    roles,
    iconUrl: str(v.iconUrl) ?? "https://cdn.dtodo.cn/hextech/champion-icons/" + id + ".png",
    stats: parseStats(v.stats)
  };
}

export function parseOverview(configRaw: unknown, augmentsRaw: unknown, championsRaw: unknown): AramggOverview {
  const config = (configRaw ?? {}) as Record<string, unknown>;
  const dataVersion = str(config.dataVersion);
  if (!dataVersion) throw new AramggError(500, "ARAMGG 配置缺少 dataVersion");
  const augments = Array.isArray((augmentsRaw as { data?: unknown })?.data)
    ? ((augmentsRaw as { data: unknown[] }).data.map(parseAugment).filter((entry): entry is AramggAugment => entry !== null))
    : [];
  const champions = Array.isArray((championsRaw as { data?: unknown })?.data)
    ? ((championsRaw as { data: unknown[] }).data.map(parseChampion).filter((entry): entry is AramggChampion => entry !== null))
    : [];
  if (!augments.length || !champions.length) throw new AramggError(500, "ARAMGG 榜单数据为空");
  return {
    dataVersion,
    gamePatch: str(config.gamePatch) ?? dataVersion,
    generatedAt: str(config.generatedAt),
    augments,
    champions
  };
}

function parseItemRef(raw: unknown): AramggItemRef | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = num(v.id);
  if (id === null) return null;
  return { id, name: str(v.name) ?? undefined, iconUrl: str(v.iconUrl) ?? undefined };
}

function parseItemRefs(raw: unknown): AramggItemRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseItemRef).filter((entry): entry is AramggItemRef => entry !== null);
}

function parseBuild(raw: unknown): AramggBuild | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const tags = Array.isArray(v.tags) ? v.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const spells = Array.isArray(v.summonerSpells)
    ? v.summonerSpells
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          const list = parseItemRefs(item.spells);
          if (!list.length) return null;
          return { spells: list, winRate: num(item.winRate), pickRate: num(item.pickRate) };
        })
        .filter((entry): entry is { spells: AramggItemRef[]; winRate: number | null; pickRate: number | null } => entry !== null)
    : [];
  const skillOrders = Array.isArray(v.skillOrders)
    ? v.skillOrders
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          const keys = Array.isArray(item.skillKeys) ? item.skillKeys.filter((key): key is string => typeof key === "string") : [];
          if (!keys.length) return null;
          return { skillKeys: keys, winRate: num(item.winRate), pickRate: num(item.pickRate) };
        })
        .filter((entry): entry is { skillKeys: string[]; winRate: number | null; pickRate: number | null } => entry !== null)
    : [];
  return {
    tags,
    games: num(v.games),
    wins: num(v.wins),
    pickRate: num(v.pickRate),
    winRate: num(v.winRate),
    coreItems: parseItemRefs(v.coreItems),
    startingItems: parseItemRefs(v.startingItems),
    situationalItems: parseItemRefs(v.situationalItems),
    summonerSpells: spells,
    skillOrders
  };
}

export function parseChampionDetail(raw: unknown): AramggChampionDetail {
  const payload = (raw ?? {}) as { data?: Record<string, unknown> };
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const champion = parseChampion(data.champion);
  const augments = Array.isArray(data.augments)
    ? data.augments.map(parseAugment).filter((entry): entry is AramggAugment => entry !== null)
    : [];
  const builds = Array.isArray(data.builds)
    ? data.builds.map(parseBuild).filter((entry): entry is AramggBuild => entry !== null)
    : [];
  return { champion, augments, builds };
}

/* ------------------------------ 请求与缓存 ------------------------------ */

interface GmRequestDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  onload?: (response: { status: number; responseText: string }) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}

function statusError(status: number): AramggError {
  if (status === 401) return new AramggError(401, "ARAMGG API Key 无效或已过期");
  if (status === 429) return new AramggError(429, "ARAMGG 请求过于频繁或额度用尽");
  return new AramggError(status, "ARAMGG 请求失败（HTTP " + status + "）");
}

/** 用户脚本环境：带 Authorization 的跨域请求走 GM_xmlhttpRequest，避免预检失败 */
function gmGetJson(url: string, headers: Record<string, string>): Promise<unknown> | null {
  const gm = (globalThis as unknown as { GM_xmlhttpRequest?: (details: GmRequestDetails) => void }).GM_xmlhttpRequest;
  if (typeof gm !== "function") return null;
  return new Promise((resolve, reject) => {
    gm({
      method: "GET",
      url,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
      onload: (response) => {
        const status = Number(response.status) || 200;
        if (status < 200 || status >= 300) {
          reject(statusError(status));
          return;
        }
        try {
          resolve(JSON.parse(String(response.responseText || "{}")) as unknown);
        } catch {
          reject(new AramggError(0, "ARAMGG 响应解析失败"));
        }
      },
      onerror: () => reject(new AramggError(0, "ARAMGG 网络请求失败")),
      ontimeout: () => reject(new AramggError(0, "ARAMGG 请求超时"))
    });
  });
}

async function getJson(url: string, headers: Record<string, string> = {}, useGm = false): Promise<unknown> {
  if (useGm) {
    const gmTask = gmGetJson(url, { Accept: "application/json", ...headers });
    if (gmTask) return gmTask;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal
    });
    if (!res.ok) throw statusError(res.status);
    return (await res.json()) as unknown;
  } catch (error) {
    if (error instanceof AramggError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AramggError(0, "ARAMGG 请求超时");
    throw new AramggError(0, "ARAMGG 网络请求失败");
  } finally {
    clearTimeout(timer);
  }
}

let memoryOverview: AramggOverviewCache | null = null;
let overviewInflight: Promise<AramggOverview> | null = null;
const memoryChampions = new Map<number, AramggChampionDetail>();

function readOverviewCache(): AramggOverviewCache | null {
  if (memoryOverview) return memoryOverview;
  const cached = readStorage<AramggOverviewCache | null>(OVERVIEW_CACHE_STORAGE, null);
  if (!cached || typeof cached.savedAt !== "number" || !cached.overview?.dataVersion) return null;
  memoryOverview = cached;
  return cached;
}

function writeOverviewCache(overview: AramggOverview): AramggOverviewCache {
  const cache: AramggOverviewCache = { savedAt: Date.now(), dataVersion: overview.dataVersion, overview };
  memoryOverview = cache;
  writeStorage(OVERVIEW_CACHE_STORAGE, cache);
  return cache;
}

/** 拉取公开榜单（config → augments.json + champions.json），内存 + localStorage 缓存 */
export async function fetchAramggOverview(force = false): Promise<AramggOverview> {
  if (!force) {
    const cached = readOverviewCache();
    if (cached && Date.now() - cached.savedAt < OVERVIEW_TTL_MS) return cached.overview;
    if (overviewInflight) return overviewInflight;
  }
  const task = (async () => {
    const config = (await getJson(CLIENT_API + "/config")) as Record<string, unknown>;
    const dataVersion = str(config.dataVersion);
    if (!dataVersion) throw new AramggError(500, "ARAMGG 配置缺少 dataVersion");
    const [augments, champions] = await Promise.all([
      getJson(CLIENT_API + "/data/" + encodeURIComponent(dataVersion) + "/augments.json"),
      getJson(CLIENT_API + "/data/" + encodeURIComponent(dataVersion) + "/champions.json")
    ]);
    const overview = parseOverview(config, augments, champions);
    writeOverviewCache(overview);
    return overview;
  })();
  overviewInflight = task;
  try {
    return await task;
  } finally {
    if (overviewInflight === task) overviewInflight = null;
  }
}

/** 单英雄推荐强化/出装：需要 API Key，按 dataVersion + 英雄缓存 */
export async function fetchAramggChampionDetail(championId: number, options: { force?: boolean } = {}): Promise<AramggChampionDetail> {
  const key = getAramggApiKey();
  if (!key) throw new AramggError(401, "未配置 ARAMGG API Key：请先在「海克斯数据」里填写");
  const version = readOverviewCache()?.dataVersion ?? "";
  const cacheKey = CHAMPION_CACHE_PREFIX + version + ":" + championId;
  const memory = memoryChampions.get(championId);
  if (memory && !options.force) return memory;
  if (!options.force) {
    const cached = readStorage<{ savedAt: number; detail: AramggChampionDetail } | null>(cacheKey, null);
    if (cached && Date.now() - cached.savedAt < CHAMPION_TTL_MS) {
      memoryChampions.set(championId, cached.detail);
      return cached.detail;
    }
  }
  const raw = await getJson(DATA_API + "/champions/" + championId + ".json", { Authorization: "Bearer " + key }, true);
  const detail = parseChampionDetail(raw);
  memoryChampions.set(championId, detail);
  writeStorage(cacheKey, { savedAt: Date.now(), detail });
  return detail;
}

/** 测试/调试用：清空内存缓存（localStorage 不动） */
export function clearAramggMemoryCache(): void {
  memoryOverview = null;
  overviewInflight = null;
  memoryChampions.clear();
}
