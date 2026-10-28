import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const shell = readFileSync("userscript/lol-tft.user.js", "utf8");
const ui = readFileSync("userscript/lol-tft-ui.js", "utf8");
const pageHtml = "<!doctype html><html><head><meta charset='utf-8'></head><body><div id='host'>mock</div></body></html>";

interface InitOptions {
  resource?: string;
  xhrUi?: string;
}

async function boot(page: Page, url: string, options: InitOptions = {}): Promise<void> {
  await page.route("https://www.wegame.com.cn/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml }));
  await page.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml }));
  await page.addInitScript(({ resource, xhrUi }) => {
    const w = window as unknown as {
      __menu: string[];
      GM_registerMenuCommand: (name: string, run: () => void) => void;
      GM_getResourceText: (name: string) => string;
      GM_xmlhttpRequest?: (options: {
        url: string;
        onload: (response: { status: number; responseText: string }) => void;
        onerror: () => void;
        ontimeout: () => void;
      }) => void;
    };
    w.__menu = [];
    w.GM_registerMenuCommand = (name) => { w.__menu.push(name); };
    w.GM_getResourceText = () => resource ?? "";
    if (xhrUi !== undefined) {
      w.GM_xmlhttpRequest = (request) => {
        if (request.url.includes("cdn.jsdelivr.net")) {
          request.onload({ status: 404, responseText: "" });
        } else if (request.url.includes("fastly.jsdelivr.net")) {
          request.onload({ status: 200, responseText: xhrUi });
        } else {
          request.onerror();
        }
      };
    }
  }, { resource: options.resource ?? "", xhrUi: options.xhrUi });
  await page.goto(url, { waitUntil: "load" });
  await page.addScriptTag({ content: shell });
}

async function hostShadowText(page: Page, id: string): Promise<string> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    return host?.shadowRoot?.textContent ?? "";
  }, id);
}

test("任意网站只注册菜单，不注入悬浮按钮/UI", async ({ page }) => {
  await boot(page, "https://example.com/");
  await expect(page.locator("#lol-tft-launcher")).toHaveCount(0);
  await expect(page.locator("#lol-tft-overlay")).toHaveCount(0);
  const menu = await page.evaluate(() => (window as unknown as { __menu: string[] }).__menu);
  expect(menu).toContain("打开自建战绩面板");
  expect(menu).toContain("打开官方助手页");
});

test("WeGame 首页点击后才加载 UI 并挂载浮层", async ({ page }) => {
  await boot(page, "https://www.wegame.com.cn/", { resource: ui });
  await expect(page.locator("#lol-tft-launcher")).toBeVisible();
  await expect(page.locator("#lol-tft-overlay")).toHaveCount(0);
  await page.locator("#lol-tft-launcher").click();
  await expect(page.locator("#lol-tft-overlay")).toBeVisible();
  await expect.poll(() => hostShadowText(page, "lol-tft-overlay-host")).toContain("选择区服");
});

test("官方助手页自动挂载助手面板", async ({ page }) => {
  await boot(page, "https://www.wegame.com.cn/helper/lol/", { resource: ui });
  await expect(page.locator("#lol-tft-helper-login")).toHaveCount(1);
  await expect.poll(() => hostShadowText(page, "lol-tft-helper-login")).toContain("LOL 助手增强");
});

test("CDN 主源失败时回退到备用源并校验哈希", async ({ page }) => {
  await boot(page, "https://www.wegame.com.cn/", { xhrUi: ui });
  await page.locator("#lol-tft-launcher").click();
  await expect(page.locator("#lol-tft-overlay")).toBeVisible();
  await expect.poll(() => hostShadowText(page, "lol-tft-overlay-host")).toContain("选择区服");
});

test("UI 被篡改时拒绝执行并显示错误", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 500, body: "blocked" }));
  await page.route("https://fastly.jsdelivr.net/**", (route) => route.fulfill({ status: 500, body: "blocked" }));
  await page.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 500, body: "blocked" }));
  await boot(page, "https://www.wegame.com.cn/", { resource: ui + "\n/*tamper*/" });
  await page.locator("#lol-tft-launcher").click();
  await expect(page.locator("#lol-tft-overlay")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getElementById("lol-tft-overlay")?.textContent ?? ""))
    .toContain("完整性校验失败");
});
