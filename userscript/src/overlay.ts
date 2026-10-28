import { isHelperPage } from "./host";
import { createUiLoader, diagnosticsText, errorMessage } from "./loader";
import type { MountedUi } from "./types";

export function createPanel(log: (...args: unknown[]) => void, warn: (...args: unknown[]) => void) {
  const VERSION = __VERSION__;
  const Z = "2147483000";
  const STYLE_ID = "lol-tft-entry-style";

  /** 顶层快捷入口：尽量带上当前大区和登录 UIN，打不开时也保留官方入口。 */
  function officialHelperUrl(): string {
    let area = "";
    try {
      area = String(localStorage.getItem("lol_tft:last-area") || "").trim();
    } catch {
      /* 隐私模式 */
    }
    if (!area) return "https://www.wegame.com.cn/helper/lol/#/info/selection";
    const match = document.cookie.match(/(?:^|;\s*)(?:uin|p_uin)=([^;]*)/);
    const raw = match ? decodeURIComponent(match[1]) : "";
    const uin = raw.replace(/^o/, "").replace(/\D/g, "");
    const query = new URLSearchParams();
    if (uin) query.set("uin", String(Number(uin)));
    query.set("area_id", area);
    query.set("account_type", "1");
    return "https://www.wegame.com.cn/helper/lol/#/life/overview?" + query.toString();
  }
  let mounted: MountedUi | null = null;
  let overlay: HTMLDivElement | null = null;
  let loading = false;
  let generation = 0;
  let lastFocused: HTMLElement | null = null;
  const { getLib, ensureLib, UI_URL, UI_SHA256 } = createUiLoader(warn);
  function clearHelperLoadError() {
    const existing = document.getElementById("lol-tft-helper-error");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  /** 助手页 UI 下载失败时显示可重试提示，避免右下角“什么都没有” */
  function showHelperLoadError(error: unknown) {
    if (!isHelperPage() || document.getElementById("lol-tft-helper-error")) return;
    const box = document.createElement("div");
    box.id = "lol-tft-helper-error";
    box.setAttribute("role", "alert");
    box.style.cssText = [
      "position:fixed;right:18px;bottom:18px;z-index:2147483000;max-width:min(360px,calc(100vw - 36px));",
      "display:flex;flex-direction:column;gap:6px;padding:10px 12px;color:#ddd;background:#1a2026;",
      "border:1px solid #4c463d;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.35);",
      "font:12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;"
    ].join("");
    const title = document.createElement("strong");
    title.textContent = "LOL 助手增强加载失败";
    title.style.color = "#d8bd7e";
    const detail = document.createElement("span");
    detail.textContent = "请检查网络或脚本管理器的资源权限，也可以打开 UI 资源地址后再重试。";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重试";
    retry.style.cssText = "padding:4px 10px;color:#d8bd7e;background:#242c37;border:1px solid #4c463d;border-radius:4px;cursor:pointer;";
    retry.addEventListener("click", function () {
      clearHelperLoadError();
      mountHelperPanel();
    });
    const link = document.createElement("a");
    link.href = UI_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "打开 UI 资源";
    link.style.color = "#b59758";
    row.appendChild(retry);
    row.appendChild(link);
    row.appendChild(createCopyDiagnosticsButton(error));
    box.appendChild(title);
    box.appendChild(detail);
    box.appendChild(row);
    if (error) console.warn("[lol-tft] 助手面板加载失败：", error);
    (document.body || document.documentElement).appendChild(box);
  }

  /** 助手页需要 UI 面板：有现成 lib 就同步挂，没有则异步加载后挂 */
  function mountHelperPanel() {
    if (!isHelperPage()) return;
    const current = getLib();
    if (current && typeof current.mountHelperLogin === "function") {
      clearHelperLoadError();
      current.mountHelperLogin();
      return;
    }
    ensureLib().then(function (loaded) {
      clearHelperLoadError();
      if (loaded && typeof loaded.mountHelperLogin === "function") loaded.mountHelperLogin();
    }).catch(function (error) {
      warn("助手面板 UI 加载失败：", error);
      showHelperLoadError(error);
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#lol-tft-launcher{position:fixed;right:18px;bottom:18px;z-index:" + Z + ";",
      "padding:9px 15px;border-radius:20px;border:1px solid #4c463d;background:#1a2026;color:#b59758;",
      "font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;",
      "cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);}",
      "#lol-tft-launcher:hover{background:#232c36;}",
      "#lol-tft-overlay{position:fixed;inset:0;z-index:" + Z + ";display:flex;flex-direction:column;",
      "background:#19212b;color:#ddd;}",
      "#lol-tft-overlay-head{display:flex;flex:none;align-items:center;gap:12px;padding:8px 16px;",
      "background:#1a2026;border-bottom:1px solid #24292e;color:#b59758;",
      "font:13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;}",
      ".lol-tft-overlay-links{margin-left:auto;display:flex;align-items:center;gap:12px;",
      "font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;}",
      ".lol-tft-overlay-links a{color:#9aa4b2;text-decoration:none;white-space:nowrap;}",
      ".lol-tft-overlay-links a:hover{color:#e6c37a;}",
      ".lol-tft-overlay-version{color:#9aa4b2;white-space:nowrap;font:11px/1.4 Consolas,Monaco,monospace;}",
      "#lol-tft-overlay-host{flex:1 1 auto;overflow:auto;}",
      ".lol-tft-overlay-close{padding:4px 12px;border:1px solid #3a4350;border-radius:4px;",
      "background:transparent;color:#b59758;cursor:pointer;font:13px/1.4 inherit;}",
      ".lol-tft-overlay-close:hover{background:rgba(255,255,255,.07);}",
      "@media(max-width:600px){.lol-tft-overlay-links{gap:8px}.lol-tft-overlay-version{display:none}}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
  }

  function closePanel() {
    generation += 1;
    loading = false;
    if (mounted) {
      try { mounted.unmount(); } catch (e) { console.warn("[lol-tft]", e); }
      mounted = null;
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.documentElement.style.overflow = "";
    const launcher = document.getElementById("lol-tft-launcher");
    if (launcher) launcher.style.display = "";
    if (lastFocused && lastFocused.isConnected && typeof lastFocused.focus === "function") {
      try { lastFocused.focus(); } catch (e) { /* ignore */ }
    }
    lastFocused = null;
  }

  function panelDiagnostics(error: unknown) {
    return diagnosticsText({
      version: VERSION,
      sha256: UI_SHA256,
      href: location.href,
      userAgent: navigator.userAgent,
      error: error
    });
  }

  function copyText(text: string): Promise<void> {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }
    return new Promise<void>(function (resolve, reject) {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.cssText = "position:fixed;left:-9999px;top:0;";
        (document.body || document.documentElement).appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (ok) resolve();
        else reject(new Error("copy failed"));
      } catch (error) {
        reject(error);
      }
    });
  }

  function createCopyDiagnosticsButton(error: unknown) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "复制诊断信息";
    button.style.cssText = "margin-top:6px;padding:4px 10px;color:#d8bd7e;background:#242c37;border:1px solid #4c463d;border-radius:4px;cursor:pointer;font:12px/1.5 inherit;";
    button.addEventListener("click", function () {
      copyText(panelDiagnostics(error)).then(function () {
        button.textContent = "已复制";
        setTimeout(function () { button.textContent = "复制诊断信息"; }, 1500);
      }, function () {
        button.textContent = "复制失败";
        setTimeout(function () { button.textContent = "复制诊断信息"; }, 1500);
      });
    });
    return button;
  }

  async function openPanel() {
    if (loading || overlay) return;
    loading = true;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentGeneration = ++generation;
    injectStyle();

    const launcher = document.getElementById("lol-tft-launcher");
    if (launcher) launcher.style.display = "none";

    overlay = document.createElement("div");
    const currentOverlay = overlay;
    overlay.id = "lol-tft-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "LOL 战绩助手");

    const head = document.createElement("div");
    head.id = "lol-tft-overlay-head";
    const title = document.createElement("span");
    title.textContent = "LOL 战绩助手";
    const links = document.createElement("div");
    links.className = "lol-tft-overlay-links";
    const githubLink = document.createElement("a");
    githubLink.href = "https://github.com/" + __REPO__;
    githubLink.target = "_blank";
    githubLink.rel = "noopener noreferrer";
    githubLink.tabIndex = 0;
    githubLink.textContent = "GitHub ↗";
    const helperLink = document.createElement("a");
    helperLink.href = officialHelperUrl();
    helperLink.target = "_blank";
    helperLink.rel = "noopener noreferrer";
    helperLink.tabIndex = 0;
    helperLink.textContent = "官方助手 ↗";
    const version = document.createElement("span");
    version.className = "lol-tft-overlay-version";
    version.textContent = "v" + VERSION;
    links.appendChild(githubLink);
    links.appendChild(helperLink);
    links.appendChild(version);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lol-tft-overlay-close";
    closeBtn.setAttribute("aria-label", "关闭战绩面板");
    closeBtn.textContent = "✕ 关闭 (Esc)";
    closeBtn.addEventListener("click", closePanel);
    head.appendChild(title);
    head.appendChild(links);
    head.appendChild(closeBtn);

    const host = document.createElement("div");
    host.id = "lol-tft-overlay-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    overlay.appendChild(head);
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    host.textContent = "正在加载战绩界面…";
    try { closeBtn.focus(); } catch (e) { /* ignore */ }

    let lib;
    try {
      lib = await ensureLib();
    } catch (error) {
      if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
      host.textContent = "战绩界面加载失败：" + (errorMessage(error));
      host.appendChild(createCopyDiagnosticsButton(error));
      console.error("[lol-tft]", error);
      if (currentGeneration === generation) loading = false;
      return;
    }

    try {
      // 不预载登录 SDK：其初始化票据握手在拦截插件环境下会把有效会话换失效。
      // 需要登录时由应用内「登录 / 重新登录」按钮按需注入。
      if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
      host.textContent = "";
      mounted = lib.mountLolTft({ host: host });
      log("面板已挂载");
    } catch (error) {
      if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
      host.textContent = "加载失败：" + (errorMessage(error));
      host.appendChild(createCopyDiagnosticsButton(error));
      console.error("[lol-tft]", error);
    } finally {
      if (currentGeneration === generation) loading = false;
    }
  }

  function collectFocusable(root: ParentNode): HTMLElement[] {
    const selector = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
    let result = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const all = root.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const shadow = all[i].shadowRoot;
      if (shadow) result = result.concat(collectFocusable(shadow));
    }
    return result.filter(function (el) { return el.getClientRects().length > 0; });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && overlay) closePanel();
    if (event.key !== "Tab" || !overlay) return;
    const items = collectFocusable(overlay);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    if (!items.includes(active as HTMLElement)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return { openPanel, closePanel, injectStyle, mountHelperPanel };
}
