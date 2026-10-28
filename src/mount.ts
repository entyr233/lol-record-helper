import { createApp, type App as VueApp } from "vue";
import type { Router } from "vue-router";
import App from "./App.vue";
import { createLolRouter } from "./router";
import cssText from "./styles/app.css?inline";
import { lastPayloads } from "./api/contracts";

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
  const loginWait = new AbortController();
  const router = createLolRouter(loginWait.signal);
  app.use(router);
  app.mount(container);

  // 诊断：控制台执行 __LOL_TFT_DUMP__() 把最近被拒的接口响应复制到剪贴板
  // 必须同时挂到页面上下文（unsafeWindow）——DevTools 控制台默认跑在页面环境
  const dump = () => {
    const text = JSON.stringify(lastPayloads, null, 2);
    try { void navigator.clipboard?.writeText(text).catch(() => undefined); } catch { /* ignore */ }
    return text;
  };
  try {
    const uw = (globalThis as unknown as { unsafeWindow?: Record<string, unknown> }).unsafeWindow;
    if (uw) uw.__LOL_TFT_DUMP__ = dump;
  } catch { /* ignore */ }
  (globalThis as unknown as Record<string, unknown>).__LOL_TFT_DUMP__ = dump;

  return {
    app,
    router,
    host,
    unmount: () => {
      loginWait.abort();
      app.unmount();
      // createWebHashHistory() 会注册 popstate/hashchange 监听；
      // 重复注入或测试中多次挂载时，不销毁会互相抢路由。
      const history = router.options.history as unknown as { destroy?: () => void };
      if (typeof history.destroy === "function") history.destroy();
      container.remove();
      style.remove();
    }
  };
}
