import type { Connect, Plugin } from "vite";
import { randomBytes } from "node:crypto";
import { MOCK_API_PREFIX, route } from "./mockData.ts";
import { clearCookie, hasCookie, normalizeCookie, setCookie } from "./devSession.ts";

const MAX_SESSION_BODY = 16 * 1024;

class SessionBodyError extends Error {
  constructor(readonly status: number) {
    super("Invalid development session body");
  }
}

function readSessionBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (status: number) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      reject(new SessionBodyError(status));
    };
    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_SESSION_BODY) fail(413);
      else chunks.push(buffer);
    });
    req.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.once("error", () => fail(400));
    req.once("aborted", () => fail(400));
    if (req.aborted) fail(400);
  });
}

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
  const devToken = randomBytes(32).toString("hex");

  return {
    name: "lol-tft-dev-api",
    apply: "serve",
    // Also override --host: the in-memory account session must stay on loopback.
    config: () => ({ server: { host: "127.0.0.1" } }),
    configureServer(server) {
      const logger = server.config.logger;
      const mockEnabled = () => (forced === "0" ? false : forced === "1" ? true : !hasCookie());

      const readBody = (req: Connect.IncomingMessage): Promise<string> =>
        new Promise((resolve) => {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });

      /** 先校验候选 Cookie；只有明确的业务成功码才提交到当前会话。 */
      const validateCookie = async (cookie: string): Promise<{ ok: boolean; code?: number | string; reason?: string }> => {
        try {
          const res = await fetch(
            "https://www.wegame.com.cn/api/v1/wegame.pallas.game.LolBattle/GetBattleReport",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "trpc-caller": "wegame.pallas.web.LolBattle",
                referer: "https://www.wegame.com.cn/home/",
                cookie
              },
              body: JSON.stringify({ account_type: 1, area: 1, id: "0", from_src: "lol_helper" })
            }
          );
          if (!res.ok) return { ok: false, reason: "校验接口 HTTP " + res.status + "，未切换数据源" };
          const data = (await res.json()) as { result?: { error_code?: number | string } } | null;
          const rawCode = data?.result?.error_code;
          // Never reflect arbitrary upstream text into the browser or logs.
          const code = /^\d{1,10}$/.test(String(rawCode)) ? rawCode : undefined;
          const ok = rawCode === 0 || rawCode === "0";
          const reason = ok ? undefined : String(rawCode) === "8000102"
            ? "网关返回 8000102（未登录/缺少鉴权 cookie），未切换数据源"
            : rawCode === undefined ? "校验响应缺少成功码，未切换数据源" : "校验接口未返回成功码，未切换数据源";
          return { ok, code, reason };
        } catch {
          return { ok: false, reason: "校验请求失败" };
        }
      };

      const sendJson = (res: import("node:http").ServerResponse, payload: unknown, status = 200) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      };

      const handler: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url || "";
        const path = url.split("?")[0];

        // ---- 数据源控制 ----
        if (path === "/__lol-tft/status" || path === "/__lol-tft/cookie") {
          res.setHeader("Cache-Control", "no-store");
          const reject = (status: number, error: string) => {
            req.resume();
            sendJson(res, { error }, status);
          };
          const isStatus = path === "/__lol-tft/status";
          if (isStatus ? req.method !== "GET" : req.method !== "POST" && req.method !== "DELETE") {
            res.setHeader("Allow", isStatus ? "GET" : "POST, DELETE");
            reject(405, "不支持的开发会话请求方法");
            return;
          }
          const host = req.headers.host || "";
          if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(host)) {
            reject(403, "开发会话仅允许 loopback 主机");
            return;
          }
          let expectedOrigin: string;
          try {
            expectedOrigin = new URL((server.config.server.https ? "https://" : "http://") + host).origin;
          } catch {
            reject(403, "开发会话主机无效");
            return;
          }
          const origin = req.headers.origin;
          // GET bootstrap also serves local CLI tools; browser cross-site reads are refused.
          if (req.headers["sec-fetch-site"] === "cross-site" || (origin !== undefined && origin !== expectedOrigin) ||
              (!isStatus && origin !== expectedOrigin)) {
            reject(403, "开发会话来源不匹配");
            return;
          }
          if (isStatus) {
            sendJson(res, { mode: hasCookie() ? "real" : "mock", hasCookie: hasCookie(), forced: forced ?? null, devToken });
            return;
          }
          if (req.headers["x-lol-tft-dev-token"] !== devToken) {
            reject(403, "开发会话 token 无效，请刷新页面");
            return;
          }
          if (req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
            reject(415, "开发会话仅接受 application/json");
            return;
          }
          const length = req.headers["content-length"];
          if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_SESSION_BODY)) {
            reject(413, "开发会话请求体过大或长度无效");
            return;
          }
          void readSessionBody(req).then(async (raw) => {
            if (req.method === "DELETE") {
              if (raw.trim()) {
                reject(400, "DELETE 请求体必须为空");
                return;
              }
              clearCookie();
              logger.info("[lol-tft] 已清除 cookie，切回 mock");
              sendJson(res, { mode: "mock" });
              return;
            }
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || !("cookie" in parsed) ||
                typeof parsed.cookie !== "string" || !parsed.cookie.trim()) {
              reject(400, "请求体必须包含非空 cookie 字符串");
              return;
            }
            const cookie = normalizeCookie(parsed.cookie);
            if (!cookie) {
              reject(400, "cookie 不能为空");
              return;
            }
            const check = await validateCookie(cookie);
            if (check.ok) setCookie(cookie);
            logger.info("[lol-tft] 已接收开发会话，校验结果：" + (check.ok ? "通过" : "失败"));
            sendJson(res, { mode: hasCookie() ? "real" : "mock", hasCookie: hasCookie(), check });
          }).catch((error: unknown) => {
            reject(error instanceof SessionBodyError ? error.status : 400, "开发会话请求体无效");
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
