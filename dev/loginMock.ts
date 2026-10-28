import type { WeGameLoginSdk } from "../src/types/wegame-login";

/** 仅在本地开发/演示页使用：真实环境由 WeGame 页面注入 window.WegameLogin */
const mockSdk: WeGameLoginSdk = {
  isLogin: () => true,
  logout: () => {
    console.warn("[lol-tft] mock logout");
  },
  getUserInfo: () => ({ tgp_id: "10001", nick: "测试召唤师（mock）", faceurl: "", channel: "qq", uin: 10001 }),
  getLoginUser: async () => ({ uin: 10001 }),
  popup: () => undefined,
  onLogin: () => undefined,
  readyPromise: Promise.resolve()
};

export function installDevLoginMock(): void {
  if (typeof window === "undefined") return;
  if (window.WegameLogin && window.WegameLogin.default) return;
  window.WegameLogin = { default: mockSdk };
  console.info("%c[lol-tft] 已注入本地开发用 WegameLogin mock", "color:#b59758");
}
