import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const shell = readFileSync("userscript/lol-tft.user.js", "utf8");
const ui = readFileSync("dist/userscript/lol-tft-ui.js", "utf8");
const pageHtml = "<!doctype html><html><head><meta charset='utf-8'></head><body><div>mock</div></body></html>";

async function boot(page: Page, url: string): Promise<void> {
  await page.route("https://www.wegame.com.cn/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml }));
  await page.addInitScript((uiText) => {
    const w = window as unknown as {
      GM_registerMenuCommand: (name: string, run: () => void) => void;
      GM_getResourceText: () => string;
    };
    w.GM_registerMenuCommand = () => {};
    w.GM_getResourceText = () => uiText;
  }, ui);
  await page.goto(url, { waitUntil: "load" });
  await page.addScriptTag({ content: shell });
}

async function seriousViolations(page: Page, selector: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => violation.id + "：" + violation.help);
}

test("战绩浮层无 axe 可访问性违规", async ({ page }) => {
  await boot(page, "https://www.wegame.com.cn/");
  await page.locator("#lol-tft-launcher").click();
  await expect(page.locator("#lol-tft-overlay")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const host = document.getElementById("lol-tft-overlay-host");
    return host?.shadowRoot?.textContent?.includes("选择区服") ?? false;
  })).toBe(true);
  expect(await seriousViolations(page, "#lol-tft-overlay")).toEqual([]);
});

test("官方助手面板无 axe 可访问性违规", async ({ page }) => {
  await boot(page, "https://www.wegame.com.cn/helper/lol/");
  await expect(page.locator("#lol-tft-helper-login")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const host = document.getElementById("lol-tft-helper-login");
    return host?.shadowRoot?.textContent?.includes("LOL 助手增强") ?? false;
  })).toBe(true);
  expect(await seriousViolations(page, "#lol-tft-helper-login")).toEqual([]);
});
