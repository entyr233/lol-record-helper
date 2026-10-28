import { test, expect } from "@playwright/test";
import { bootPanel, expectNoAxeViolations } from "./fixtures";
import katarina from "../fixtures/aramgg-katarina.json" with { type: "json" };
import descriptions from "../fixtures/aramgg-descriptions.json" with { type: "json" };

test("海克斯真实字段回归：缺失描述、英雄排名及模式口径", async ({ page }, testInfo) => {
  await bootPanel(page);
  await page.route("**/augments.json", route => route.fulfill({ json: { data: descriptions.data.map(item => ({
    ...item, topChampions: [{ id: 55, name: "卡特琳娜", iconUrl: null }]
  })) } }));
  await page.route("**/champions.json", route => route.fulfill({ json: { data: [katarina.data.champion] } }));
  await page.route("**/champions/55.json", route => route.fulfill({ json: katarina }));
  await page.getByRole("link", { name: "海克斯数据" }).click();
  await page.locator(".aram-search").evaluate(input => {
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    (input as HTMLInputElement).value = "术士果汁盒";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
  });
  await expect(page.locator(".aram-row")).toHaveCount(1);
  await page.locator(".aram-search").dispatchEvent("compositionend");
  await page.getByRole("button", { name: /术士果汁盒/ }).click();
  await expect(page.locator(".aram-detail-text")).toHaveText("获得〔未提供〕全能吸血。");
  await expect(page.getByText("数据源未提供部分具体数值", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
  const champion = page.getByRole("button", { name: "查看卡特琳娜的海克斯推荐" });
  await champion.focus();
  await champion.press("Enter");
  await expect(page.locator(".aram-search")).toHaveValue("");
  await expect(page.locator(".aram-row--cur")).toContainText("卡特琳娜");
  await expect(page.getByRole("heading", { name: "卡特琳娜", exact: true })).toBeFocused();
  await expect(page.locator(".aram-aug-name").first()).toHaveText("1. 虚幻武器");
  await expect(page.locator(".aram-aug-meta").first()).toContainText("用户上报胜率 · 全球 · 16.21 · 34126 场");
  await expect(page.getByText("数据源仅返回其他模式的出装", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.locator("#lol-tft-overlay").screenshot({ path: testInfo.outputPath("aram-recommendation.png") });
});
