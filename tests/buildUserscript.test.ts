// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/build-userscript.mjs", import.meta.url));
const template = readFileSync(new URL("../userscript/lol-tft.template.js", import.meta.url), "utf8");
const tempParent = realpathSync(tmpdir());
let root: string;
const bundle = 'var LolTft = { mountLolTft: function () {}, mountHelperLogin: function () {} }; var literal = "$& $$ $` $\' __OTHER_TOKEN__";';
const uiHash = createHash("sha256").update(bundle.replace(/\r\n/g, "\n"), "utf8").digest("hex");

beforeEach(() => {
  root = mkdtempSync(join(tempParent, "lol-tft-build-test-"));
  mkdirSync(join(root, "dist/lol"), { recursive: true });
  mkdirSync(join(root, "userscript"));
  writeFileSync(join(root, "dist/lol/lol.umd.js"), bundle);
  writeFileSync(join(root, "userscript/lol-tft.template.js"), template);
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3-beta.1+test" }));
});

afterEach(() => {
  // Only remove the exact temporary directory created by this test, never repo paths.
  const target = realpathSync(root);
  if (dirname(target) !== tempParent || !basename(target).startsWith("lol-tft-build-test-")) {
    throw new Error("Unexpected temporary build directory");
  }
  rmSync(target, { recursive: true });
});

function build() {
  return spawnSync(process.execPath, [script], {
    cwd: root, encoding: "utf8", env: { ...process.env, LOL_TFT_COOKIE: "" }
  });
}

function outputPath() { return resolve(root, "dist/userscript/lol-tft.user.js"); }
function outputUiPath() { return resolve(root, "dist/userscript/lol-tft-ui.js"); }

describe("userscript packaging CLI", () => {
  it("生成轻量 shell 与独立 UI bundle，版本占位符全部替换", () => {
    const result = build();
    expect(result.status).toBe(0);
    const output = readFileSync(outputPath(), "utf8");
    expect(output).toContain("// @version      1.2.3-beta.1+test");
    expect(output).toContain('var VERSION = "1.2.3-beta.1+test";');
    expect(output).toContain("@resource     lol-tft-ui");
    expect(output).toContain("/v1.2.3-beta.1+test/userscript/lol-tft-ui.js");
    expect(output).toContain('var UI_SHA256 = "' + uiHash + '";');
    expect(output).not.toContain(bundle);
    expect(output).not.toContain("__VERSION__");
    expect(output).not.toContain("__UI_VERSION__");
    expect(output).not.toContain("__UI_SHA256__");
    expect(output).not.toContain("__BUNDLE__");
    expect(output.startsWith("// ==UserScript==")).toBe(true);
    expect(Buffer.byteLength(output, "utf8")).toBeLessThan(64 * 1024);
    expect(() => new Function(output)).not.toThrow();

    const ui = readFileSync(outputUiPath(), "utf8");
    expect(ui).toBe(bundle);
    expect(readFileSync(join(root, "userscript/lol-tft.user.js"), "utf8")).toBe(output);
    expect(readFileSync(join(root, "userscript/lol-tft-ui.js"), "utf8")).toBe(ui);
  });

  it.each(["missing-version", "extra-version", "wrong-version-location", "missing-ui-version", "missing-ui-sha", "inline-bundle", "bad-header"])(
    "模板 %s 时拒绝生成，保留已有输出", (kind) => {
      let invalid = template;
      if (kind === "missing-version") invalid = template.replace("__VERSION__", "1.0.0");
      if (kind === "extra-version") invalid += "\n// __VERSION__";
      if (kind === "wrong-version-location") invalid = template.replace("var VERSION =", "var OTHER =");
      if (kind === "missing-ui-version") invalid = template.split("__UI_VERSION__").join("1.0.0");
      if (kind === "missing-ui-sha") invalid = template.split("__UI_SHA256__").join("0".repeat(64));
      if (kind === "inline-bundle") invalid += "\n/*__BUNDLE__*/";
      if (kind === "bad-header") invalid = "\uFEFF" + template;
      writeFileSync(join(root, "userscript/lol-tft.template.js"), invalid);
      mkdirSync(dirname(outputPath()), { recursive: true });
      writeFileSync(outputPath(), "existing output");
      writeFileSync(outputUiPath(), "existing ui");
      expect(build().status).toBe(1);
      expect(readFileSync(outputPath(), "utf8")).toBe("existing output");
      expect(readFileSync(outputUiPath(), "utf8")).toBe("existing ui");
    }
  );

  it("不接受能破坏元信息或 JavaScript 字面量的版本值", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: '1.0.0";\n// @grant unsafeWindow' }));
    expect(build().status).toBe(1);
    expect(existsSync(outputPath())).toBe(false);
    expect(existsSync(outputUiPath())).toBe(false);
  });

  it.each([
    ["Node 引用", bundle + '\nvar bad = process.env.NODE_ENV;'],
    ["保留构建标记", bundle + '\nvar reserved = "__VERSION__";'],
    ["不是 LolTft UMD", "var Other = {};"]
  ])("UI bundle 出现%s时拒绝生成", (_label, invalidBundle) => {
    writeFileSync(join(root, "dist/lol/lol.umd.js"), invalidBundle);
    expect(build().status).toBe(1);
    expect(existsSync(outputPath())).toBe(false);
    expect(existsSync(outputUiPath())).toBe(false);
  });

  it("README 指向实际生成文件和安装入口", () => {
    const readme = readFileSync(new URL("../readme.md", import.meta.url), "utf8");
    expect(readme).toContain("dist/userscript/lol-tft.user.js");
    expect(readme).toContain("https://raw.githubusercontent.com/entyr233/lol-record-helper/master/userscript/lol-tft.user.js");
    expect(readme).toContain("https://greasyfork.org/zh-CN/scripts/454184");
  });
});
