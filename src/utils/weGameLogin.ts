import type { WeGameLoginSdk, WeGameLoginUser } from "../types/wegame-login";

function sdk(): WeGameLoginSdk | null {
  if (typeof window === "undefined") return null;
  // 沙箱环境（@grant 后）里页面全局挂在 unsafeWindow 上
  try {
    const uw = (globalThis as unknown as { unsafeWindow?: { WegameLogin?: { default?: WeGameLoginSdk } } }).unsafeWindow;
    if (uw?.WegameLogin?.default) return uw.WegameLogin.default;
  } catch { /* 无 unsafeWindow */ }
  return (window.WegameLogin && window.WegameLogin.default) || null;
}

export function isSdkAvailable(): boolean {
  return sdk() !== null;
}

export function isLoggedIn(): boolean {
  return isLogin();
}

export class LoginError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LoginError";
  }
}

export interface LoginWaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

function cancelled(): LoginError {
  return new LoginError("CANCELLED", "已取消登录操作，可重新尝试。");
}

/** SDK 调用也可能永不返回；统一限制时间并在取消时清理定时器。 */
function bounded<T>(value: PromiseLike<T> | T, deadline: number, signal: AbortSignal | undefined, error: LoginError): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => { cleanup(); reject(cancelled()); };
    const timer = setTimeout(() => { cleanup(); reject(error); }, Math.max(0, deadline - Date.now()));
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(value).then(
      (result) => { cleanup(); resolve(result); },
      () => { cleanup(); reject(error); }
    );
  });
}

function pause(deadline: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(cancelled()); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, Math.max(0, Math.min(200, deadline - Date.now())));
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function readySdk(deadline: number, signal?: AbortSignal): Promise<WeGameLoginSdk> {
  let api = sdk();
  while (!api && Date.now() < deadline) {
    await pause(deadline, signal);
    api = sdk();
  }
  if (signal?.aborted) throw cancelled();
  if (!api) throw new LoginError("SDK_UNAVAILABLE", "未加载到 WeGame 登录 SDK，请刷新页面后重试。");
  const error = new LoginError("SDK_NOT_READY", "WeGame 登录 SDK 尚未就绪或初始化失败，请重试。");
  try {
    if (api.readyPromise) await bounded(api.readyPromise, deadline, signal, error);
  } catch (cause) {
    if (cause instanceof LoginError) throw cause;
    throw error;
  }
  return api;
}

/** 等待初始化失败只影响登录操作，不阻塞浮动面板和搜索。 */
export function waitForSdk(options: LoginWaitOptions = {}): Promise<WeGameLoginSdk> {
  return readySdk(Date.now() + (options.timeoutMs ?? 4000), options.signal);
}

export async function triggerLogin(options: LoginWaitOptions = {}): Promise<void> {
  // SDK 不在（面板默认不注入）时按需加载
  if (!sdk()) await injectLoginSdk();
  const deadline = Date.now() + (options.timeoutMs ?? 4000);
  const api = await readySdk(deadline, options.signal);
  if (options.signal?.aborted) throw cancelled();
  const error = new LoginError("POPUP_FAILED", "无法打开 WeGame 登录窗口，请重试或先在官网完成登录，再点击重新读取账号。");
  try {
    if (typeof api.popup !== "function") throw error;
    await bounded(api.popup(), deadline, options.signal, error);
  } catch (cause) {
    if (cause instanceof LoginError) throw cause;
    throw error;
  }
}

export function isLogin(): boolean {
  const api = sdk();
  try {
    return api ? api.isLogin() : false;
  } catch {
    return false;
  }
}

export function getUserInfo(): WeGameLoginUser | null {
  const api = sdk();
  if (!api) return null;
  try {
    return api.getUserInfo();
  } catch {
    return null;
  }
}

function normalizeUin(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      if (value > 0) throw new LoginError("UNSAFE_UIN", "登录 SDK 返回的账号数字无法精确表示，请重新登录后重试。");
      return null;
    }
    return String(value);
  }
  return typeof value === "string" && /^\d+$/.test(value) && /[1-9]/.test(value) ? value : null;
}

