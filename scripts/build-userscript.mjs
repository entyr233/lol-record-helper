// 生成可直接安装的油猴脚本（轻量菜单壳 + 按需加载的 UI bundle）：
// - dist/userscript/lol-tft.user.js（shell，任意网站注入只注册菜单）
// - dist/userscript/lol-tft-ui.js（UI bundle，发布时由 Release workflow 上传）
// - userscript/lol-tft.user.js（入库壳，GitHub raw 直装/自动更新）
// 用法：npm run build:userscript（会先构建 lib bundle）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";
import { resolve } from "node:path";

const BUNDLE = "dist/lol/lol.umd.js";

const MANIFEST = "userscript/manifest.json";
const SHELL = "userscript/src/shell.ts";
const OUT_DIR = "dist/userscript";
const OUT = OUT_DIR + "/lol-tft.user.js";
const OUT_UI = OUT_DIR + "/lol-tft-ui.js";
const REPO_OUT = "userscript/lol-tft.user.js";

const MAX_SHELL_BYTES = 64 * 1024;
const MAX_UI_BYTES = 340 * 1024;

if (!existsSync(BUNDLE)) {
  console.error("找不到 " + BUNDLE + "，请先运行 npm run build");
  process.exit(1);
}

// 浏览器里没有 Node 全局：产物中一旦出现这些引用，脚本会在执行阶段直接抛错
const rawBundle = readFileSync(BUNDLE, "utf8").replace(/\r\n/g, "\n");
const uiSha256 = createHash("sha256").update(rawBundle, "utf8").digest("hex");
const forbidden = ["process.env", "process.argv", "__dirname", "require("];
const found = forbidden.filter((token) => rawBundle.includes(token));
if (found.length > 0) {
  console.error("构建产物包含浏览器不可用的 Node 引用：" + found.join(", "));
  console.error("请在 vite.config.ts 的 define 中静态替换后重新构建。");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
// 元信息来自 manifest；拒绝换行，避免意外生成额外的脚本权限。
for (const key of ["name", "namespace", "repo", "uiResource", "description", "author", "icon", "license", "run-at"]) {
  if (typeof manifest[key] !== "string" || !manifest[key].trim() || /[\r\n]/.test(manifest[key])) {
    throw new Error("userscript/manifest.json 字段无效：" + key);
  }
}
for (const key of ["matches", "grants", "connects"]) {
  if (!Array.isArray(manifest[key]) || !manifest[key].length ||
      manifest[key].some((value) => typeof value !== "string" || !value.trim() || /[\r\n]/.test(value))) {
    throw new Error("userscript/manifest.json 列表无效：" + key);
  }
}
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(manifest.repo) || !/^[a-zA-Z0-9_-]+$/.test(manifest.uiResource)) {
  throw new Error("manifest 仓库或资源名称无效");
}

if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(pkg.version)) {
  console.error("package.json version 必须是安全的版本号");
  process.exit(1);
}
const runtime = buildSync({
  entryPoints: [resolve(SHELL)],
  tsconfigRaw: {},
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2018",
  charset: "utf8",
  legalComments: "none",
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __REPO__: JSON.stringify(manifest.repo),
    __UI_RESOURCE__: JSON.stringify(manifest.uiResource),
    __UI_SHA256__: JSON.stringify(uiSha256)
  },
  write: false,
  logLevel: "silent"
}).outputFiles[0].text;

if (rawBundle.includes("__VERSION__") || rawBundle.includes("__BUNDLE__")) {
  console.error("UI bundle 中出现保留构建标记，拒绝生成");
  process.exit(1);
}

if (!/^\s*var LolTft\s*=/.test(rawBundle) || !rawBundle.includes("mountLolTft")) {
  console.error("UI bundle 不是预期的 LolTft UMD 产物");
  process.exit(1);
}

const home = "https://github.com/" + manifest.repo;
const installUrl = "https://raw.githubusercontent.com/" + manifest.repo + "/master/userscript/lol-tft.user.js";
const metadata = [
  ["name", manifest.name], ["namespace", manifest.namespace], ["version", pkg.version],
  ["description", manifest.description], ["author", manifest.author],
  ["homepage", home], ["homepageURL", home], ["supportURL", home + "/issues"], ["source", home],
  ...manifest.matches.map((value) => ["match", value]),
  ["icon", manifest.icon], ["license", manifest.license],
  ...manifest.grants.map((value) => ["grant", value]),
  ["resource", manifest.uiResource + " " + home + "/releases/download/v" + pkg.version + "/lol-tft-ui.js"],
  ...manifest.connects.map((value) => ["connect", value]),
  ["run-at", manifest["run-at"]], ["downloadURL", installUrl], ["updateURL", installUrl]
];
const header = ["// ==UserScript==", ...metadata.map(([key, value]) => "// @" + key.padEnd(13) + value), "// ==/UserScript=="];
const output = header.join("\n") + "\n\n" + runtime;
if (forbidden.some((token) => runtime.includes(token)) ||
    ["__VERSION__", "__UI_SHA256__", "__REPO__", "__UI_RESOURCE__"].some((token) => output.includes(token))) {
  throw new Error("用户脚本包含 Node 引用或未替换的构建标记");
}

if (Buffer.byteLength(rawBundle, "utf8") > MAX_UI_BYTES) {
  console.error("UI bundle 超过 " + MAX_UI_BYTES + " 字节，请检查是否引入重复依赖");
  process.exit(1);
}

if (Buffer.byteLength(output, "utf8") > MAX_SHELL_BYTES) {
  console.error("用户脚本壳超过 " + MAX_SHELL_BYTES + " 字节，UI bundle 可能又被内联进来了");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, output, "utf8");
writeFileSync(OUT_UI, rawBundle, "utf8");
// 入库副本：GitHub raw 地址可直接安装，并由 @updateURL / @resource 自动更新
writeFileSync(REPO_OUT, output, "utf8");


const shellKb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
const uiKb = (Buffer.byteLength(rawBundle, "utf8") / 1024).toFixed(1);
console.log("已生成 " + OUT + "（" + shellKb + " KB，轻量壳，任意网站只注册菜单）");
console.log("已生成 " + OUT_UI + "（" + uiKb + " KB，gzip " + (gzipSync(rawBundle).length / 1024).toFixed(1) + " KB，@resource 按需加载，SHA-256 " + uiSha256.slice(0, 16) + "…）");
console.log("已同步壳入库副本 " + REPO_OUT + "；UI 由 Release workflow 上传，不再写入仓库");
