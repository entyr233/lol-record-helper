import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_EDGE ? "msedge" : undefined } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ]
});
