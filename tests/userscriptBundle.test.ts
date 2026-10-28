import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const FILE = "dist/userscript/lol-tft.user.js";
const UI_FILE = "dist/userscript/lol-tft-ui.js";
const available = existsSync(FILE) && existsSync(UI_FILE);
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const normalizeEol = (text: string): string => text.replace(/\r\n/g, "\n");

describe.skipIf(!available)("轻量油猴脚本与按需加载 UI", () => {
  it("shell 元信息、版本、资源与菜单完整", () => {
    const code = readFileSync(FILE, "utf8");
    expect(code.startsWith("// ==UserScript==\n") || code.startsWith("// ==UserScript==\r\n")).toBe(true);
    const metadata = code.slice(0, code.indexOf("// ==/UserScript=="));
    expect(metadata.match(/^\/\/ @version[ \t]+(.+)\r?$/m)?.[1]?.trim()).toBe(version);
    expect(code).toContain('var VERSION = "' + version + '";');
    expect(code).not.toContain("__VERSION__");
    expect(code).not.toContain("__BUNDLE__");
    expect(code).toContain("__LOL_TFT__");

    // UI 不再内联，改由 @resource 按需加载
    expect(metadata).toMatch(/^\/\/ @resource[ \t]+lol-tft-ui[ \t]+https:\/\/github\.com\/entyr233\/lol-record-helper\/releases\/download\/v[^/]+\/lol-tft-ui\.js\r?$/m);
    expect(metadata).toMatch(/^\/\/ @grant[ \t]+GM_getResourceText\r?$/m);
    expect(code).not.toContain("var LolTft=");
    expect(Buffer.byteLength(code, "utf8")).toBeLessThan(64 * 1024);

    // 入库副本内容一致（忽略 Git 工作区 CRLF）
    expect(normalizeEol(readFileSync("userscript/lol-tft.user.js", "utf8"))).toBe(normalizeEol(code));

    expect(metadata).toMatch(/^\/\/ @downloadURL[ \t]+https:\/\/raw\.githubusercontent\.com\/entyr233\/lol-record-helper\/master\/userscript\/lol-tft\.user\.js\r?$/m);
    expect(metadata).toMatch(/^\/\/ @updateURL[ \t]+https:\/\/raw\.githubusercontent\.com\/entyr233\/lol-record-helper\/master\/userscript\/lol-tft\.user\.js\r?$/m);
    expect(metadata).toMatch(/^\/\/ @homepageURL[ \t]+https:\/\/github\.com\/entyr233\/lol-record-helper\r?$/m);
    expect(metadata).toMatch(/^\/\/ @supportURL[ \t]+https:\/\/github\.com\/entyr233\/lol-record-helper\/issues\r?$/m);
    expect(metadata).toMatch(/^\/\/ @grant[ \t]+GM_registerMenuCommand\r?$/m);
    expect(code).toContain("GM_registerMenuCommand");
    expect(code).toContain("打开自建战绩面板");
    expect(code).toContain("打开官方助手页");
    expect(code).toContain("https://www.wegame.com.cn/");
    expect(code).toContain("打开项目主页");
    expect(code).toContain("https://github.com/entyr233/lol-record-helper/issues");

    // 任意网站注入以注册菜单（悬浮入口在非 WeGame 页面自行跳过）
    expect(metadata).toMatch(/^\/\/ @match[ \t]+http:\/\/\*\/\*\r?$/m);
    expect(metadata).toMatch(/^\/\/ @match[ \t]+https:\/\/\*\/\*\r?$/m);
    expect(code).not.toContain("BUNDLE_URL");
    expect(code).not.toContain("/lol/lol.umd.js");
    expect(code).not.toContain("process.env");
    expect(code).not.toContain("__dirname");
  });

  it("独立 UI bundle 可执行，并导出两个挂载入口", () => {
    const ui = readFileSync(UI_FILE, "utf8");

    const shell = readFileSync(FILE, "utf8");
    const uiHash = createHash("sha256").update(normalizeEol(ui), "utf8").digest("hex");
    expect(shell).toContain('var UI_SHA256 = "' + uiHash + '";');
    expect(ui.startsWith("var LolTft=")).toBe(true);
    const factory = new Function(
      "process",
      "require",
      "module",
      "exports",
      ui + "\n;return (typeof LolTft !== 'undefined' ? LolTft : window.LolTft);"
    );
    const lib = factory(undefined, undefined, undefined, undefined) as {
      mountLolTft?: unknown;
      mountHelperLogin?: unknown;
      version?: string;
    } | null;
    expect(lib).toBeTruthy();
    expect(typeof lib?.mountLolTft).toBe("function");
    expect(typeof lib?.mountHelperLogin).toBe("function");
    expect(lib?.version).toBe(version);
  });

  it("自动为 WeGame 页面挂上右下角入口按钮", () => {
    const code = readFileSync(FILE, "utf8");
    vi.stubGlobal("location", {
      hostname: "www.wegame.com.cn",
      href: "https://www.wegame.com.cn/",
      pathname: "/",
      search: "",
      hash: "",
      reload: vi.fn()
    });
    try {
      const run = new Function("process", "require", "module", "exports", code);
      run(undefined, undefined, undefined, undefined);
      const launcher = document.getElementById("lol-tft-launcher");
      expect(launcher).not.toBeNull();
      expect(launcher?.textContent).toContain("LOL 战绩");
    } finally {
      vi.unstubAllGlobals();
      document.getElementById("lol-tft-launcher")?.remove();
      document.getElementById("lol-tft-entry-style")?.remove();
    }
  });
});
