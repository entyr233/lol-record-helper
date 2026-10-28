// ==UserScript==
// @name         LOL战绩查询
// @namespace    mscststs
// @version      __VERSION__
// @description  英雄联盟国服战绩查询，支持官方助手登录、大区切换与掌盟详情回退
// @author       mscststs
// @homepage     https://github.com/entyr233/lol-tft
// @homepageURL  https://github.com/entyr233/lol-tft
// @supportURL   https://github.com/entyr233/lol-tft/issues
// @source       https://github.com/entyr233/lol-tft
// @match        https://www.wegame.com.cn/*
// @match        https://wegame.com.cn/*
// @match        https://lol.qq.com/*
// @match        https://mlol.qt.qq.com/*
// @match        http://*/*
// @match        https://*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wegame.com.cn
// @license      ISC
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @resource     lol-tft-ui https://raw.githubusercontent.com/entyr233/lol-tft/master/userscript/lol-tft-ui.js?v=__UI_VERSION__
// @connect      mlol.qt.qq.com
// @connect      lol.qq.com
// @connect      game.gtimg.cn
// @connect      www.wegame.com.cn
// @connect      wegame.com.cn
// @connect      data.dtodo.cn
// @connect      raw.githubusercontent.com
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/entyr233/lol-tft/master/userscript/lol-tft.user.js
// @updateURL    https://raw.githubusercontent.com/entyr233/lol-tft/master/userscript/lol-tft.user.js
// ==/UserScript==

/**
 * 使用方式：装好脚本后，登录 https://www.wegame.com.cn/ ，右下角会出现「LOL 战绩」按钮。
 *
 * 为什么不用配置 cookie：脚本运行在 wegame 页面里，接口请求 /api/v1/wegame.pallas.game.LolBattle/*
 * 是同源请求，浏览器会自动带上你的登录 cookie —— 和旧版脚本的体验一致。
 *
 * v0.15：改为单文件分发（UI 打包内联），不再依赖 lol-tft.pages.dev 上的远端 bundle。
 * v2.13：UI bundle 改为按需加载（@resource + GM_getResourceText），脚本主体保持精简，
 *        只有 WeGame / 官方助手页或点击悬浮按钮时才加载 UI。
 */

/* ================= lol-tft UI bundle 改为按需加载（@resource） ================= */

