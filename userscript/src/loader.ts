import type { UiLibrary } from "./types";

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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createUiLoader(warn: (...args: unknown[]) => void) {
  const UI_RESOURCE = __UI_RESOURCE__;
  // 固定到 tag（不可变）而不是 master；UI 内容再用 SHA-256 二次校验
  const UI_TAG = "v" + __VERSION__;
  const UI_URLS = buildUiUrls(__REPO__, UI_TAG);
  const UI_URL = UI_URLS[0];
  const UI_SHA256 = __UI_SHA256__;
  let libCache: UiLibrary | null = null;
  let libPromise: Promise<UiLibrary> | null = null;

  /** 校验通过后才执行；不匹配直接拒绝，避免执行被篡改的远端 UI */
  function verifyAndEvaluate(text: string): Promise<UiLibrary> {
    return sha256Hex(text).then(function (hash) {
      if (!UI_SHA256 || hash !== UI_SHA256) {
        throw new Error("UI 资源完整性校验失败（可能被篡改或版本不匹配），已拒绝执行");
      }
      return evaluateLib(normalizeUiText(text));
    });
  }

  /** 复用已加载的 UI 或页面提供的挂载接口。 */
  function getLib(): UiLibrary | null {
    if (libCache) return libCache;
    try {
      if (typeof LolTft !== "undefined" && LolTft && typeof LolTft.mountLolTft === "function") return LolTft;
    } catch (e) { /* ignore */ }
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.LolTft) return unsafeWindow.LolTft;
    } catch (e) { /* ignore */ }
    try {
      if (window.LolTft && typeof window.LolTft.mountLolTft === "function") return window.LolTft;
    } catch (e) { /* ignore */ }
    return null;
  }

  /** 执行 UI bundle：优先 new Function（沙箱内），被 CSP 拦时退回页面内联注入 */
  function evaluateLib(text: string): UiLibrary {
    try {
      const factory = new Function(text + "\n;return (typeof LolTft !== 'undefined' ? LolTft : null);");
      const evaluated = factory() as UiLibrary | null;
      if (evaluated && typeof evaluated.mountLolTft === "function") return evaluated;
    } catch (error) {
      warn("new Function 执行 UI 失败，尝试页面注入：", error);
    }
    const script = document.createElement("script");
    script.textContent = text;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    let pageLib = null;
    try { pageLib = (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.LolTft) || window.LolTft || null; } catch (e) { /* ignore */ }
    if (pageLib && typeof pageLib.mountLolTft === "function") return pageLib;
    throw new Error("UI bundle 无法执行（可能被页面 CSP 拦截）");
  }

  function requestUiTextFrom(url: string): Promise<string> {
    return new Promise<string>(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          timeout: 30000,
          onload: function (response) {
            if (response.status >= 200 && response.status < 300 && response.responseText) resolve(response.responseText);
            else reject(new Error("HTTP " + response.status + "：" + url));
          },
          onerror: function () { reject(new Error("网络错误：" + url)); },
          ontimeout: function () { reject(new Error("请求超时：" + url)); }
        });
        return;
      }
      if (typeof fetch === "function") {
        fetch(url, { credentials: "omit" }).then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status + "：" + url);
          return response.text();
        }).then(resolve, function (error) {
          reject(error && error.message ? error : new Error("网络错误：" + url));
        });
        return;
      }
      reject(new Error("当前环境无法加载 UI bundle"));
    });
  }

  /** 依次尝试 Release / jsDelivr / fastly，任一源通过 SHA-256 校验即可执行。 */
  function requestUiText() {
    const failures: string[] = [];
    function tryAt(index: number): Promise<UiLibrary> {
      if (index >= UI_URLS.length) {
        return Promise.reject(new Error("全部 UI 源加载失败：" + failures.join("；")));
      }
      return requestUiTextFrom(UI_URLS[index]).then(verifyAndEvaluate).catch(function (error) {
        failures.push(errorMessage(error));
        return tryAt(index + 1);
      });
    }
    return tryAt(0);
  }

  /**
   * 按需加载 UI：
   * - 普通网站不调用，脚本只保留菜单；
   * - WeGame 助手页启动时加载（显示登录/大区面板）；
   * - 普通 WeGame 页面在点击「LOL 战绩」时才加载。
   */
  function ensureLib(): Promise<UiLibrary> {
    const current = getLib();
    if (current) return Promise.resolve(current);
    if (libPromise) return libPromise;

    let resourceText = "";
    try {
      if (typeof GM_getResourceText === "function") resourceText = GM_getResourceText(UI_RESOURCE) || "";
    } catch (e) { /* @resource 不可用时走远端 */ }

    let task: Promise<UiLibrary>;
    if (resourceText) {
      task = verifyAndEvaluate(resourceText).catch(function (error) {
        warn("内置 UI 校验/解析失败，尝试从固定 tag 的 CDN 重新下载：", error);
        return requestUiText().catch(function (remoteError) {
          const first = errorMessage(error);
          const second = errorMessage(remoteError);
          throw new Error("内置 UI 校验失败：" + first + "；远端重试失败：" + second);
        });
      });
    } else {
      task = requestUiText();
    }

    libPromise = task.then(function (loaded) {
      libCache = loaded;
      return loaded;
    });
    libPromise.then(function () { libPromise = null; }, function () { libPromise = null; });
    return libPromise;
  }

  return { getLib, ensureLib, UI_URL, UI_SHA256 };
}
