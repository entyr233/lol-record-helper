import { createApp } from "vue";
import HelperLogin from "./components/HelperLogin.vue";
import styles from "./styles/helperLogin.css?inline";

/**
 * 仅为官方助手页（含 /helper/lol/v2/frame.html）提供登录与大区入口，
 * 不挂载战绩路由或读取战绩接口。
 * 如果当前文档是助手页 iframe（父页面同样会挂载面板），跳过以避免重复面板；
 * 跨域父页面读不到路径时仍由当前 frame 自己挂载。
 */
export function mountHelperLogin(): { unmount(): void } | null {
  if (!/^(www\.)?wegame\.com\.cn$/.test(location.hostname) || !/^\/helper\/lol(?:\/|$)/.test(location.pathname)) return null;
  if (window.top && window.top !== window) {
    try {
      if (/^\/helper\/lol(?:\/|$)/.test(window.top.location.pathname)) return null;
    } catch {
      /* 跨域父页面：当前 frame 自己挂载 */
    }
  }
  if (document.getElementById("lol-tft-helper-login")) return null;

  const host = document.createElement("div");
  host.id = "lol-tft-helper-login";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const container = document.createElement("div");
  root.append(style, container);
  document.body.appendChild(host);

  // 刷新当前地址，让官方应用自行重建登录状态，并保留原有路径和 hash。
  const refresh = () => location.reload();
  const app = createApp(HelperLogin, { onAuthenticated: refresh, onRefresh: refresh });
  app.mount(container);
  return {
    unmount() {
      app.unmount();
      host.remove();
    }
  };
}
