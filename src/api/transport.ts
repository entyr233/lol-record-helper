import { ApiError } from "./errors";

export interface MinimalResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  body?: ReadableStream<Uint8Array> | null;
}

interface GMResponseLike {
  status: number;
  responseText?: string;
  response?: string;
  responseHeaders?: string | Record<string, string>;
}

interface GMRequestDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: FormData | string;
  timeout?: number;
  onload?: (response: GMResponseLike) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}

type GMXmlhttpRequest = (details: GMRequestDetails) => { abort?: () => void } | void;

function gm(): GMXmlhttpRequest | null {
  const candidate = (globalThis as unknown as { GM_xmlhttpRequest?: GMXmlhttpRequest }).GM_xmlhttpRequest;
  return typeof candidate === "function" ? candidate : null;
}

export function hasGmTransport(): boolean {
  return gm() !== null;
}

/**
 * 页面上下文的 fetch：用户脚本沙箱（@grant 后）里的 window.fetch 不带页面的
 * HttpOnly cookie，必须借 unsafeWindow 的原生 fetch 才能让接口读到登录态。
 */
function pageFetch(): typeof fetch | null {
  try {
    const uw = (globalThis as unknown as { unsafeWindow?: { fetch?: typeof fetch } }).unsafeWindow;
    if (uw && typeof uw.fetch === "function") return uw.fetch.bind(uw);
  } catch { /* 无 unsafeWindow（普通页面/测试环境） */ }
  return null;
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, globalThis.location?.href).host === globalThis.location?.host;
  } catch {
    return false;
  }
}

export interface TransportOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function parseHeaders(raw: string | Record<string, string> | undefined): { get: (name: string) => string | null } {
  const map = new Map<string, string>();
  if (typeof raw === "string") {
    for (const line of raw.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx > 0) map.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) map.set(k.toLowerCase(), String(v));
  }
  return { get: (name) => map.get(name.toLowerCase()) ?? null };
}

function responseFrom(text: string, status: number, rawHeaders: GMResponseLike["responseHeaders"]): MinimalResponse {
  return { ok: status >= 200 && status < 300, status, headers: parseHeaders(rawHeaders), json: async () => JSON.parse(text) as unknown };
}

function gmRequest(impl: GMXmlhttpRequest, method: "GET" | "POST", url: string, data: FormData | string | undefined, headers: Record<string, string> | undefined, timeout: number, signal?: AbortSignal): Promise<GMResponseLike> {
  if (signal?.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    let settled = false;
    let handle: ReturnType<GMXmlhttpRequest>;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => done(() => {
      reject(new DOMException("aborted", "AbortError"));
      handle?.abort?.();
    });
    const onTimeout = () => done(() => {
      reject(new ApiError("TIMEOUT", url, "请求超时"));
      handle?.abort?.();
    });
    const timer = setTimeout(onTimeout, timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      handle = impl({
        method,
        url,
        headers,
        data,
        timeout,
        onload: (response) => done(() => resolve(response)),
        onerror: () => done(() => reject(new ApiError("NETWORK", url, "网络请求失败"))),
        ontimeout: onTimeout
      });
    } catch (error) {
      done(() => reject(error));
    }
  });
}

/**
 * 统一请求路径：
 * 1) 同源 -> 页面上下文 fetch（cookie 完整，包括 HttpOnly 的 tgp_ticket）
 * 2) 跨源 -> GM_xmlhttpRequest（绕 CORS，带目标域 cookie）
 * 3) 都没有 -> 普通 fetch（开发/测试环境）
 */
async function send(url: string, body: FormData | string, headers: Record<string, string> | undefined, timeout: number, signal?: AbortSignal): Promise<MinimalResponse> {
  const sameOrigin = isSameOrigin(url);
  const pf = sameOrigin ? pageFetch() : null;
  if (pf) {
    return viaFetch(pf, url, body, headers, timeout, signal);
  }
  const impl = gm();
  if (impl) {
    const response = await gmRequest(impl, "POST", url, body, headers, timeout, signal);
    return responseFrom(response.responseText ?? response.response ?? "", response.status, response.responseHeaders);
  }
  return viaFetch(globalThis.fetch.bind(globalThis), url, body, headers, timeout, signal);
}

async function viaFetch(fetchImpl: typeof fetch, url: string, body: FormData | string, headers: Record<string, string> | undefined, timeout: number, signal?: AbortSignal): Promise<MinimalResponse> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const controller = new AbortController();
  const dispose = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  };
  const timer = setTimeout(() => {
    controller.abort(new DOMException("timeout", "TimeoutError"));
    dispose();
  }, timeout);
  const onAbort = () => { controller.abort(signal?.reason); dispose(); };
  signal?.addEventListener("abort", onAbort, { once: true });
  // 注意：不能用 fetch(...).finally —— 测试环境里 fetch 可能返回非 Promise 的 Response-like
  try {
    const response = await fetchImpl(url, { method: "POST", body, credentials: "include", headers, signal: controller.signal });
    if (!response.ok) { dispose(); return response; }
    return {
      ok: response.ok, status: response.status, headers: response.headers, body: response.body,
      json: async () => {
        try { return await response.json(); } finally { dispose(); }
      }
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export async function postJson(url: string, body: unknown, options: TransportOptions = {}): Promise<MinimalResponse> {
  const timeout = options.timeoutMs ?? 12000;
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  return send(url, JSON.stringify(body), headers, timeout, options.signal);
}

export async function postForm(url: string, form: FormData, options: TransportOptions = {}): Promise<MinimalResponse> {
  const timeout = options.timeoutMs ?? 15000;
  // FormData 的 Content-Type（boundary）由浏览器/GM 自动生成，不手动指定
  return send(url, form, undefined, timeout, options.signal);
}

/** GM GET 请求：跨域搜索类接口（不需要登录 cookie，但被 CORS 挡在浏览器 fetch 外） */
export async function gmGet(url: string, timeoutMs = 15000, signal?: AbortSignal): Promise<string> {
  const impl = gm();
  if (!impl) throw new Error("GM 传输不可用");
  const response = await gmRequest(impl, "GET", url, undefined, undefined, timeoutMs, signal);
  if (!(response.status >= 200 && response.status < 300)) {
    throw new ApiError(String(response.status), url, "HTTP " + response.status);
  }
  return response.responseText ?? response.response ?? "";
}
