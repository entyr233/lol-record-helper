import { createApp, type App as VueApp } from "vue";
import type { Router } from "vue-router";
import App from "./App.vue";
import { createLolRouter } from "./router";
import cssText from "./styles/app.css?inline";

export interface MountOptions {
  /** 挂载宿主节点；不传则自己创建并附加到 body */
  host?: HTMLElement;
  /** 是否使用 Shadow DOM 隔离样式（默认 true，强烈建议保持） */
  shadow?: boolean;
}

export interface MountedInstance {
  app: VueApp;
  router: Router;
  host: HTMLElement;
  unmount: () => void;
}

/**
 * 把战绩查询 UI 挂载到宿主页面。
 * 默认使用 Shadow DOM：宿主页面的 CSS 进不来，我们的 CSS 也漏不出去。
 */
export function mountLolTft(options: MountOptions = {}): MountedInstance {
  if (typeof document === "undefined") {
    throw new Error("lol-tft 只能在浏览器环境挂载");
  }

  const host = options.host ?? document.createElement("div");
  if (!host.id) host.id = "lol-tft-root";
  if (!host.isConnected) document.body.appendChild(host);

  const useShadow = options.shadow !== false;
  const root: ParentNode = useShadow ? host.attachShadow({ mode: "open" }) : host;

  const style = document.createElement("style");
  style.textContent = cssText;
  root.appendChild(style);

  const container = document.createElement("div");
  container.className = "lol-tft-container";
  root.appendChild(container);

  const app = createApp(App);
  const router = createLolRouter();
  app.use(router);
  app.mount(container);

  return {
    app,
    router,
    host,
    unmount: () => {
      app.unmount();
      container.remove();
      style.remove();
    }
  };
}
