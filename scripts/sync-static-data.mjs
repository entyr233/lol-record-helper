// 重新生成 src/data/*.json（符文/装备中文名映射）
// 用法: node scripts/sync-static-data.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "data");
mkdirSync(outDir, { recursive: true });

async function syncRunes() {
  const res = await fetch("https://game.gtimg.cn/images/lol/act/img/js/runeList/rune_list.js");
  const raw = await res.json();
  const map = {};
  const iconBase = "https://game.gtimg.cn/images/lol/act/img/rune/";
  for (const [id, v] of Object.entries(raw.rune)) {
    map[id] = { name: v.name, icon: v.icon.startsWith(iconBase) ? v.icon.slice(iconBase.length) : v.icon };
  }
  writeFileSync(join(outDir, "runes.json"), JSON.stringify(map));
  console.log("runes:", Object.keys(map).length);
}

async function syncItems() {
  const versions = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
  const version = versions[0];
  const res = await fetch("https://ddragon.leagueoflegends.com/cdn/" + version + "/data/zh_CN/item.json");
  const raw = await res.json();
  const map = {};
  for (const [id, v] of Object.entries(raw.data)) if (v && v.name) map[id] = v.name;
  writeFileSync(join(outDir, "items.json"), JSON.stringify(map));
  console.log("items:", Object.keys(map).length, "ddragon:", version);
}

await syncRunes();
await syncItems();
