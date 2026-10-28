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
  test(`总览、列表和十人详情各标签无 axe 违规（${viewport.width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await bootPanel(page);
    await openSummary(page);
    if (viewport.width === 390) {
      await expect(page.locator(".battle-list-detail")).toBeHidden();
      await page.locator("#lol-tft-overlay").screenshot({ path: testInfo.outputPath("summary-mobile.png") });
    }
    await expectNoAxeViolations(page);
    const chosenGame = page.locator(".battle-list-item").nth(6);
    await chosenGame.scrollIntoViewIfNeeded();
    const listScrollTop = await page.locator(".battle-list-items").evaluate(el => el.scrollTop);
    const gameId = await chosenGame.getAttribute("data-game-id");
    await chosenGame.click();
    await expect(page.locator(".detail-team")).toHaveCount(2);
    await expect(page.locator(".detail-team .detail-player")).toHaveCount(10);
    for (const name of ["概要", "伤害", "技能"]) {
      await page.locator(".detail-toolbar").getByRole("button", { name, exact: true }).click();
      if (viewport.width === 390) {
        const detailWidth = await page.locator(".battle-list-detail").evaluate(el => ({ content: el.scrollWidth, viewport: el.clientWidth }));
        expect(detailWidth.content).toBeLessThanOrEqual(detailWidth.viewport + 1);
      }
      await expectNoAxeViolations(page);
    }
    if (viewport.width === 390) {
      await page.locator("#lol-tft-overlay").screenshot({ path: testInfo.outputPath("detail-mobile.png") });
      await page.getByRole("button", { name: "返回对局列表" }).click();
      await expect(page.locator(".battle-list-detail")).toBeHidden();
      await expect(page.locator(".battle-list-item.selected")).toHaveAttribute("data-game-id", gameId!);
      await expect(page.locator(".battle-list-items")).toBeFocused();
      await expect.poll(() => page.locator(".battle-list-items").evaluate(el => el.scrollTop)).toBeCloseTo(listScrollTop, 0);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "返回对局列表" })).toBeFocused();
      await expect(page.locator(".battle-list-detail")).toBeVisible();
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
    await expect(page.locator(".favorites-manager-row").first()).not.toHaveAttribute("draggable", "true");
    await expect(page.locator(".favorites-manager-drag").first()).toHaveAttribute("draggable", "true");
    await expect(page.locator(".favorites-manager-row-action").first()).not.toHaveAttribute("draggable", "true");
    await expectNoAxeViolations(page);
    await page.locator(".favorites-manager-close").click();
    await expect(page.locator(".favorites-manager")).toHaveCount(0);
    await page.getByRole("button", { name: "设置" }).click();
    await expect(page.locator(".settings-panel")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "关闭设置" }).click();
    await expect(page.locator(".settings-panel")).toHaveCount(0);
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

test("共享筛选、统计常开与数据源设置保持可用", async ({ page }, testInfo) => {
  await bootPanel(page);
  await openSummary(page);
  await expect(page.locator(".summoner-kpis .recent-kpi")).toHaveCount(4);
  await expect(page.locator(".recent-stats > .recent-kpis")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "筛选英雄" }).locator("option").nth(1)).not.toHaveText(/英雄 \d+/);
  const modes = page.getByRole("group", { name: "筛选统计与对局模式" });
  await expect(page.locator(".recent-modes")).toHaveCount(0);
  await modes.getByRole("button", { name: "大乱斗", exact: true }).click();
  await expect(page.locator(".recent-title")).toContainText("大乱斗");
  await expect(page.locator(".battle-queue").first()).toHaveText("大乱斗");
  await page.getByRole("combobox", { name: "筛选统计与对局时间范围" }).selectOption("7");
  await expect(page.locator(".recent-title")).toContainText("近 7 天");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(modes.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "筛选统计与对局时间范围" })).toHaveValue("0");
  await expect(page.locator(".summoner-stat-grid")).toBeVisible();
  await expect(page.locator(".recent-analysis-grid")).toBeVisible();
  await expectNoAxeViolations(page);
  await page.locator("#lol-tft-overlay").screenshot({ path: testInfo.outputPath("summary-stats-visible.png") });
  await page.getByRole("link", { name: "海克斯数据" }).click();
  await expect(page.locator(".aram-source-body")).toBeHidden();
  await page.locator(".aram-source > summary").click();
  await expect(page.locator(".aram-source-body")).toBeVisible();
  await page.getByRole("button", { name: "更换", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ARAMGG API Key" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("浮层焦点跨 Shadow DOM 循环，Esc 关闭后回到入口", async ({ page }) => {
  await bootPanel(page);
  const close = page.getByRole("button", { name: "关闭战绩面板" });
  const last = page.getByRole("link", { name: "官方助手 ↗" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  // 不同浏览器对 select 的 Tab 行为不同：下一焦点可能是区服下拉或导航链接。
  await expect.poll(async () => page.evaluate(() => {
    let active = document.activeElement as HTMLElement | null;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
    return Boolean(active && (active.classList.contains("area-select") || active.textContent?.trim() === "海克斯数据"));
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#lol-tft-overlay")).toHaveCount(0);
  await expect(page.locator("#lol-tft-launcher")).toBeFocused();
});
