// @vitest-environment node
import { PassThrough } from "node:stream";
import type { ServerResponse } from "node:http";
import { resolveConfig, type Connect, type ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Never import the real session initializer or read LOL_TFT_COOKIE in these tests.
const session = vi.hoisted(() => ({ cookie: "" }));
vi.mock("../dev/devSession.ts", () => ({
  devSession: session,
  hasCookie: () => session.cookie.length > 0,
  normalizeCookie: (cookie: string) => cookie.replace(/^cookie\s*:\s*/i, "").trim(),
  setCookie: (cookie: string) => { session.cookie = cookie.trim(); },
  clearCookie: () => { session.cookie = ""; }
}));
import { devApiPlugin } from "../dev/mockServer";

const origin = "http://127.0.0.1:5173";
const baseline = "FAKE_ONLY=baseline";
const supplied = "FAKE_ONLY=provided";
const logger = { info: vi.fn() };
let handler: Connect.NextHandleFunction;

function installHandler(): void {
  const plugin = devApiPlugin();
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({
    config: { logger, server: {} },
    middlewares: { use: (value: Connect.NextHandleFunction) => { handler = value; } }
  } as unknown as ViteDevServer);
}

interface Result {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  raw: string;
}

function request(method: string, path: string, options: {
  headers?: Record<string, string | undefined>;
  chunks?: string[];
  event?: "aborted" | "error";
} = {}): Promise<Result> {
  return new Promise((resolve) => {
    const req = Object.assign(new PassThrough(), {
      method, url: path,
      headers: { host: "127.0.0.1:5173", origin, ...options.headers }
    }) as unknown as Connect.IncomingMessage;
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; },
      end: (raw: string) => resolve({ status: res.statusCode, headers, body: JSON.parse(raw), raw })
    };
    handler(req, res as unknown as ServerResponse, () => {
      res.statusCode = 404;
      res.end("{}");
    });
    const stream = req as unknown as PassThrough;
    for (const chunk of options.chunks ?? []) stream.write(chunk);
    if (options.event) stream.emit(options.event, new Error(supplied));
    stream.end();
  });
}

async function sessionHeaders(): Promise<Record<string, string>> {
  const result = await request("GET", "/__lol-tft/status");
  return { "content-type": "application/json", "x-lol-tft-dev-token": String(result.body.devToken) };
}

