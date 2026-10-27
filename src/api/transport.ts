import { ApiError } from "./errors";

export interface MinimalResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
}

interface GMResponseLike {
  status: number;
  responseText: string;
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

type GMXmlhttpRequest = (details: GMRequestDetails) => unknown;

function gm(): GMXmlhttpRequest | null {
  const candidate = (globalThis as unknown as { GM_xmlhttpRequest?: GMXmlhttpRequest }).GM_xmlhttpRequest;
  return typeof candidate === "function" ? candidate : null;
}

/** 用户脚本环境里有 GM（绕 CORS、自动带目标域 cookie）；普通页面回落到 fetch */
export function hasGmTransport(): boolean {
  return gm() !== null;
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

function gmRequest(url: string, data: FormData | string, headers: Record<string, string> | undefined, timeout: number, signal?: AbortSignal): Promise<MinimalResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (settled) return; settled = true; fn(); };
    const timer = setTimeout(() => done(() => reject(new ApiError("TIMEOUT", url, "请求超时"))), timeout);
    signal?.addEventListener("abort", () => done(() => reject(new DOMException("aborted", "AbortError"))), { once: true });
    gm()!({
      method: "POST",
      url,
      headers,
      data,
      timeout,
      onload: (response) => done(() => { clearTimeout(timer); resolve(responseFrom(String(response.responseText ?? ""), Number(response.status) || 200, response.responseHeaders)); }),
      onerror: () => done(() => { clearTimeout(timer); reject(new ApiError("NETWORK", url, "网络请求失败")); }),
      ontimeout: () => done(() => { clearTimeout(timer); reject(new ApiError("TIMEOUT", url, "请求超时")); })
    });
  });
}

function fetchRequest(url: string, body: FormData | string, headers: Record<string, string> | undefined, timeout: number, signal?: AbortSignal): Promise<MinimalResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeout);
  signal?.addEventListener("abort", () => { controller.abort(signal?.reason); }, { once: true });
  // 注意：不能写成 fetch(...).finally —— 测试与某些环境里 fetch 的返回值可能是非 Promise 的 Response-like
  try {
    return fetch(url, { method: "POST", body, credentials: "include", headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson(url: string, body: unknown, options: TransportOptions = {}): Promise<MinimalResponse> {
  const timeout = options.timeoutMs ?? 12000;
  const headers = { ...(options.headers ?? {}) };
  const gmApi = gm();
  if (gmApi) return gmRequest(url, JSON.stringify(body), headers, timeout, options.signal);
  return fetchRequest(url, JSON.stringify(body), headers, timeout, options.signal);
}

export async function postForm(url: string, form: FormData, options: TransportOptions = {}): Promise<MinimalResponse> {
  const timeout = options.timeoutMs ?? 15000;
  const gmApi = gm();
  if (gmApi) return gmRequest(url, form, undefined, timeout, options.signal);
  // 浏览器直连时浏览器会自动设置 multipart 的 Content-Type
  return fetchRequest(url, form, undefined, timeout, options.signal);
}
