// 生成可直接安装的油猴脚本（轻量菜单壳 + 按需加载的 UI bundle）：
// - dist/userscript/lol-tft.user.js（shell，任意网站注入只注册菜单）
// - dist/userscript/lol-tft-ui.js（UI bundle，@resource 按需加载）
// - userscript/lol-tft.user.js / userscript/lol-tft-ui.js（入库副本，GitHub raw 直装/自动更新）
// 用法：npm run build:userscript（会先构建 lib bundle）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BUNDLE = "dist/lol/lol.umd.js";
const TEMPLATE = "userscript/lol-tft.template.js";
const OUT_DIR = "dist/userscript";
const OUT = OUT_DIR + "/lol-tft.user.js";
const OUT_UI = OUT_DIR + "/lol-tft-ui.js";
const REPO_OUT = "userscript/lol-tft.user.js";
const REPO_UI = "userscript/lol-tft-ui.js";
const MAX_SHELL_BYTES = 64 * 1024;

if (!existsSync(BUNDLE)) {
  console.error("找不到 " + BUNDLE + "，请先运行 npm run build");
  process.exit(1);
}

// 浏览器里没有 Node 全局：产物中一旦出现这些引用，脚本会在执行阶段直接抛错
const rawBundle = readFileSync(BUNDLE, "utf8");
const forbidden = ["process.env", "process.argv", "__dirname", "require("];
const found = forbidden.filter((token) => rawBundle.includes(token));
if (found.length > 0) {
  console.error("构建产物包含浏览器不可用的 Node 引用：" + found.join(", "));
  console.error("请在 vite.config.ts 的 define 中静态替换后重新构建。");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const template = readFileSync(TEMPLATE, "utf8");

if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(pkg.version)) {
  console.error("package.json version 必须是安全的版本号");
  process.exit(1);
}

if (template.split("__VERSION__").length - 1 !== 2 ||
    template.split("__UI_VERSION__").length - 1 !== 2 ||
    (template.match(/^\/\/ @version[ \t]+__VERSION__\r?$/gm) || []).length !== 1 ||
    (template.match(/^[ \t]*var VERSION = "__VERSION__";\r?$/gm) || []).length !== 1) {
  console.error("模板必须恰含一个元信息版本、一个运行时版本和两个 UI 资源版本占位符");
  process.exit(1);
}

if (template.includes("/*__BUNDLE__*/") || template.includes("__BUNDLE__")) {
  console.error("模板不再接受内联 bundle 占位符（UI 已改为 @resource 按需加载）");
  process.exit(1);
}

if (rawBundle.includes("__VERSION__") || rawBundle.includes("__BUNDLE__")) {
  console.error("UI bundle 中出现保留构建标记，拒绝生成");
  process.exit(1);
}

if (!/^\s*var LolTft\s*=/.test(rawBundle) || !rawBundle.includes("mountLolTft")) {
  console.error("UI bundle 不是预期的 LolTft UMD 产物");
  process.exit(1);
}

const output = template
  .replaceAll("__VERSION__", () => pkg.version)
  .replaceAll("__UI_VERSION__", () => pkg.version);

if (!output.startsWith("// ==UserScript==") || output.includes("__VERSION__") || output.includes("__UI_VERSION__")) {
  console.error("用户脚本起始头无效或仍包含未替换占位符");
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
writeFileSync(REPO_UI, rawBundle, "utf8");

const shellKb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
const uiKb = (Buffer.byteLength(rawBundle, "utf8") / 1024).toFixed(1);
console.log("已生成 " + OUT + "（" + shellKb + " KB，轻量壳，任意网站只注册菜单）");
console.log("已生成 " + OUT_UI + "（" + uiKb + " KB，@resource 按需加载）");
console.log("已同步入库副本 " + REPO_OUT + " / " + REPO_UI + "（GitHub raw 直装/自动更新）");
