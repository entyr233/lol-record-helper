// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/stage-ui-fallback.mjs", import.meta.url));
const parent = realpathSync(".");
let root: string;
beforeEach(() => { root = mkdtempSync(join(parent, ".review-tmp-ui-test-")); });
afterEach(() => {
  const target = realpathSync(root);
  if (dirname(target) !== parent || !basename(target).startsWith(".review-tmp-ui-test-")) throw new Error("Unexpected test directory");
  rmSync(target, { recursive: true });
});
function stage(version: string, content: string) {
  const source = join(root, "input.js");
  writeFileSync(source, content);
  return spawnSync(process.execPath, [script, version, source], { cwd: root, encoding: "utf8" });
}
it("发布下一版本后仍保留历史内容和旧壳根文件", () => {
  expect(stage("v1.0.0", "old-ui").status).toBe(0);
  expect(stage("v1.1.0", "new-ui").status).toBe(0);
  expect(readFileSync(join(root, "versions/v1.0.0/lol-tft-ui.js"), "utf8")).toBe("old-ui");
  expect(readFileSync(join(root, "versions/v1.1.0/lol-tft-ui.js"), "utf8")).toBe("new-ui");
  expect(readFileSync(join(root, "lol-tft-ui.js"), "utf8")).toBe("old-ui");
});
it("相同版本可以重试，不允许不同内容覆盖已有版本", () => {
  expect(stage("v1.0.0", "original").status).toBe(0);
  expect(stage("v1.0.0", "original").status).toBe(0);
  expect(stage("v1.0.0", "different").status).not.toBe(0);
  expect(readFileSync(join(root, "versions/v1.0.0/lol-tft-ui.js"), "utf8")).toBe("original");
});
