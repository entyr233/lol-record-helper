import type { Connect, Plugin } from "vite";
import { MOCK_API_PREFIX, route } from "./mockData.ts";
import { clearCookie, devSession, hasCookie, setCookie } from "./devSession.ts";

/**
 * 开发期中间件，做两件事：
 *
 * 1) 数据源切换：POST /__lol-tft/cookie 粘贴一次 WeGame cookie 即可从 mock 切到真实接口
 *    DELETE /__lol-tft/cookie 切回 mock；GET /__lol-tft/status 查询当前模式
 * 2) mock：没有 cookie（或强制 LOL_TFT_MOCK=1）时，用 sample/*.json 提供 5 个接口
 *
 * 环境变量：
 *   LOL_TFT_MOCK=1  强制 mock
 *   LOL_TFT_MOCK=0  强制真实接口（此时没有 cookie 会看到未登录错误）
 *   LOL_TFT_COOKIE  初始 cookie（等价于打开页面后粘贴）
 */
export function devApiPlugin(): Plugin {
  const forced = process.env.LOL_TFT_MOCK;

  return {
    name: "lol-tft-dev-api",
    apply: "serve",
    configureServer(server) {
      const logger = server.config.logger;
      const mockEnabled = () => (forced === "0" ? false : forced === "1" ? true : !hasCookie());

      const readBody = (req: Connect.IncomingMessage): Promise<string> =>
        new Promise((resolve) => {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });

      const sendJson = (res: import("node:http").ServerResponse, payload: unknown) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      };

      const handler: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url || "";

        // ---- 数据源控制 ----
        if (url.startsWith("/__lol-tft/status")) {
          sendJson(res, { mode: hasCookie() ? "real" : "mock", hasCookie: hasCookie(), forced: forced ?? null });
          return;
        }
        if (url.startsWith("/__lol-tft/cookie")) {
          if (req.method === "DELETE") {
            clearCookie();
            logger.info("[lol-tft] 已清除 cookie，切回 mock");
            sendJson(res, { mode: "mock" });
            return;
          }
          void readBody(req).then((raw) => {
            let cookie = raw;
            try {
              const parsed = JSON.parse(raw) as { cookie?: string };
              if (parsed && typeof parsed.cookie === "string") cookie = parsed.cookie;
            } catch {
              /* 允许直接发纯文本 */
            }
            setCookie(cookie);
            const ok = hasCookie();
            logger.info(
              ok
                ? "[lol-tft] 已接收 cookie（" + devSession.cookie.length + " 字符），接口切到真实数据"
                : "[lol-tft] cookie 为空，继续使用 mock"
            );
            sendJson(res, { mode: ok ? "real" : "mock", hasCookie: ok });
          });
          return;
        }

        // ---- 接口 mock ----
        if (!url.startsWith(MOCK_API_PREFIX)) {
          next();
          return;
        }
        if (!mockEnabled()) {
          next();
          return;
        }

        const method = url.slice(MOCK_API_PREFIX.length).split("?")[0];
        void readBody(req).then((raw) => {
          let body: Record<string, unknown> = {};
          try {
            body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            body = {};
          }
          const payload = route(method, body);
          logger.info("[lol-tft] mock " + method + " " + JSON.stringify(body).slice(0, 100));
          sendJson(res, payload);
        });
      };

      server.middlewares.use(handler);
      logger.info(
        "[lol-tft] 数据源：" + (mockEnabled() ? "mock（示例数据，可在页面右下角粘贴 cookie 切到真实账号）" : "真实接口（已配置 cookie）")
      );
    }
  };
}