beforeEach(() => {
  session.cookie = baseline;
  logger.info.mockClear();
  vi.stubEnv("LOL_TFT_MOCK", "");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { error_code: 0 } }))));
  installHandler();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("development session boundary", () => {
  it("覆盖宽松的 --host 设置，强制只绑定 loopback", async () => {
    const config = await resolveConfig({ configFile: false, envFile: false, server: { host: true }, plugins: [devApiPlugin()] }, "serve");
    expect(config.server.host).toBe("127.0.0.1");
  });

  it.each(["GET", "HEAD", "PUT", "PATCH", "OPTIONS"])("%s cookie 返回 405，保持已有会话", async (method) => {
    const result = await request(method, "/__lol-tft/cookie");
    expect(result.status).toBe(405);
    expect(result.headers.allow).toBe("POST, DELETE");
    expect(session.cookie).toBe(baseline);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("status 仅 GET，精确匹配路径但允许查询参数", async () => {
    expect((await request("POST", "/__lol-tft/status")).status).toBe(405);
    for (const path of ["/__lol-tft/cookie/extra", "/__lol-tft/cookie-evil", "/__lol-tft/status-evil"]) {
      expect((await request("POST", path)).status).toBe(404);
    }
    expect((await request("GET", "/__lol-tft/status?fresh=1")).status).toBe(200);
    expect(session.cookie).toBe(baseline);
  });

  it("status 为本地工具提供随机 token，不缓存、不回传 cookie，重启后 token 失效", async () => {
    const first = await request("GET", "/__lol-tft/status", { headers: { origin: undefined } });
    expect(first.status).toBe(200);
    expect(first.body.devToken).toMatch(/^[a-f0-9]{64}$/);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.headers["access-control-allow-origin"]).toBeUndefined();
    expect(first.raw).not.toContain(baseline);
    installHandler();
    const second = await request("GET", "/__lol-tft/status");
    expect(second.body.devToken).not.toBe(first.body.devToken);
    expect((await request("DELETE", "/__lol-tft/cookie", {
      headers: { "content-type": "application/json", "x-lol-tft-dev-token": String(first.body.devToken) }
    })).status).toBe(403);
    expect(session.cookie).toBe(baseline);
  });

  it.each(["https://evil.example", "null", "http://127.0.0.1:9999", undefined])(
    "拒绝 POST/DELETE 的错误或缺失 Origin（%s），即使 token 正确",
    async (value) => {
      const headers = { ...await sessionHeaders(), origin: value };
      for (const method of ["POST", "DELETE"]) {
        expect((await request(method, "/__lol-tft/cookie", { headers })).status).toBe(403);
      }
      expect(session.cookie).toBe(baseline);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    { origin: "https://evil.example" },
    { origin: "null" },
    { origin: undefined, "sec-fetch-site": "cross-site" },
    { host: "evil.example:5173", origin: "http://evil.example:5173" },
    { host: "localhost.evil.example:5173" },
    { host: "127.0.0.1:99999" }
  ])("跨源/伪造 Host 不能读取 token（%j）", async (headers) => {
    const result = await request("GET", "/__lol-tft/status", { headers });
    expect(result.status).toBe(403);
    expect(result.body.devToken).toBeUndefined();
    expect(result.raw).not.toContain(baseline);
  });

  it("Sec-Fetch-Site=cross-site 不能修改会话", async () => {
    const result = await request("DELETE", "/__lol-tft/cookie", {
      headers: { ...await sessionHeaders(), "sec-fetch-site": "cross-site" }
    });
    expect(result.status).toBe(403);
    expect(session.cookie).toBe(baseline);
  });

  it.each([undefined, "wrong-token"])("同源仍需要正确的 token（%s）", async (token) => {
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: { "content-type": "application/json", "x-lol-tft-dev-token": token },
      chunks: [JSON.stringify({ cookie: supplied })]
    });
    expect(result.status).toBe(403);
    expect(session.cookie).toBe(baseline);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"])(
    "POST 和 DELETE 拒绝非 JSON Content-Type（%s）", async (contentType) => {
      for (const method of ["POST", "DELETE"]) {
        const result = await request(method, "/__lol-tft/cookie", {
          headers: { ...await sessionHeaders(), "content-type": contentType }
        });
        expect(result.status).toBe(415);
      }
      expect(session.cookie).toBe(baseline);
    }
  );

  it.each(["broken json", "null", "[]", "{}", '{"cookie":3}', '{"cookie":" "}', '{"cookie":"Cookie: "}'])(
    "非法 JSON/字段不能改变已有会话（%s）", async (body) => {
      const result = await request("POST", "/__lol-tft/cookie", {
        headers: await sessionHeaders(), chunks: [body]
      });
      expect(result.status).toBe(400);
      expect(session.cookie).toBe(baseline);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("Content-Length 过大立即拒绝；分块及虚报长度也受实际字节上限约束", async () => {
    const headers = await sessionHeaders();
    expect((await request("POST", "/__lol-tft/cookie", {
      headers: { ...headers, "content-length": "16385" }
    })).status).toBe(413);
    for (const length of [undefined, "1"]) {
      expect((await request("POST", "/__lol-tft/cookie", {
        headers: { ...headers, "content-length": length }, chunks: ["x".repeat(8192), "x".repeat(8193)]
      })).status).toBe(413);
    }
    expect((await request("POST", "/__lol-tft/cookie", {
      headers, chunks: ["中".repeat(6000)]
    })).status).toBe(413);
    expect(session.cookie).toBe(baseline);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("恰好 16 KiB 的合法 JSON 可以接收，响应与日志均不包含 cookie", async () => {
    const cookie = "x".repeat(16384 - Buffer.byteLength(JSON.stringify({ cookie: "" })));
    const body = JSON.stringify({ cookie });
    expect(Buffer.byteLength(body)).toBe(16384);
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: { ...await sessionHeaders(), "content-type": "application/json; charset=utf-8" }, chunks: [body]
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ mode: "real", hasCookie: true, check: { ok: true } });
    expect(session.cookie).toBe(cookie);
    expect(result.raw).not.toContain(cookie);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(cookie);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["aborted", "error"] as const)("请求 %s 时不改变会话、不泄漏错误原文", async (event) => {
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: await sessionHeaders(), chunks: ['{"cookie":"'], event
    });
    expect(result.status).toBe(400);
    expect(result.raw).not.toContain(supplied);
    expect(session.cookie).toBe(baseline);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("合法 DELETE 清除会话，非空 DELETE 请求体不清除", async () => {
    const headers = await sessionHeaders();
    expect((await request("DELETE", "/__lol-tft/cookie", { headers, chunks: ["{}"] })).status).toBe(400);
    expect(session.cookie).toBe(baseline);
    expect((await request("DELETE", "/__lol-tft/cookie", { headers })).body).toEqual({ mode: "mock" });
    expect(session.cookie).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["upstream-error", "upstream-payload"])("%s 原文不会通过响应或日志泄漏 cookie", async (kind) => {
    const fetchMock = vi.mocked(fetch);
    if (kind === "upstream-error") fetchMock.mockRejectedValue(new Error(supplied));
    else fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: { error_code: supplied, error_message: supplied } })));
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: await sessionHeaders(), chunks: [JSON.stringify({ cookie: supplied })]
    });
    expect(result.status).toBe(200);
    expect(session.cookie).toBe(baseline);
    expect(result.body).toMatchObject({ check: { ok: false } });
    expect(result.raw).not.toContain(supplied);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(supplied);
  });

  it.each([0, "0"])("只有明确业务成功码 %j 才提交候选会话", async (code) => {
    session.cookie = "";
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ result: { error_code: code } })));
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: await sessionHeaders(), chunks: [JSON.stringify({ cookie: supplied })]
    });
    expect(result.body).toMatchObject({ mode: "real", hasCookie: true, check: { ok: true, code } });
    expect(session.cookie).toBe(supplied);
  });

  it.each([8000102, 8000004, 8000022, "WG_COMM_ERR_USER_CONFIG_LIMIT", null, false, "00"])(
    "非成功码 %j 不替换已有会话，返回明确失败", async (code) => {
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ result: { error_code: code } })));
      const result = await request("POST", "/__lol-tft/cookie", {
        headers: await sessionHeaders(), chunks: [JSON.stringify({ cookie: supplied })]
      });
      expect(result.body).toMatchObject({ mode: "real", hasCookie: true, check: { ok: false, reason: expect.any(String) } });
      expect(session.cookie).toBe(baseline);
      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(init?.headers).toMatchObject({ cookie: supplied });
    }
  );

  it.each([null, {}, { result: {} }, { result: null }])("缺少成功码 %j 不把 mock 切到真实模式", async (payload) => {
    session.cookie = "";
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload)));
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: await sessionHeaders(), chunks: [JSON.stringify({ cookie: supplied })]
    });
    expect(result.body).toMatchObject({ mode: "mock", hasCookie: false, check: { ok: false, reason: expect.any(String) } });
    expect(session.cookie).toBe("");
  });

  it.each(["http", "invalid-json"])("上游 %s 失败不提交候选 Cookie", async (kind) => {
    vi.mocked(fetch).mockResolvedValue(kind === "http"
      ? new Response(JSON.stringify({ result: { error_code: 0 } }), { status: 503 })
      : new Response("invalid json " + supplied));
    const result = await request("POST", "/__lol-tft/cookie", {
      headers: await sessionHeaders(), chunks: [JSON.stringify({ cookie: supplied })]
    });
    expect(result.body).toMatchObject({ check: { ok: false, reason: expect.any(String) } });
    expect(session.cookie).toBe(baseline);
    expect(result.raw).not.toContain(supplied);
  });
});
