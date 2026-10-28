import { test, expect } from "@playwright/test";
import { bootPanel, openSummary } from "../e2e/fixtures";

test("生成 README mock 截图", async ({ page }) => {
  await bootPanel(page);
  await openSummary(page);
  await expect(page.locator(".detail-player")).toHaveCount(10);
  await page.locator("#lol-tft-overlay").screenshot({ path: "docs/assets/preview-summary.png", animations: "disabled" });
  await page.getByRole("link", { name: "海克斯数据" }).click();
  await page.locator(".aram-row").first().click();
  await expect(page.locator(".aram-detail-title")).toHaveText("测试强化");
  await page.locator("#lol-tft-overlay").screenshot({ path: "docs/assets/preview-aram.png", animations: "disabled" });
});
