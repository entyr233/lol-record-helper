/** 可测试的 UI 加载辅助函数：由 build-userscript.mjs 编译后注入脚本壳。 */

export interface DiagnosticsInput {
  version: string;
  sha256: string;
  href: string;
  userAgent: string;
  error?: unknown;
}

export function normalizeUiText(text: unknown): string {
  return String(text ?? "").replace(/\r\n/g, "\n");
}

/** 固定版本 tag 的多个下载源：Release 资产优先，jsDelivr 的 ui 分支兜底。 */
export function buildUiUrls(repo: string, version: string): string[] {
  return [
    "https://github.com/" + repo + "/releases/download/" + version + "/lol-tft-ui.js",
    "https://cdn.jsdelivr.net/gh/" + repo + "@ui/lol-tft-ui.js?v=" + version,
    "https://fastly.jsdelivr.net/gh/" + repo + "@ui/lol-tft-ui.js?v=" + version
  ];
}

export function sha256Hex(text: unknown): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof TextEncoder === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持 UI 完整性校验（缺少 WebCrypto）"));
  }
  return cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(normalizeUiText(text))).then((buffer) => {
    return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
  });
}

export function diagnosticsText(input: DiagnosticsInput): string {
  const message = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  return [
    "LOL 战绩助手 v" + input.version,
    "UI SHA-256: " + input.sha256,
    "URL: " + input.href,
    "UA: " + input.userAgent,
    "错误: " + message
  ].join("\n");
}
