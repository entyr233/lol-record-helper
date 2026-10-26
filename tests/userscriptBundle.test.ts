import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILE = "dist/userscript/lol-tft.user.js";
const available = existsSync(FILE);

describe.skipIf(!available)("单文件油猴脚本（构建产物）", () => {
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
    expect(code).toContain("@grant        none");
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
