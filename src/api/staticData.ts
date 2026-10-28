import { ref, shallowRef } from "vue";
import { gmGet } from "./transport";
import { readStorage, removeStorage, writeStorage } from "../utils/storage";
import runeMap from "../data/runes.json";
import itemMap from "../data/items.json";
import type { ChampionSpell } from "./types";

const CDRAGON_CHAMPION_ICON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/";
const GTIMG_ICON = "https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/";
const DDDRAGON = "https://ddragon.leagueoflegends.com";
const RUNE_ICON_BASE = "https://game.gtimg.cn/images/lol/act/img/rune/";

const RUNES = runeMap as Record<string, { name: string; icon: string }>;
const ITEMS = itemMap as Record<string, string>;

const VERSION_KEY = "lol_tft:ddragon-version";
const VERSION_TTL = 12 * 60 * 60 * 1000;

/** ddragon 版本号：用于让物品图标走版本化、可长缓存的 URL */
export const ddragonVersion = ref<string | null>(null);
let versionRequest: Promise<void> | null = null;

export function getRuneInfo(id: number | string): { name: string; icon: string } | undefined {
  const info = RUNES[String(id)];
  return info ? { ...info, icon: runeIconUrl(info.icon) } : undefined;
}

export function runeIconUrl(icon: string): string {
  return /^https?:\/\//.test(icon) ? icon : RUNE_ICON_BASE + icon;
}

export function getItemName(id: number | string): string | undefined {
  const name = ITEMS[String(id)];
  return name || undefined;
}

export function championIconUrl(id: number | string): string {
  return CDRAGON_CHAMPION_ICON + id + ".png";
}

export function userIconUrl(id: number | string): string {
  // 掌盟头像源（HAR 实证可用且与 wegame 同 id）；wegame 源做后备
  return "https://down.qq.com/lolapp/lol/summoner/profileicon/" + id + ".jpg";
}

export function userIconFallbackUrl(id: number | string): string {
  return GTIMG_ICON + "usericon/" + id + ".png";
}

export function summonSpellIconUrl(id: number | string): string {
  return GTIMG_ICON + "summonability/" + id + ".png";
}

export function itemIconUrl(id: number | string): string {
  if (ddragonVersion.value) {
    return DDDRAGON + "/cdn/" + ddragonVersion.value + "/img/item/" + id + ".png";
  }
  return GTIMG_ICON + "items/" + id + ".png";
}

function readCachedVersion(): string | null {
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: string; t: number };
    if (!parsed || !parsed.v) return null;
    if (Date.now() - parsed.t > VERSION_TTL) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function writeCachedVersion(version: string): void {
  try {
    localStorage.setItem(VERSION_KEY, JSON.stringify({ v: version, t: Date.now() }));
  } catch {
    /* ignore quota / privacy mode */
  }
}

/** 拉取 ddragon 版本号（失败不影响主流程，物品图标会退化为 gtimg） */
export function ensureDdragonVersion(): Promise<void> {
  if (ddragonVersion.value) return Promise.resolve();
  if (versionRequest) return versionRequest;
  const cached = readCachedVersion();
  if (cached) {
    ddragonVersion.value = cached;
    return Promise.resolve();
  }
  versionRequest = (async () => {
    try {
      const res = await fetch(DDDRAGON + "/api/versions.json");
      if (!res.ok) return;
      const versions: unknown = await res.json();
      const latest = Array.isArray(versions) ? versions[0] : null;
      if (typeof latest === "string" && /^\d+\.\d+\.\d+$/.test(latest)) {
        ddragonVersion.value = latest;
        writeCachedVersion(latest);
      }
    } catch {
      /* offline: keep gtimg fallback */
    } finally {
      versionRequest = null;
    }
  })();
  return versionRequest;
}

const spellCache = new Map<number, Promise<ChampionSpell[]>>();

/** 英雄技能图标（懒加载，按英雄缓存） */
export function getChampionSpells(championId: number): Promise<ChampionSpell[]> {
  const cached = spellCache.get(championId);
  if (cached) return cached;
  const task = (async () => {
    const res = await fetch("https://game.gtimg.cn/images/lol/act/img/js/hero/" + championId + ".js");
    if (!res.ok) throw new Error("加载英雄技能数据失败");
    const data = (await res.json()) as { spells?: ChampionSpell[] };
    return data.spells ?? [];
  })();
  spellCache.set(championId, task);
  task.catch(() => spellCache.delete(championId));
  return task;
}

const championNames = shallowRef<ReadonlyMap<number, string> | null>(null);
let championNamesRequest: Promise<void> | null = null;
let championNamesSavedAt = 0;
const CHAMPION_NAMES_KEY = "champion-names-v1";
const CHAMPION_NAMES_TTL = 24 * 60 * 60 * 1000;
interface ChampionNamesCache {
  savedAt: number;
  entries: Array<[number, string]>;
}

/**
 * 拉一次英雄中文名映射（英雄筛选/近期英雄用）。
 * 沙箱里跨域 fetch 会被网络层拦（HTTP 0），所以走 GM GET 公共 CDN 的 hero_list.js。
 */
export function ensureChampionNames(): Promise<void> {
  if (championNamesRequest) return championNamesRequest;
  if (!championNames.value) {
    const cached = readStorage<ChampionNamesCache | null>(CHAMPION_NAMES_KEY, null);
    if (cached && Number.isFinite(cached.savedAt) && Array.isArray(cached.entries) && cached.entries.length > 0
      && cached.entries.every((entry) => Array.isArray(entry) && Number.isFinite(entry[0]) && typeof entry[1] === "string")) {
      championNames.value = new Map(cached.entries);
      championNamesSavedAt = cached.savedAt;
    }
  }
  if (championNames.value && Date.now() - championNamesSavedAt < CHAMPION_NAMES_TTL) return Promise.resolve();
  championNamesRequest = (async () => {
    try {
      const raw = await gmGet("https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js");
      // 文件形态：var heroList = [ {...}, ... ];（或带 window.xxx 前缀）
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start < 0 || end < 0) throw new Error("shape");
      const arr = JSON.parse(raw.slice(start, end + 1)) as Array<{ heroId?: string | number; name?: string }>;
      const entries: Array<[number, string]> = [];
      for (const h of arr) {
        const id = Number(h.heroId);
        if (Number.isFinite(id) && h.name) entries.push([id, h.name]);
      }
      if (!entries.length) throw new Error("empty champion names");
      championNames.value = new Map(entries);
      championNamesSavedAt = Date.now();
      writeStorage(CHAMPION_NAMES_KEY, { savedAt: championNamesSavedAt, entries });
    } catch {
      // 名称加载失败不阻塞页面，下次调用可以重试。
    } finally {
      championNamesRequest = null;
    }
  })();
  return championNamesRequest;
}

/** 英雄数字 id -> 中文名（未加载/未知返回空串） */
export function championName(id: number): string {
  return championNames.value?.get(Number(id)) ?? "";
}

/** 设置页清理静态资料：同时清内存和持久化缓存，下次使用时会重新请求。 */
export function clearStaticDataCache(): void {
  try {
    localStorage.removeItem(VERSION_KEY);
  } catch {
    /* 隐私模式/存储不可用时内存仍可清理 */
  }
  removeStorage(CHAMPION_NAMES_KEY);
  ddragonVersion.value = null;
  versionRequest = null;
  championNames.value = null;
  championNamesSavedAt = 0;
  championNamesRequest = null;
  spellCache.clear();
}
