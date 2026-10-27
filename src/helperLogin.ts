import { createApp } from "vue";
import HelperLogin from "./components/HelperLogin.vue";
import styles from "./styles/helperLogin.css?inline";

/** 仅为官方助手页提供登录入口，不挂载战绩路由或读取战绩接口。 */
export function mountHelperLogin(): { unmount(): void } | null {
  if (!/^(www\.)?wegame\.com\.cn$/.test(location.hostname) || !/^\/helper\/lol(?:\/|$)/.test(location.pathname)) return null;
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