async function readAccount(options: LoginWaitOptions, waitForSession: boolean): Promise<{ uin: string }> {
  const deadline = Date.now() + (options.timeoutMs ?? (waitForSession ? 180000 : 4000));
  const api = await readySdk(Math.min(deadline, Date.now() + 4000), options.signal);
  let error = new LoginError("ACCOUNT_UNAVAILABLE", "已登录，但尚未读取到账号，请点击重新读取账号重试。");
  do {
    if (options.signal?.aborted) throw cancelled();
    try {
      if (!api.isLogin()) {
        error = new LoginError("NOT_LOGGED_IN", "尚未完成 WeGame 登录，请登录后重试。");
        if (!waitForSession) throw error;
      } else {
        const user = await bounded(api.getLoginUser(), Math.min(deadline, Date.now() + 1000), options.signal,
          new LoginError("ACCOUNT_READ_FAILED", "读取登录账号失败，请点击重新读取账号重试。"));
        const uin = normalizeUin(user?.uin);
        if (uin) return { uin };
        error = new LoginError("ACCOUNT_UNAVAILABLE", "已登录，但尚未读取到账号，请点击重新读取账号重试。");
      }
    } catch (cause) {
      if (cause instanceof LoginError && ["CANCELLED", "UNSAFE_UIN", "NOT_LOGGED_IN"].includes(cause.code)) throw cause;
      error = cause instanceof LoginError ? cause : new LoginError("ACCOUNT_READ_FAILED", "读取登录账号失败，请点击重新读取账号重试。");
    }
    if (Date.now() < deadline) await pause(deadline, options.signal);
  } while (Date.now() < deadline);
  throw error;
}

export function getLoginUser(options: LoginWaitOptions = {}): Promise<{ uin: string }> {
  return readAccount(options, false);
}

/** 登录标志为 true 后仍要等到 UIN 可读；关闭弹窗可用界面的取消按钮结束等待。 */
export function waitForLogin(options: LoginWaitOptions = {}): Promise<{ uin: string }> {
  return readAccount(options, true);
}

/**
 * 尽力清除 wegame 域下可被 JS 访问的 cookie。
 * 注意：HttpOnly 的登录 cookie 必须由 SDK/浏览器扩展清理，这不是本函数能触及的。
 */
export function clearVisibleCookies(domain = "wegame.com.cn"): void {
  try {
    const cookies = document.cookie.match(/[^ =;]+(?==)/g);
    if (!cookies) return;
    for (const name of cookies) {
      document.cookie = name + "=0;expires=" + new Date(0).toUTCString() + ";Domain=" + domain + ";max-age=0;path=/";
    }
  } catch {
    /* ignore */
  }
}

/** 注销：优先交给 WeGame 登录 SDK，失败时再做一次可达范围的 cookie 清理 */
export function logout(): void {
  clearVisibleCookies();
  const api = sdk();
  if (!api) return;
  try {
    api.logout();
  } catch {
    /* ignore */
  }
}

/**
 * 从 cookie 直接读登录 uin（wegame 登录态的落地形式：uin=o0123456789 / p_uin=...）。
 * 现任助手前端就是这么取的（Ge()：优先 uin，其次 p_uin）。
 */
export function getSelfUinFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const read = (name: string): string | null => {
    const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  };
  for (const name of ["uin", "p_uin"]) {
    const raw = read(name);
    if (!raw) continue;
    const digits = raw.replace(/^o/, "").replace(/\D/g, "");
    // 必须去掉前导零：o0643194418 -> 643194418（保留前导零会被服务端判 ILLEGAL_REQ 8000101）
    if (digits) return String(Number(digits));
  }
  return null;
}

/**
 * 统一的登录态判断：以 cookie 为准，SDK 的 isLogin() 只作辅助。
 * 原因：SDK 状态在页面刷新后经常不可靠，而接口鉴权真正吃的是 cookie。
 */
export function hasLoginState(): boolean {
  if (getSelfUinFromCookie()) return true;
  return isSdkAvailable() && isLoggedIn();
}

const LOGIN_SDK_URL = "https://www.wegame.com.cn/middle/login/login.sdk.js";

/**
 * 按需注入登录 SDK。
 * 注意：不在面板打开时注入——SDK 初始化会做票据握手，在不利的网络环境
 * （拦截插件打断跨域换票）下会把还有效的会话换成"半更新"状态，表现为掉登录。
 */
export function injectLoginSdk(timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    if (sdk()) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const inject = () => {
      try {
        const target = (globalThis as unknown as { unsafeWindow?: { document?: Document } }).unsafeWindow?.document ?? document;
        const script = target.createElement("script");
        script.src = LOGIN_SDK_URL;
        script.async = true;
        script.onerror = () => resolve(false);
        (target.head || target.documentElement || target.body).appendChild(script);
      } catch {
        try {
          const script = document.createElement("script");
          script.src = LOGIN_SDK_URL;
          script.async = true;
          script.onerror = () => resolve(false);
          (document.head || document.documentElement).appendChild(script);
        } catch { resolve(false); }
      }
    };
    inject();
    const timer = setInterval(() => {
      if (sdk()) { clearInterval(timer); resolve(true); return; }
      if (Date.now() - started > timeoutMs) { clearInterval(timer); resolve(false); }
    }, 300);
  });
}
