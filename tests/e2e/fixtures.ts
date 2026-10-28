import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { route as mockResponse, MOCK_API_PREFIX } from "../../dev/mockData";

const shell = readFileSync("userscript/lol-tft.user.js", "utf8");
const ui = readFileSync("dist/userscript/lol-tft-ui.js", "utf8");
const pageHtml = "<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><title>测试宿主页</title></head><body><main>mock</main></body></html>";

export async function bootPanel(page: Page, options: { helper?: boolean; savedPlayers?: boolean } = {}): Promise<void> {
  // Only local fixtures are served, including images and static champion metadata.
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith(MOCK_API_PREFIX)) {
      return route.fulfill({ json: mockResponse(url.pathname.slice(MOCK_API_PREFIX.length), request.postDataJSON() ?? {}) });
    }
    if (url.hostname === "data.dtodo.cn") {
      const stats = { tier: 1, winRate: 0.54, pickRate: 0.13 };
      const augment = { id: 1001, name: "测试强化", rarity: 1, rarityDisplayName: "黄金", description: "提高技能急速。", stats, topChampions: [] };
      const champion = { id: 17, name: "提莫", title: "迅捷斥候", roles: ["射手"], iconUrl: "", stats };
      const json = url.pathname.endsWith("/config") ? { dataVersion: "test", gamePatch: "test" }
        : url.pathname.endsWith("augments.json") ? { data: [augment, { ...augment, id: 1002, name: "测试强化二" }] }
        : url.pathname.endsWith("champions.json") ? { data: [champion] }
        : { data: { champion, augments: [augment], builds: [] } };
      return route.fulfill({ json });
    }
    if (request.resourceType() === "image") {
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#556677"/></svg>' });
    }
    if (url.pathname.endsWith("versions.json")) return route.fulfill({ json: ["16.21.1"] });
    if (url.hostname === "www.wegame.com.cn" && request.isNavigationRequest()) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: pageHtml });
    }
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(({ ui, savedPlayers }) => {
    window.GM_registerMenuCommand = () => {};
    window.GM_getResourceText = () => ui;
    // Cookie and SDK state are synthetic; no account or external login is used.
    document.cookie = "p_uin=o10001; path=/";
    window.WegameLogin = { default: {
      isLogin: () => true, logout: () => {}, getUserInfo: () => ({}),
      getLoginUser: async () => ({ uin: "10001" }), popup: () => {}
    } };
    localStorage.setItem("lol_tft:aramgg-api-key", JSON.stringify("test-only-key"));
    if (savedPlayers) {
      localStorage.setItem("lol-tft-favorites", JSON.stringify([
        { name: "测试玩家", area: 1, accountType: "2", id: "mock-player", savedAt: 1 }
      ]));
      localStorage.setItem("lol_tft:search-history", JSON.stringify(["最近玩家"]));
    }
  }, { ui, savedPlayers: options.savedPlayers ?? false });
  await page.goto(options.helper ? "https://www.wegame.com.cn/helper/lol/" : "https://www.wegame.com.cn/");
  await page.addScriptTag({ content: shell });
  if (options.helper) {
    await expect(page.locator("#lol-tft-helper-login")).toHaveCount(1);
  } else {
    await page.locator("#lol-tft-launcher").click();
    await expect(page.getByRole("combobox", { name: "选择区服" })).toBeVisible();
  }
}

export async function openSummary(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: "选择区服" }).selectOption("1");
  await expect(page.locator(".battle-list-item").first()).toBeVisible();
  await expect(page.locator(".summoner-name")).toBeVisible();
}

export async function expectNoAxeViolations(page: Page, selector = "#lol-tft-overlay"): Promise<void> {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
}
