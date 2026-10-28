// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/build-userscript.mjs", import.meta.url));
const template = readFileSync(new URL("../userscript/lol-tft.template.js", import.meta.url), "utf8");
const tempParent = realpathSync(tmpdir());
let root: string;
const bundle = 'var LolTft = {}; var literal = "$& $$ $` $\' __OTHER_TOKEN__";';

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

describe("userscript packaging CLI", () => {
  it("完整替换两个版本标记，原样保留 bundle 字面量和其他 token", () => {
    const result = build();
    expect(result.status).toBe(0);
    const output = readFileSync(outputPath(), "utf8");
    expect(output).toContain("// @version      1.2.3-beta.1+test");
    expect(output).toContain('var VERSION = "1.2.3-beta.1+test";');
    expect(output).toContain(bundle);
    expect(output).toContain("__LOL_TFT__");
    expect(output).not.toContain("__VERSION__");
    expect(output).not.toContain("__BUNDLE__");
    expect(output.startsWith("// ==UserScript==")).toBe(true);
    expect(() => new Function(output)).not.toThrow();
  });

  it.each(["missing-version", "extra-version", "wrong-version-location", "missing-bundle", "extra-bundle", "bad-header"])(
    "模板 %s 时拒绝生成，保留已有输出", (kind) => {
      let invalid = template;
      if (kind === "missing-version") invalid = template.replace("__VERSION__", "1.0.0");
      if (kind === "extra-version") invalid += "\n// __VERSION__";
      if (kind === "wrong-version-location") invalid = template.replace("var VERSION =", "var OTHER =");
      if (kind === "missing-bundle") invalid = template.replace("/*__BUNDLE__*/", "");
      if (kind === "extra-bundle") invalid += "\n/*__BUNDLE__*/";
      if (kind === "bad-header") invalid = "\uFEFF" + template;
      writeFileSync(join(root, "userscript/lol-tft.template.js"), invalid);
      mkdirSync(dirname(outputPath()), { recursive: true });
      writeFileSync(outputPath(), "existing output");
      expect(build().status).toBe(1);
      expect(readFileSync(outputPath(), "utf8")).toBe("existing output");
    }
  );

  it("不接受能破坏元信息或 JavaScript 字面量的版本值", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: '1.0.0";\n// @grant unsafeWindow' }));
    expect(build().status).toBe(1);
    expect(existsSync(outputPath())).toBe(false);
  });

  it("bundle 中出现保留构建标记时拒绝生成，不静默改写 bundle", () => {
    writeFileSync(join(root, "dist/lol/lol.umd.js"), bundle + '\nvar reserved = "__VERSION__";');
    expect(build().status).toBe(1);
    expect(existsSync(outputPath())).toBe(false);
  });

  it("README 指向实际生成文件和安装入口", () => {
    const readme = readFileSync(new URL("../readme.md", import.meta.url), "utf8");
    expect(readme).toContain("dist/userscript/lol-tft.user.js");
    expect(readme).toContain("https://raw.githubusercontent.com/entyr233/lol-tft/master/userscript/lol-tft.user.js");
    expect(readme).toContain("https://greasyfork.org/zh-CN/scripts/454184");
  });
});
