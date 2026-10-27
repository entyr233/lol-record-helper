import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILE = "dist/userscript/lol-tft.user.js";
const available = existsSync(FILE);
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

describe.skipIf(!available)("单文件油猴脚本（构建产物）", () => {
  it("从元信息头开始，元信息及运行时版本一致且所有构建占位符已替换", () => {
    const code = readFileSync(FILE, "utf8");
    expect(code.startsWith("// ==UserScript==\n") || code.startsWith("// ==UserScript==\r\n")).toBe(true);
    const metadata = code.slice(0, code.indexOf("// ==/UserScript=="));
    expect(metadata.match(/^\/\/ @version[ \t]+(.+)\r?$/m)?.[1]?.trim()).toBe(version);
    expect(code).toContain('var VERSION = "' + version + '";');
    expect(code).not.toContain("__VERSION__");
    expect(code).not.toContain("__BUNDLE__");
    expect(code).toContain("__LOL_TFT__"); // Runtime debugging API is not a build placeholder.
    expect(metadata).toMatch(/^\/\/ @downloadURL[ \t]+https:\/\/update\.greasyfork\.org\/scripts\/454184\/[^\r\n]+\.user\.js\r?$/m);
    expect(metadata).toMatch(/^\/\/ @updateURL[ \t]+https:\/\/update\.greasyfork\.org\/scripts\/454184\/[^\r\n]+\.meta\.js\r?$/m);
  });

  it("内联 bundle 能执行，并导出 mountLolTft", () => {
    const code = readFileSync(FILE, "utf8");
    // 模拟 Tampermonkey 把整段脚本包在一个函数里执行
    // 用形参遮蔽 Node 全局 process/require，模拟真实浏览器环境
    const factory = new Function(
      "process",
      "require",
      "module",
      "exports",
      code + "\n;return (typeof LolTft !== 'undefined' ? LolTft : window.LolTft);"
    );
    const lib = factory(undefined, undefined, undefined, undefined) as { mountLolTft?: unknown } | null;

    expect(lib).toBeTruthy();
    expect(typeof lib?.mountLolTft).toBe("function");
  });

  it("自动挂上右下角入口按钮，且 banner 头信息完整", () => {
    const code = readFileSync(FILE, "utf8");
    expect(code).toContain("@grant        GM_xmlhttpRequest");
    expect(code).toContain("@connect      mlol.qt.qq.com");
    expect(code).toContain("@match        https://lol.qq.com/*");
    expect(code).toContain("lol-tft-detail-request");
    expect(code).toMatch(/@match\s+https:\/\/www\.wegame\.com\.cn\/\*/);
    // 不再通过 <script src> 加载远端 bundle（bundle 已内联）
    expect(code).not.toContain("BUNDLE_URL");
    // 允许创建 <script>（仅用于加载 WeGame 登录 SDK），但不得再加载远端 UI bundle
    expect(code).toContain("login.sdk.js");
    expect(code).not.toContain("/lol/lol.umd.js");
    // 浏览器环境没有 Node 全局
    expect(code).not.toContain("process.env");
    expect(code).not.toContain("__dirname");

    const run = new Function("process", "require", "module", "exports", code);
    run(undefined, undefined, undefined, undefined);
    const launcher = document.getElementById("lol-tft-launcher");
    expect(launcher).not.toBeNull();
    expect(launcher?.textContent).toContain("LOL 战绩");
  });
});
