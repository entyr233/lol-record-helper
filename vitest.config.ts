import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkgVersion = JSON.parse(readFileSync("./package.json", "utf8")).version as string;
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  test: {
    environment: "jsdom",
    css: true,
    include: ["tests/**/*.test.ts"],
    restoreMocks: true
  }
});
