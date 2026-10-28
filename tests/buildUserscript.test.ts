// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/build-userscript.mjs", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../userscript/manifest.json", import.meta.url), "utf8"));
const tempParent = realpathSync(".");
let root: string;
const bundle = 'var LolTft = { mountLolTft: function () {}, mountHelperLogin: function () {} }; var literal = "$& $$ $` $\' __OTHER_TOKEN__";';
const uiHash = createHash("sha256").update(bundle.replace(/\r\n/g, "\n"), "utf8").digest("hex");

beforeEach(() => {
  root = mkdtempSync(join(tempParent, ".review-tmp-build-test-"));
  mkdirSync(join(root, "dist/lol"), { recursive: true });
  mkdirSync(join(root, "userscript/src"), { recursive: true });
  writeFileSync(join(root, "dist/lol/lol.umd.js"), bundle);
  cpSync(new URL("../userscript/src", import.meta.url), join(root, "userscript/src"), { recursive: true });
  writeFileSync(join(root, "userscript/manifest.json"), readFileSync(new URL("../userscript/manifest.json", import.meta.url), "utf8"));

  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3-beta.1+test" }));
});

afterEach(() => {
  // Only remove the exact temporary directory created by this test, never repo paths.
  const target = realpathSync(root);
  if (dirname(target) !== tempParent || !basename(target).startsWith(".review-tmp-build-test-")) {
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
    expect(result.status, result.stderr).toBe(0);
    const output = readFileSync(outputPath(), "utf8");
    expect(output).toContain("// @version      1.2.3-beta.1+test");
    expect(output).toContain('const VERSION = "1.2.3-beta.1+test";');
    expect(output).toContain("@resource     lol-tft-ui");
    expect(output).toContain("https://github.com/entyr233/lol-record-helper/releases/download/v1.2.3-beta.1+test/lol-tft-ui.js");
    expect(output).toContain("createUiLoader");
    expect(output).toContain('const UI_SHA256 = "' + uiHash + '";');
    expect(output).not.toContain(bundle);
    expect(output).not.toContain("__VERSION__");
    expect(output).not.toContain("__UI_VERSION__");
    expect(output).not.toContain("__UI_SHA256__");
    expect(output).not.toContain("__REPO__");
    expect(output).not.toContain("__LOADER__");
    expect(output).not.toContain("__BUNDLE__");
    expect(output.startsWith("// ==UserScript==")).toBe(true);
    expect(Buffer.byteLength(output, "utf8")).toBeLessThan(64 * 1024);
    expect(() => new Function(output)).not.toThrow();

    const ui = readFileSync(outputUiPath(), "utf8");
    expect(ui).toBe(bundle);
    expect(readFileSync(join(root, "userscript/lol-tft.user.js"), "utf8")).toBe(output);

  });

  it.each([
    { ...manifest, name: "" },
    { ...manifest, name: "name\n// @grant unsafeWindow" },
    { ...manifest, repo: "owner/repo/extra" },
    { ...manifest, uiResource: "invalid resource" },
    { ...manifest, grants: [] },
    { ...manifest, matches: ["https://*/*\n// @grant unsafeWindow"] },
    { ...manifest, connects: "github.com" }
  ])("manifest 无效时拒绝生成，保留已有输出", (invalid) => {
    writeFileSync(join(root, "userscript/manifest.json"), JSON.stringify(invalid));
    mkdirSync(dirname(outputPath()), { recursive: true });
    writeFileSync(outputPath(), "existing output");
    writeFileSync(outputUiPath(), "existing ui");
    expect(build().status).toBe(1);
    expect(readFileSync(outputPath(), "utf8")).toBe("existing output");
    expect(readFileSync(outputUiPath(), "utf8")).toBe("existing ui");
  });

  it("manifest 独立控制全部元信息和运行时资源名", () => {
    writeFileSync(join(root, "userscript/manifest.json"), JSON.stringify({
      ...manifest, name: "Test shell", namespace: "test", repo: "example/project", uiResource: "test-ui",
      matches: ["https://example.com/*"], grants: ["GM_getResourceText"], connects: ["example.com"]
    }));
    const result = build();
    expect(result.status, result.stderr).toBe(0);
    const output = readFileSync(outputPath(), "utf8");
    expect(output).toContain("// @name         Test shell");
    expect(output).toContain("// @namespace    test");
    expect(output).toContain("// @match        https://example.com/*");
    expect(output).toContain("// @resource     test-ui https://github.com/example/project/releases/");
    expect(output).toContain('const UI_RESOURCE = "test-ui";');
    expect(output).not.toContain("entyr233/lol-record-helper");
  });

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
