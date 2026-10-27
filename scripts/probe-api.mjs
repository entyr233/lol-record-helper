// 用一次真实 WeGame cookie 探测 pallas 接口族里还有哪些方法可用（用于找段位/rank）
//
// 用法：
//   node scripts/probe-api.mjs "<cookie>"
//   set LOL_TFT_COOKIE=<cookie> && node scripts/probe-api.mjs
//   （或把 cookie 存到 .lol-tft-cookie.txt，脚本会自动读取，该文件已被 gitignore）
//
// cookie 获取：浏览器登录 https://www.wegame.com.cn/ ，F12 -> Network -> 任意请求 ->
//   Request Headers -> Cookie，复制整行。

import { existsSync, readFileSync } from "node:fs";

const BASE = "https://www.wegame.com.cn/api/v1/wegame.pallas.game.LolBattle/";
const CANDIDATES = [
  "GetSummonerRank", "GetRankInfo", "GetSummonerDetail", "GetSummonerCard", "GetLadderInfo",
  "GetRankList", "GetSummonerTier", "GetBattleSummary", "GetSummonerOverview", "GetProfile",
  "GetBattleStats", "GetChampionStats", "GetSummonerStats", "GetSeasonInfo", "GetRank",
  "GetSummonerTag", "GetBattleTeam", "GetBattleTimeline", "GetSummonerHonour", "GetBattleReportV2"
];
const KNOWN = ["GetSummonerInfo", "GetBattleReport", "GetBattleList", "GetBattleDetail", "SearchPlayer"];

function loadCookie() {
  if (process.argv[2]) return process.argv[2].trim();
  if (process.env.LOL_TFT_COOKIE) return process.env.LOL_TFT_COOKIE.trim();
  if (existsSync(".lol-tft-cookie.txt")) return readFileSync(".lol-tft-cookie.txt", "utf8").trim();
  return "";
}

async function call(cookie, method, body) {
  try {
    const res = await fetch(BASE + method, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "trpc-caller": "wegame.pallas.web.LolBattle",
        referer: "https://www.wegame.com.cn/ioi",
        origin: "https://www.wegame.com.cn",
        cookie
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const r = data.result ?? {};
    return { http: res.status, code: r.error_code, message: r.error_message || "", raw: data };
  } catch (err) {
    return { http: 0, code: "ERR", message: String(err).slice(0, 80) };
  }
}

const cookie = loadCookie();
if (!cookie) {
  console.error("缺少 cookie。用法：node scripts/probe-api.mjs \"<cookie>\"");
  process.exit(1);
}

const probeBody = { account_type: 2, area: 1, id: "1", from_src: "lol_helper", count: 10, offset: 0, game_id: "1" };
console.log("== 1. 校验 cookie（已知方法）==");
for (const method of KNOWN) {
  const r = await call(cookie, method, probeBody);
  const ok = r.code !== 8000102;
  console.log("  " + method.padEnd(20), String(r.code).padEnd(8), ok ? "cookie 有效" : "仍未登录", r.message ? "| " + r.message : "");
}

console.log("\n== 2. 探测未知方法（8000102 = 不存在/未授权；其它码 = 方法存在）==");
const found = [];
for (const method of CANDIDATES) {
  const r = await call(cookie, method, probeBody);
  const exists = r.code !== 8000102 && r.code !== "ERR";
  if (exists) found.push(method);
  console.log("  " + method.padEnd(22), String(r.code).padEnd(8), exists ? "★ 可能可用" : "-", r.message ? "| " + r.message : "");
}

console.log("\n== 结论 ==");
if (found.length) {
  console.log("疑似存在的方法：" + found.join(", "));
  console.log("下一步：把其中一个方法的原始响应贴给开发，用于确认是否包含段位字段（rank/tier/lp）。");
} else {
  console.log("没有探测到额外方法。段位可能需要从 WeGame 客户端接口取（网页接口族只提供对局数据）。");
}
