import { expect, test } from "@playwright/test";
import { bootPanel, expectNoAxeViolations, openSummary } from "./fixtures";

test("战绩浮层无 axe 可访问性违规", async ({ page }) => {
  await bootPanel(page);
  await expectNoAxeViolations(page);
});

test("官方助手面板无 axe 可访问性违规", async ({ page }) => {
  await bootPanel(page, { helper: true });
  await expect(page.getByText("LOL 助手增强", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page, "#lol-tft-helper-login");
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`总览、列表和十人详情各标签无 axe 违规（${viewport.width}px）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await bootPanel(page);
    await openSummary(page);
    await expectNoAxeViolations(page);
    await page.locator(".battle-list-item").first().click();
    await expect(page.locator(".detail-team")).toHaveCount(2);
    await expect(page.locator(".detail-team .detail-player")).toHaveCount(10);
    for (const name of ["概要", "伤害", "技能"]) {
      await page.locator(".detail-toolbar").getByRole("button", { name, exact: true }).click();
      await expectNoAxeViolations(page);
    }
  });

  test(`搜索、收藏和常看玩家无 axe 违规（${viewport.width}px）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await bootPanel(page, { savedPlayers: true });
    await expect(page.getByRole("button", { name: /测试玩家.*艾欧尼亚/ })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.locator(".header-favorites summary").click();
    await expect(page.locator(".favorite-row")).toHaveCount(1);
    await expectNoAxeViolations(page);
    await page.locator(".favorite-note-edit").click();
    await expectNoAxeViolations(page);
    await page.locator(".favorite-note-input").press("Enter");
    await page.locator(".favorites-manage-button").click();
    await expect(page.locator(".favorites-manager")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.locator(".favorites-manager-close").click();
    await expect(page.locator(".favorites-manager")).toHaveCount(0);
    await page.getByRole("searchbox", { name: "搜索召唤师" }).fill("测试玩家");
    await page.getByRole("searchbox", { name: "搜索召唤师" }).press("Enter");
    await expect(page.locator(".search-item")).toHaveCount(3);
    await expectNoAxeViolations(page);
  });

  test(`海克斯榜单和英雄推荐无 axe 违规（${viewport.width}px）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await bootPanel(page);
    await page.getByRole("link", { name: "海克斯数据" }).click();
    const rows = page.locator(".aram-row");
    await expect(rows).toHaveCount(2);
    await rows.first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".aram-detail-title")).toHaveText("测试强化");
    await page.keyboard.press("Tab");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator(".aram-detail-title")).toHaveText("测试强化二");
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "英雄榜", exact: true }).click();
    await rows.first().click();
    await expect(page.locator(".aram-aug")).toHaveCount(1);
    await expectNoAxeViolations(page);
  });
}

test("浮层焦点跨 Shadow DOM 循环，Esc 关闭后回到入口", async ({ page }) => {
  await bootPanel(page);
  const close = page.getByRole("button", { name: "关闭战绩面板" });
  const last = page.locator(".app-header .header-link").last();
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "选择区服" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#lol-tft-overlay")).toHaveCount(0);
  await expect(page.locator("#lol-tft-launcher")).toBeFocused();
});
