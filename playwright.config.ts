import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    // 本地没有 Playwright 浏览器时可用 `PW_EDGE=1 npm run test:e2e` 走系统 Edge
    channel: process.env.PW_EDGE ? "msedge" : undefined
  }
});
