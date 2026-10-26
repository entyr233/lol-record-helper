import type { WeGameLoginSdk, WeGameLoginUser } from "../types/wegame-login";

function sdk(): WeGameLoginSdk | null {
  if (typeof window === "undefined") return null;
  return (window.WegameLogin && window.WegameLogin.default) || null;
}

export function isSdkAvailable(): boolean {
  return sdk() !== null;
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

export async function getLoginUser(): Promise<{ uin: number } | null> {
  const api = sdk();
  if (!api) return null;
  try {
    const user = await api.getLoginUser();
    return { uin: Number(user.uin) || 0 };
  } catch {
    return null;
  }
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
