import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/screenshots",
  workers: 1,
  timeout: 30_000,
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1050 } }
});
