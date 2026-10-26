// 生成可直接安装的单文件油猴脚本：dist/userscript/lol-tft.user.js
// 用法：npm run build:userscript（会先构建 lib bundle）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BUNDLE = "dist/lol/lol.umd.js";
const TEMPLATE = "userscript/lol-tft.template.js";
const OUT_DIR = "dist/userscript";
const OUT = OUT_DIR + "/lol-tft.user.js";

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
const bundle = readFileSync(BUNDLE, "utf8");

if (!template.includes("/*__BUNDLE__*/")) {
  console.error("模板缺少 /*__BUNDLE__*/ 占位符");
  process.exit(1);
}

const output = template
  .replace("__VERSION__", pkg.version)
  .replace("/*__BUNDLE__*/", function () { return bundle; });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, output, "utf8");

const kb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
console.log("已生成 " + OUT + "（" + kb + " KB，含内联 bundle，无需任何外部托管）");
