import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [version, source] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version ?? "") || !source) {
  throw new Error("需要安全的版本 tag 和 UI 文件路径");
}
const directory = join("versions", version);
const target = join(directory, "lol-tft-ui.js");
if (existsSync(target) && !readFileSync(target).equals(readFileSync(source))) {
  throw new Error("拒绝覆盖已有版本的不同 UI：" + version);
}
mkdirSync(directory, { recursive: true });
copyFileSync(source, target);
// 保留旧壳引用的根文件；新壳只引用版本目录。
if (!existsSync("lol-tft-ui.js")) copyFileSync(source, "lol-tft-ui.js");
