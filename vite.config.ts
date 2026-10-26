import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { mockApiPlugin } from "./dev/mockServer";

// two build modes:
//   default  -> 独立演示/调试站点 (dist/index.html + assets)
//   lib      -> 单文件 IIFE，供油猴脚本注入 (dist/lol/lol.umd.js)
export default defineConfig(({ mode }) => {
  const shared = {
    plugins: [vue(), mockApiPlugin()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
    },
    build: {
      target: "es2018",
      cssCodeSplit: false,
      assetsInlineLimit: 8192,
      reportCompressedSize: false
    }
  };

  if (mode === "lib") {
    return {
      ...shared,
      build: {
        ...shared.build,
        lib: {
          entry: fileURLToPath(new URL("./src/entry-lib.ts", import.meta.url)),
          name: "LolTft",
          formats: ["iife"],
          fileName: () => "lol.umd.js"
        },
        outDir: "dist/lol",
        emptyOutDir: true,
        rollupOptions: {
          output: { exports: "named", extend: false }
        }
      }
    };
  }

  return {
    ...shared,
    base: "./",
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "https://www.wegame.com.cn",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("trpc-caller", "wegame.pallas.web.LolBattle");
              proxyReq.setHeader("referer", "https://www.wegame.com.cn/ioi");
              proxyReq.setHeader(
                "user-agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              );
              const cookie = process.env.LOL_TFT_COOKIE;
              if (cookie) proxyReq.setHeader("cookie", cookie);
            });
          }
        }
      }
    },
    build: { ...shared.build, outDir: "dist/site" }
  };
});
