import type { LoginCookie } from "./types";
import { isWeGameHost } from "./host";

// 只查询 WeGame 登录和官方战绩请求使用的字段。
const loginNames = [
  "tgp_ticket", "tgp_id", "uin", "p_uin", "skey", "p_skey",
  "tgp_biz_ticket", "tgp_bind_ticket", "tgp_user_type", "tgp_env", "client_type", "region"
];
const sameSiteAttribute = { no_restriction: "None", strict: "Strict", lax: "Lax" };

export async function rememberLogin(): Promise<string> {
  if (!isWeGameHost() || location.protocol !== "https:" || window.top !== window) return "请在 WeGame 官网打开此菜单。";
  const api = typeof GM === "undefined" ? undefined : GM?.cookie;
  if (!api?.list || !api.set) return "当前脚本管理器未提供 Cookie 权限，请检查此脚本的授权。";
  const url = location.origin + "/api/v1/wegame.pallas.game.LolBattle/GetSummonerInfo";
  try {
    const read = (name: string) => api.list({ url, name });
    const tickets = await read("tgp_ticket");
    if (!tickets.some(cookie => cookie.value)) return "未读到 WeGame 登录票据。请先登录，并确认脚本管理器允许访问 WeGame 的 HttpOnly Cookie。";
    const cookies = tickets.concat(...await Promise.all(loginNames.slice(1).map(read)));
    if (!cookies.some(cookie => (cookie.name === "uin" || cookie.name === "p_uin") && cookie.value)) return "未读到当前账号，请完成 WeGame 登录后再试。";
    const pending = cookies.filter(cookie => cookie.session && cookie.value);
    if (!pending.length) return "当前可读取的 WeGame 登录 Cookie 已由浏览器持久保存。";
    // 部分管理器会忽略 SameSite。先用无凭证、短时有效的测试 Cookie 核对写入能力。
    const checked = new Set<LoginCookie["sameSite"]>();
    for (const cookie of pending) {
      if (cookie.partitionKey || cookie.firstPartyDomain ||
          (cookie.sameSite !== "unspecified" && !(cookie.sameSite in sameSiteAttribute))) {
        return "当前票据的保护属性无法完整保留，此次未修改登录 Cookie。";
      }
      if (cookie.httpOnly && cookie.sameSite !== "unspecified" && !checked.has(cookie.sameSite)) {
        const name = "__Host-lol-tft-check-" + crypto.randomUUID();
        await api.set({ url, name, value: "1", path: "/", httpOnly: true, secure: true,
          sameSite: cookie.sameSite, expirationDate: Math.floor(Date.now() / 1000) + 15 });
        if (!(await read(name)).some(item => item.httpOnly && item.sameSite === cookie.sameSite)) {
          return "当前脚本管理器无法保留 HttpOnly 票据的 SameSite 属性，此次未修改登录 Cookie。";
        }
        checked.add(cookie.sameSite);
      }
    }
    const expirationDate = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    for (const cookie of pending) {
      const { name, value, path, httpOnly, secure } = cookie;
      const domain = cookie.hostOnly ? undefined : cookie.domain;
      if (httpOnly || cookie.sameSite === "unspecified") {
        await api.set({ url, name, value, path, domain, httpOnly, secure, expirationDate, sameSite: cookie.sameSite });
      } else {
        document.cookie = name + "=" + value + "; Path=" + path + "; Expires=" + new Date(expirationDate * 1000).toUTCString() +
          "; SameSite=" + sameSiteAttribute[cookie.sameSite] + (domain ? "; Domain=" + domain : "") + (secure ? "; Secure" : "");
      }
    }
    // 部分管理器静默忽略写入。重新读取后才报告成功。
    const saved: LoginCookie[] = (await Promise.all([...new Set(pending.map(cookie => cookie.name))].map(read))).flat();
    if (!pending.every(cookie => saved.some(item => item.name === cookie.name && item.path === cookie.path &&
        item.domain === cookie.domain && item.hostOnly === cookie.hostOnly && item.secure === cookie.secure &&
        item.httpOnly === cookie.httpOnly && item.sameSite === cookie.sameSite && !item.session &&
        item.expirationDate !== undefined && Math.abs(item.expirationDate - expirationDate) <= 1))) {
      return "未能完整保存登录状态，请检查脚本的 WeGame Cookie 权限。";
    }
    return "已在此浏览器保存当前 WeGame 登录，最多 7 天。官方票据提前失效时需重新登录。";
  } catch {
    return "未能确认登录状态已保存，请检查脚本的 WeGame Cookie 权限后重试。";
  }
}
