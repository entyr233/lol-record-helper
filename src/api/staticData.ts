import { ref, shallowRef } from "vue";
import { gmGet } from "./transport";
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
export async function ensureDdragonVersion(): Promise<void> {
  if (ddragonVersion.value) return;
  const cached = readCachedVersion();
  if (cached) {
    ddragonVersion.value = cached;
    return;
  }
  try {
    const res = await fetch(DDDRAGON + "/api/versions.json");
    if (!res.ok) return;
    const versions = (await res.json()) as string[];
    const latest = versions && versions[0];
    if (latest) {
      ddragonVersion.value = latest;
      writeCachedVersion(latest);
    }
  } catch {
    /* offline: keep gtimg fallback */
  }
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

/**
 * 拉一次英雄中文名映射（英雄筛选/近期英雄用）。
 * 沙箱里跨域 fetch 会被网络层拦（HTTP 0），所以走 GM GET 公共 CDN 的 hero_list.js。
 */
export function ensureChampionNames(): Promise<void> {
  if (championNames.value) return Promise.resolve();
  if (championNamesRequest) return championNamesRequest;
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
      championNames.value = new Map(entries);
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
