import { canUsePanelHere } from "./host";
import { registerMenuCommands } from "./menu";
import { installHelperTgpBridge, installBridge, isLolQqBridgeHost } from "./bridge";
import { createPanel } from "./overlay";
import { mountLauncher } from "./launcher";

function startShell(): void {
  const VERSION = __VERSION__;
  registerMenuCommands(() => openPanel());
  installHelperTgpBridge();
  if (isLolQqBridgeHost()) { installBridge(); return; }
  if (window.top !== window) return;
  const log = (...args: unknown[]) => console.log("[lol-tft] v" + VERSION, ...args);
  const warn = (...args: unknown[]) => console.warn("[lol-tft] v" + VERSION, ...args);
  const panel = createPanel(log, warn);
  const { openPanel, closePanel } = panel;
  /** 暴露到页面 window，便于在控制台手动调用排查：__LOL_TFT__.open() */
  function expose() {
    const api = { version: VERSION, open: openPanel, close: closePanel };
    try { if (typeof unsafeWindow !== "undefined" && unsafeWindow) unsafeWindow.__LOL_TFT__ = api; } catch (e) { /* ignore */ }
    try { window.__LOL_TFT__ = api; } catch (e) { /* ignore */ }
  }

  /** 从菜单在其它网站打开时带 ?lol_tft_panel=1，进入 WeGame 后自动弹面板并从地址栏移除 */
  function consumePanelParam() {
    try {
      const search = location.search || "";
      if (search.indexOf("lol_tft_panel=1") < 0) return false;
      try {
        const url = new URL(location.href);
        url.searchParams.delete("lol_tft_panel");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      } catch (e) { /* 地址清理失败不影响打开面板 */ }
      return true;
    } catch (e) {
      return false;
    }
  }

  function bootstrap() {
    try {
      expose();
      const autoOpen = canUsePanelHere() && consumePanelParam();
      const start = function () {
        mountLauncher(panel, log, warn);
        if (autoOpen) void openPanel();
      };
      if (!document.body) {
        warn("body 尚未就绪，等待 DOMContentLoaded");
        document.addEventListener("DOMContentLoaded", start, { once: true });
        return;
      }
      start();
    } catch (error) {
      warn("初始化失败：", error);
    }
  }

  log("脚本已注入", location.href);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

}
startShell();