(function () {
  "use strict";

  var VERSION = "__VERSION__";

  /** 只有 WeGame / lol.qq.com 页面才挂载悬浮按钮和面板 */
  function isWegameHost() {
    return /^(www\.)?wegame\.com\.cn$/.test(location.hostname);
  }
  function canUsePanelHere() {
    return isWegameHost() || /^lol\.qq\.com$/.test(location.hostname);
  }

  // ---------- 脚本管理器菜单（ScriptCat / Tampermonkey） ----------
  // 注册后脚本列表里就能直接看到这些入口，不必进「编辑」界面找链接。
  // 脚本通过 *://*/* 匹配在任意网站运行，因此菜单在任何网址都可见；
  // 非 WeGame 页面不会注入悬浮按钮。
  var PROJECT_HOME = "https://github.com/entyr233/lol-tft";
  var OFFICIAL_HELPER_URL = "https://www.wegame.com.cn/helper/lol/";
  var PANEL_HOME_URL = "https://www.wegame.com.cn/?lol_tft_panel=1";

  function openProjectUrl(url) {
    try { window.open(url, "_blank", "noopener"); } catch (e) { /* 忽略 */ }
  }

  function openSelfPanelFromMenu() {
    if (canUsePanelHere()) {
      void openPanel();
      return;
    }
    // 在别的网站点菜单：打开 WeGame 并自动弹出面板
    openProjectUrl(PANEL_HOME_URL);
  }

  function registerMenuCommands() {
    var commands = [
      { title: "打开自建战绩面板", run: openSelfPanelFromMenu },
      { title: "打开官方助手页", run: function () { openProjectUrl(OFFICIAL_HELPER_URL); } },
      { title: "打开项目主页", run: function () { openProjectUrl(PROJECT_HOME); } },
      { title: "反馈 / 问题", run: function () { openProjectUrl(PROJECT_HOME + "/issues"); } }
    ];
    try {
      if (typeof GM_registerMenuCommand === "function") {
        commands.forEach(function (command) {
          GM_registerMenuCommand(command.title, command.run);
        });
        return;
      }
      if (typeof GM !== "undefined" && GM && typeof GM.registerMenuCommand === "function") {
        commands.forEach(function (command) {
          GM.registerMenuCommand(command.title, command.run);
        });
      }
    } catch (e) { /* 菜单注册失败不影响主流程 */ }
  }

  registerMenuCommands();

  // ---------- 官方助手页：补一个最小 TGP 桥 ----------
  // 官方助手页在普通浏览器里读不到 WeGame 客户端注入的 top.TGP：
  // 大区会变成 0（提示「未选定大区」），登录用户也不会自动初始化。
  // 脚本在 document-start 尽早写入 top.TGP.status（大区 + uin），让官方页面按当前账号启动。
  function installHelperTgpBridge() {
    try {
      if (!/^(www\.)?wegame\.com\.cn$/.test(location.hostname)) return;
      if (!/^\/helper\/lol(?:\/|$)/.test(location.pathname)) return;
      var uinMatch = document.cookie.match(/(?:^|;\s*)(?:p_)?uin=(o?[0-9]+)/);
      var uin = uinMatch ? String(Number(uinMatch[1].replace(/^o/, ""))) : "";
      if (uin) {
        // 官方页面的兜底逻辑会读 p_uin 推断大区；这里补一份，减少首次初始化失败
        try { document.cookie = "p_uin=o" + uin + "; path=/"; } catch (e) { /* ignore */ }
      }
      var area = 0;
      try {
        area = Number(localStorage.getItem("lol_tft:lol-tft-helper-area") || 0) ||
          Number(localStorage.getItem("lol_tft:last-area") || 0) || 0;
      } catch (e) { /* ignore */ }
      var topWin = window.top;
      topWin.TGP = topWin.TGP || {};
      topWin.TGP.status = topWin.TGP.status || {};
      if (area) topWin.TGP.status.aid = area;
      if (uin) topWin.TGP.status.uin = uin;
    } catch (e) { /* 跨域/权限问题忽略，不影响主流程 */ }
  }

  installHelperTgpBridge();

  // ---------- lol.qq.com 桥接侧：替 wegame 面板做同源 mlol 请求 ----------
  // （掌盟接口 CORS 只放行 lol.qq.com；wegame 面板通过隐藏 iframe + postMessage 调用）
  function isLolQqBridgeHost() {
    return location.hostname === "lol.qq.com" || location.hostname === "mlol.qt.qq.com";
  }

  function installBridge() {
    var wegameOriginRe = /^https:\/\/(www\.)?wegame\.com\.cn$/;
    globalThis.addEventListener("message", function (event) {
      if (!wegameOriginRe.test(event.origin)) return;
      var data = event.data;
      if (!data || data.type !== "lol-tft-detail-request") return;
      if (!data.id) return;

      var url = "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5";
      var form = new FormData();
      form.append("uuid", data.uuid || "");
      form.append("area_id", String(data.areaId || ""));
      form.append("game_id", String(data.gameId || ""));
      form.append("start_time", String(data.startTime || ""));
      var opt = { method: "POST", credentials: "include", body: form };
      fetch(url, opt).then(function (r) { return r.text().then(function (text) { return { text: text, status: r.status }; }); }).then(function (res) {
        event.source.postMessage({ type: "lol-tft-mlol-response", id: data.id, text: res.text, status: res.status }, event.origin);
      }).catch(function (error) {
        event.source.postMessage({ type: "lol-tft-mlol-response", id: data.id, error: String(error && error.message || error) }, event.origin);
      });
    });

    notifyReady();
    [500, 1500, 3000].forEach(function (delay) { setTimeout(notifyReady, delay); });

    function notifyReady() {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "lol-tft-bridge-ready" }, "*");
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (isLolQqBridgeHost()) {
    installBridge();
    return; // lol.qq.com 上不挂战绩面板（任何 frame 都可作桥）
  }

  // wegame 页面的子框架（广告 iframe 等）不挂面板，只在顶层挂
  try {
    if (window.top !== window) return;
  } catch (e) { /* 跨域 top 访问受限说明我们就在子框架里 */ return; }
  var Z = "2147483000";

  function log() {
    try {
      var args = ["[lol-tft] v" + VERSION].concat([].slice.call(arguments));
      console.log.apply(console, args);
    } catch (e) { /* ignore */ }
  }

  function warn() {
    try {
      var args = ["[lol-tft] v" + VERSION].concat([].slice.call(arguments));
      console.warn.apply(console, args);
    } catch (e) { /* ignore */ }
  }
  var STYLE_ID = "lol-tft-entry-style";

  var mounted = null;
  var overlay = null;
  var loading = false;
  var generation = 0;

  var UI_RESOURCE = "lol-tft-ui";
  var UI_URL = "https://raw.githubusercontent.com/entyr233/lol-tft/master/userscript/lol-tft-ui.js?v=__UI_VERSION__";
  var libCache = null;
  var libPromise = null;

  /** 已内联/已加载/页面全局可用的 UI（测试与热更新场景） */
  function getLib() {
    if (libCache) return libCache;
    try {
      if (typeof LolTft !== "undefined" && LolTft && typeof LolTft.mountLolTft === "function") return LolTft;
    } catch (e) { /* ignore */ }
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.LolTft) return unsafeWindow.LolTft;
    } catch (e) { /* ignore */ }
    try {
      if (window.LolTft && typeof window.LolTft.mountLolTft === "function") return window.LolTft;
    } catch (e) { /* ignore */ }
    return null;
  }

  /** 执行 UI bundle：优先 new Function（沙箱内），被 CSP 拦时退回页面内联注入 */
  function evaluateLib(text) {
    try {
      var factory = new Function(text + "\n;return (typeof LolTft !== 'undefined' ? LolTft : null);");
      var evaluated = factory();
      if (evaluated && typeof evaluated.mountLolTft === "function") return evaluated;
    } catch (error) {
      warn("new Function 执行 UI 失败，尝试页面注入：", error);
    }
    var script = document.createElement("script");
    script.textContent = text;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    var pageLib = null;
    try { pageLib = (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.LolTft) || window.LolTft || null; } catch (e) { /* ignore */ }
    if (pageLib && typeof pageLib.mountLolTft === "function") return pageLib;
    throw new Error("UI bundle 无法执行（可能被页面 CSP 拦截）");
  }

  function requestUiText() {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url: UI_URL,
          timeout: 30000,
          onload: function (response) {
            if (response.status >= 200 && response.status < 300 && response.responseText) resolve(response.responseText);
            else reject(new Error("加载 UI 失败：HTTP " + response.status));
          },
          onerror: function () { reject(new Error("加载 UI 网络错误")); },
          ontimeout: function () { reject(new Error("加载 UI 超时")); }
        });
        return;
      }
      if (typeof fetch === "function") {
        fetch(UI_URL, { credentials: "omit" }).then(function (response) {
          if (!response.ok) throw new Error("加载 UI 失败：HTTP " + response.status);
          return response.text();
        }).then(resolve, reject);
        return;
      }
      reject(new Error("当前环境无法加载 UI bundle"));
    });
  }

  /**
   * 按需加载 UI：
   * - 普通网站不调用，脚本只保留菜单；
   * - WeGame 助手页启动时加载（显示登录/大区面板）；
   * - 普通 WeGame 页面在点击「LOL 战绩」时才加载。
   */
  function ensureLib() {
    var current = getLib();
    if (current) return Promise.resolve(current);
    if (libPromise) return libPromise;

    var resourceText = "";
    try {
      if (typeof GM_getResourceText === "function") resourceText = GM_getResourceText(UI_RESOURCE) || "";
    } catch (e) { /* @resource 不可用时走远端 */ }

    if (resourceText) {
      try {
        libCache = evaluateLib(resourceText);
        return Promise.resolve(libCache);
      } catch (error) {
        warn("内置 UI 解析失败，尝试远端加载：", error);
      }
    }

    libPromise = requestUiText().then(function (text) {
      libCache = evaluateLib(text);
      return libCache;
    });
    libPromise.then(function () { libPromise = null; }, function () { libPromise = null; });
    return libPromise;
  }

  /** 助手页需要 UI 面板：有现成 lib 就同步挂，没有则异步加载后挂 */
  function mountHelperPanel() {
    if (!isHelperPage()) return;
    var current = getLib();
    if (current && typeof current.mountHelperLogin === "function") {
      current.mountHelperLogin();
      return;
    }
    ensureLib().then(function (loaded) {
      if (loaded && typeof loaded.mountHelperLogin === "function") loaded.mountHelperLogin();
    }).catch(function (error) {
      warn("助手面板 UI 加载失败：", error);
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
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
      "#lol-tft-overlay-host{flex:1 1 auto;overflow:auto;}",
      ".lol-tft-overlay-close{margin-left:auto;padding:4px 12px;border:1px solid #3a4350;border-radius:4px;",
      "background:transparent;color:#b59758;cursor:pointer;font:13px/1.4 inherit;}",
      ".lol-tft-overlay-close:hover{background:rgba(255,255,255,.07);}"
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
    var launcher = document.getElementById("lol-tft-launcher");
    if (launcher) launcher.style.display = "";
  }

  async function openPanel() {
    if (loading || overlay) return;
    loading = true;
    var currentGeneration = ++generation;
    injectStyle();

    var launcher = document.getElementById("lol-tft-launcher");
    if (launcher) launcher.style.display = "none";

    overlay = document.createElement("div");
    var currentOverlay = overlay;
    overlay.id = "lol-tft-overlay";

    var head = document.createElement("div");
    head.id = "lol-tft-overlay-head";
    var title = document.createElement("span");
    title.textContent = "LOL 战绩查询";
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lol-tft-overlay-close";
    closeBtn.textContent = "✕ 关闭 (Esc)";
    closeBtn.addEventListener("click", closePanel);
    head.appendChild(title);
    head.appendChild(closeBtn);

    var host = document.createElement("div");
    host.id = "lol-tft-overlay-host";
    overlay.appendChild(head);
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    host.textContent = "正在加载战绩界面…";

    var lib;
    try {
      lib = await ensureLib();
    } catch (error) {
      if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
      host.textContent = "战绩界面加载失败：" + (error && error.message ? error.message : String(error));
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
      host.textContent = "加载失败：" + (error && error.message ? error.message : String(error));
      console.error("[lol-tft]", error);
    } finally {
      if (currentGeneration === generation) loading = false;
    }
  }

  function isHelperPage() {
    return /^\/helper\/lol(?:\/|$)/.test(location.pathname);
  }

  function mountLauncher() {
    if (!canUsePanelHere()) {
      log("非 WeGame 页面：仅注册脚本菜单，不注入悬浮按钮");
      return;
    }
    if (document.getElementById("lol-tft-launcher")) return;
    try {
      injectStyle();
      var parent = document.body || document.documentElement;
      if (!parent) {
        warn("document.body 还不存在，稍后重试");
        setTimeout(mountLauncher, 800);
        return;
      }
      // 助手页才需要 UI 面板；普通 WeGame 页面在点击悬浮按钮时才加载 UI
      mountHelperPanel();
      // 官方助手页已经有「LOL 助手增强」面板，再挂一个悬浮按钮会变成两个入口
      if (isHelperPage()) {
        log("助手页使用内嵌面板，跳过悬浮按钮");
        return;
      }
      var launcher = document.createElement("button");
      launcher.id = "lol-tft-launcher";
      launcher.type = "button";
      launcher.textContent = "LOL 战绩";
      launcher.title = "打开 LOL 战绩查询（同源请求，自动使用当前登录态）";
      launcher.addEventListener("click", openPanel);
      parent.appendChild(launcher);
      log("入口按钮已挂载", parent === document.body ? "body" : "html");
    } catch (error) {
      warn("入口按钮挂载失败：", error);
    }
  }

  /** 暴露到页面 window，便于在控制台手动调用排查：__LOL_TFT__.open() */
  function expose() {
    var api = { version: VERSION, open: openPanel, close: closePanel };
    try { if (typeof unsafeWindow !== "undefined" && unsafeWindow) unsafeWindow.__LOL_TFT__ = api; } catch (e) { /* ignore */ }
    try { window.__LOL_TFT__ = api; } catch (e) { /* ignore */ }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && overlay) closePanel();
  });

  /** 从菜单在其它网站打开时带 ?lol_tft_panel=1，进入 WeGame 后自动弹面板并从地址栏移除 */
  function consumePanelParam() {
    try {
      var search = location.search || "";
      if (search.indexOf("lol_tft_panel=1") < 0) return false;
      try {
        var url = new URL(location.href);
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
      var autoOpen = canUsePanelHere() && consumePanelParam();
      var start = function () {
        mountLauncher();
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
})();
