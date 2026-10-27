import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkgVersion = JSON.parse(readFileSync("./package.json", "utf8")).version as string;
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { devApiPlugin } from "./dev/mockServer.ts";
import { devSession } from "./dev/devSession.ts";

// two build modes:
//   default  -> 独立演示/调试站点 (dist/index.html + assets)
//   lib      -> 单文件 IIFE，供油猴脚本注入 (dist/lol/lol.umd.js)
export default defineConfig(({ mode }) => {
  const shared = {
    plugins: [vue(), devApiPlugin()],
    // lib 模式下 Vite 不会自动替换 process.env.NODE_ENV（留给库使用者决定），
    // 但我们要产出直接在浏览器跑的单文件，必须静态替换掉，否则会 "process is not defined"
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      __APP_VERSION__: JSON.stringify(pkgVersion)
    },
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
        "/__lol-tft/rank-history": {
          target: "https://mlol.qt.qq.com",
          changeOrigin: true,
          rewrite: () => "/go/battle_info/get_rank_trend",
          headers: { origin: "https://lol.qq.com", referer: "https://lol.qq.com/" }
        },
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
              // 优先用运行时粘贴的 cookie，其次是环境变量
              const cookie = devSession.cookie || process.env.LOL_TFT_COOKIE;
              if (cookie) proxyReq.setHeader("cookie", cookie);
            });
          }
        }
      }
    },
    build: { ...shared.build, outDir: "dist/site" }
  };
});
