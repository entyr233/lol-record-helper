/**
 * 开发期的"数据源会话"：保存一次粘贴进来的 WeGame cookie。
 * 只存在内存里，进程结束即失效；不会落盘、不会进 git。
 */
export const devSession = {
  cookie: (process.env.LOL_TFT_COOKIE ?? "").trim()
};

export function hasCookie(): boolean {
  return devSession.cookie.length > 0;
}

export function setCookie(cookie: string): void {
  devSession.cookie = (cookie ?? "").trim();
}

export function clearCookie(): void {
  devSession.cookie = "";
}
