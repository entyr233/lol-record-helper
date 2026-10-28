// 生成可直接安装的单文件油猴脚本：
// - dist/userscript/lol-tft.user.js（构建产物）
// - userscript/lol-tft.user.js（入库副本，提供 GitHub raw 直装/自动更新地址）
// 用法：npm run build:userscript（会先构建 lib bundle）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BUNDLE = "dist/lol/lol.umd.js";
const TEMPLATE = "userscript/lol-tft.template.js";
const OUT_DIR = "dist/userscript";
const OUT = OUT_DIR + "/lol-tft.user.js";
const REPO_OUT = "userscript/lol-tft.user.js";

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
    (template.match(/^\/\/ @version[ \t]+__VERSION__\r?$/gm) || []).length !== 1 ||
    (template.match(/^[ \t]*var VERSION = "__VERSION__";\r?$/gm) || []).length !== 1 ||
    template.split("/*__BUNDLE__*/").length - 1 !== 1) {
  console.error("模板必须恰含一个元信息版本、一个运行时版本和一个 bundle 占位符");
  process.exit(1);
}

const output = template
  .replaceAll("__VERSION__", () => pkg.version)
  .replace("/*__BUNDLE__*/", () => rawBundle);

if (!output.startsWith("// ==UserScript==") || output.includes("__VERSION__") || output.includes("__BUNDLE__")) {
  console.error("用户脚本起始头无效或仍包含未替换占位符");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, output, "utf8");
// 同时写入入库副本：GitHub raw 地址可直接安装，并由 @updateURL 自动更新
writeFileSync(REPO_OUT, output, "utf8");

const kb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
console.log("已生成 " + OUT + "（" + kb + " KB，含内联 bundle，无需任何外部托管）");
console.log("已同步入库副本 " + REPO_OUT + "（GitHub raw 直装/自动更新）");
