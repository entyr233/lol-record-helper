// ==UserScript==
// @name         LOL战绩查询
// @namespace    mscststs
// @version      __VERSION__
// @description  英雄联盟国服战绩查询，支持掌盟历史段位 HAR 导入与段位页链接查询
// @author       mscststs
// @homepage     https://github.com/entyr233/lol-tft
// @homepageURL  https://github.com/entyr233/lol-tft
// @supportURL   https://github.com/entyr233/lol-tft/issues
// @source       https://github.com/entyr233/lol-tft
// @match        https://www.wegame.com.cn/*
// @match        https://wegame.com.cn/*
// @match        https://lol.qq.com/*
// @match        https://mlol.qt.qq.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wegame.com.cn
// @license      ISC
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      mlol.qt.qq.com
// @connect      lol.qq.com
// @connect      game.gtimg.cn
// @connect      www.wegame.com.cn
// @connect      wegame.com.cn
// @run-at       document-idle
// @updateURL    none
// ==/UserScript==

/**
 * 使用方式：装好脚本后，登录 https://www.wegame.com.cn/ ，右下角会出现「LOL 战绩」按钮。
 *
 * 为什么不用配置 cookie：脚本运行在 wegame 页面里，接口请求 /api/v1/wegame.pallas.game.LolBattle/*
 * 是同源请求，浏览器会自动带上你的登录 cookie —— 和旧版脚本的体验一致。
 *
 * v0.15：改为单文件分发（UI 打包内联），不再依赖 lol-tft.pages.dev 上的远端 bundle。
 */

/* ================= lol-tft UI bundle（构建时自动内联，勿手动编辑） ================= */
/*__BUNDLE__*/
/* ================= 以上为内联 bundle ================= */

(function () {
  "use strict";

  var VERSION = "__VERSION__";

  // ---------- 脚本管理器菜单（ScriptCat / Tampermonkey） ----------
  // 注册后脚本列表里就能直接看到这些入口，不必进「编辑」界面找链接。
  var PROJECT_HOME = "https://github.com/entyr233/lol-tft";
  // 菜单直达入口：装好脚本后从脚本管理器点一下就能跳到 WeGame 战绩页
  var WEGAME_HOME = "https://www.wegame.com.cn/";

  function openProjectUrl(url) {
    try { window.open(url, "_blank", "noopener"); } catch (e) { /* 忽略 */ }
  }

  function registerMenuCommands() {
    var commands = [
      { title: "打开 WeGame 战绩页", run: function () { openProjectUrl(WEGAME_HOME); } },
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

  // ---------- lol.qq.com 桥接侧：替 wegame 面板做同源 mlol 请求 ----------
  // （掌盟接口 CORS 只放行 lol.qq.com；wegame 面板通过隐藏 iframe + postMessage 调用）
  function isLolQqBridgeHost() {
    return location.hostname === "lol.qq.com" || location.hostname === "mlol.qt.qq.com";
  }

  function isGetIn(data) { return data.method === "GET"; }

  function installBridge() {
    var wegameOriginRe = /^https:\/\/(www\.)?wegame\.com\.cn$/;
    globalThis.addEventListener("message", function (event) {
      if (!wegameOriginRe.test(event.origin)) return;
      var data = event.data;
      if (!data || (data.type !== "lol-tft-detail-request" && data.type !== "lol-tft-mlol-request")) return;
      if (!data.id) return;

      var url;
      var form = new FormData();
      if (data.type === "lol-tft-detail-request") {
        url = "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5";
        form.append("uuid", data.uuid || "");
        form.append("area_id", String(data.areaId || ""));
        form.append("game_id", String(data.gameId || ""));
        form.append("start_time", String(data.startTime || ""));
      } else {
        // 通用掌盟接口：path 不含 /go 前缀；GET 时 query 参数也放 body 里由桥拼 URL
        var path = String(data.path || "").replace(/^\/+/, "");
        var body = data.body || {};
        var isGet = data.method === "GET";
        var qs = Object.keys(body).map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(String(body[k]));
        }).join("&");
        url = (sameOriginMlol ? "" : "https://mlol.qt.qq.com") + "/go/" + path + (isGet && qs ? "?" + qs : "");
        if (!isGet) Object.keys(body).forEach(function (k) { form.append(k, String(body[k])); });
      }

      var opt = { method: isGetIn(data) ? "GET" : "POST", credentials: "include" };
      if (opt.method === "POST") opt.body = form;
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

  function getLib() {
    try {
      if (typeof LolTft !== "undefined" && LolTft && typeof LolTft.mountLolTft === "function") return LolTft;
    } catch (e) { /* ignore */ }
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow.LolTft) return unsafeWindow.LolTft;
    } catch (e) { /* ignore */ }
    return window.LolTft || null;
  }

  var LOGIN_SDK_URL = "https://www.wegame.com.cn/middle/login/login.sdk.js";

  /** WeGame 登录 SDK 不是每个页面都加载，注入一个（旧版脚本同样依赖它） */
  function ensureLoginSdk() {
    return new Promise(function (resolve) {
      try {
        var host = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        if (host.WegameLogin && host.WegameLogin.default) {
          resolve(true);
          return;
        }
        var script = document.createElement("script");
        script.src = LOGIN_SDK_URL;
        script.async = true;
        script.onload = function () {
          resolve(!!(host.WegameLogin && host.WegameLogin.default));
        };
        script.onerror = function () {
          warn("登录 SDK 加载失败（不影响搜索别人的战绩）");
          resolve(false);
        };
        (document.head || document.documentElement).appendChild(script);
        setTimeout(function () {
          resolve(!!(host.WegameLogin && host.WegameLogin.default));
        }, 4000);
      } catch (error) {
        warn("登录 SDK 注入异常：", error);
        resolve(false);
      }
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
    var lib = getLib();
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

    if (!lib) {
      host.textContent = "战绩脚本未正确加载：bundle 缺失（请重新构建 userscript）";
      loading = false;
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

  function mountLauncher() {
    if (document.getElementById("lol-tft-launcher")) return;
    try {
      injectStyle();
      var launcher = document.createElement("button");
      launcher.id = "lol-tft-launcher";
      launcher.type = "button";
      launcher.textContent = "LOL 战绩";
      launcher.title = "打开 LOL 战绩查询（同源请求，自动使用当前登录态）";
      launcher.addEventListener("click", openPanel);
      var parent = document.body || document.documentElement;
      if (!parent) {
        warn("document.body 还不存在，稍后重试");
        setTimeout(mountLauncher, 800);
        return;
      }
      parent.appendChild(launcher);
      var lib = getLib();
      if (lib && typeof lib.mountHelperLogin === "function") lib.mountHelperLogin();
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

  function bootstrap() {
    try {
      expose();
      if (!document.body) {
        warn("body 尚未就绪，等待 DOMContentLoaded");
        document.addEventListener("DOMContentLoaded", mountLauncher, { once: true });
        return;
      }
      mountLauncher();
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
