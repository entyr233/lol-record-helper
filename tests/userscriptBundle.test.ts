import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

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
    expect(metadata).toMatch(/^\/\/ @downloadURL[ \t]+https:\/\/raw\.githubusercontent\.com\/entyr233\/lol-tft\/master\/userscript\/lol-tft\.user\.js\r?$/m);
    expect(metadata).toMatch(/^\/\/ @updateURL[ \t]+https:\/\/raw\.githubusercontent\.com\/entyr233\/lol-tft\/master\/userscript\/lol-tft\.user\.js\r?$/m);
    // 入库副本与原构建产物内容一致（忽略 Git 工作区 CRLF 转换），raw 直装/自动更新才能拿到同一份代码
    const normalizeEol = (text: string): string => text.replace(/\r\n/g, "\n");
    expect(normalizeEol(readFileSync("userscript/lol-tft.user.js", "utf8"))).toBe(normalizeEol(readFileSync(FILE, "utf8")));
    // 脚本管理器里能直接看到项目主页/支持入口（无需进编辑界面）
    expect(metadata).toMatch(/^\/\/ @homepageURL[ \t]+https:\/\/github\.com\/entyr233\/lol-tft\r?$/m);
    expect(metadata).toMatch(/^\/\/ @supportURL[ \t]+https:\/\/github\.com\/entyr233\/lol-tft\/issues\r?$/m);
    // 注册脚本菜单命令，ScriptCat 的脚本列表里才会出现可点的「打开项目主页/反馈」菜单项
    expect(metadata).toMatch(/^\/\/ @grant[ \t]+GM_registerMenuCommand\r?$/m);
    expect(code).toContain("GM_registerMenuCommand");
    expect(code).toContain("打开自建战绩面板");
    expect(code).toContain("打开官方助手页");
    expect(code).toContain("https://www.wegame.com.cn/");
    expect(code).toContain("打开项目主页");
    expect(code).toContain("https://github.com/entyr233/lol-tft/issues");
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
    // 任意网站都注入以注册脚本菜单（悬浮入口在非 WeGame 页面自行跳过）
    expect(code).toMatch(/\/\/ @match[ \t]+http:\/\/\*\/\*/);
    expect(code).toMatch(/\/\/ @match[ \t]+https:\/\/\*\/\*/);
    // 不再通过 <script src> 加载远端 bundle（bundle 已内联）
    expect(code).not.toContain("BUNDLE_URL");
    // 允许创建 <script>（仅用于加载 WeGame 登录 SDK），但不得再加载远端 UI bundle
    expect(code).toContain("login.sdk.js");
    expect(code).not.toContain("/lol/lol.umd.js");
    // 浏览器环境没有 Node 全局
    expect(code).not.toContain("process.env");
    expect(code).not.toContain("__dirname");

    // 仅 WeGame 页面挂悬浮按钮；模拟当前页面为 wegame 首页
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
