import type { Connect, Plugin } from "vite";
import { MOCK_API_PREFIX, route } from "./mockData";

/**
 * 本地开发用的 WeGame 接口 mock（默认开启，见 lol-tft 的 README）。
 *
 *   LOL_TFT_MOCK=1  强制开
 *   LOL_TFT_MOCK=0  强制关（走真实代理）
 *   未设置          没有 LOL_TFT_COOKIE 时自动开
 */
export function mockApiPlugin(): Plugin {
  const forced = process.env.LOL_TFT_MOCK;
  const hasCookie = Boolean(process.env.LOL_TFT_COOKIE);
  const enabled = forced === "0" ? false : forced === "1" ? true : !hasCookie;

  return {
    name: "lol-tft-mock-api",
    apply: "serve",
    configureServer(server) {
      if (!enabled) {
        server.config.logger.info("[lol-tft] mock 已关闭，接口走真实代理（需要 LOL_TFT_COOKIE）");
        return;
      }
      server.config.logger.info("[lol-tft] mock 已开启：用 sample/*.json 提供 5 个接口，无需 WeGame 登录");

      const handler: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith(MOCK_API_PREFIX)) {
          next();
          return;
        }
        const method = url.slice(MOCK_API_PREFIX.length).split("?")[0];
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          let body: Record<string, unknown> = {};
          try {
            body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
          } catch {
            body = {};
          }
          const payload = route(method, body);
          server.config.logger.info("[lol-tft] mock " + method + " " + JSON.stringify(body).slice(0, 120));
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(payload));
        });
      };

      server.middlewares.use(handler);
    }
  };
}
