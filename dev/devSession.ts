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

/**
 * 容错解析：用户可能粘贴
 *   - 纯 cookie 串：            "uin=o1; skey=@abc"
 *   - 带前缀：                  "Cookie: uin=o1; skey=@abc"
 *   - 整段 cURL（"Copy as cURL"）：curl 'https://...' -H 'cookie: uin=o1; skey=@abc' ...
 */
export function normalizeCookie(raw: string): string {
  let value = (raw ?? "").trim();
  if (!value) return "";

  const curlMatch = value.match(/(?:-H|--header)\s+['"]?cookie:\s*([^'"]+)['"]?/i);
  if (curlMatch) return curlMatch[1].trim();

  value = value.replace(/^cookie\s*:\s*/i, "");
  return value.replace(/\s+/g, " ").trim();
}

export function setCookie(cookie: string): void {
  devSession.cookie = normalizeCookie(cookie);
}

export function clearCookie(): void {
  devSession.cookie = "";
}
