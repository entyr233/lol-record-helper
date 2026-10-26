// ==UserScript==
// @name         LOL战绩查询
// @namespace    mscststs
// @version      0.14.0
// @description  在 WeGame 页面内查询英雄联盟国服战绩（Vue 3 + Vite 重写版）
// @author       mscststs
// @match        https://www.wegame.com.cn/*
// @match        https://wegame.com.cn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wegame.com.cn
// @license      ISC
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @noframes
// @downloadURL  https://update.greasyfork.org/scripts/454184/LOL%E6%88%98%E7%BB%A9%E6%9F%A5%E8%AF%A2.user.js
// @updateURL    https://update.greasyfork.org/scripts/454184/LOL%E6%88%98%E7%BB%A9%E6%9F%A5%E8%AF%A2.meta.js
// ==/UserScript==

/**
 * 变更说明（v0.14）
 * 旧版注入 https://www.wegame.com.cn/ioi 整个页面，但该页面在 2026 年已下线（404）。
 * 现在改为：在任意 WeGame 页面右下角挂一个浮动入口，点开后全屏打开战绩查询，
 * 不再依赖宿主页面的 #content / #app 结构，也不修改宿主页面原有内容。
 *
 * 数据来源是同源请求 /api/v1/wegame.pallas.game.LolBattle/*，
 * 浏览器会自动带上 wegame.com.cn 的登录 cookie —— 所以只要你在 WeGame 网站上登录过，
 * 脚本里拿到的就是真实数据。
 */
(function () {
  "use strict";

  var BUNDLE_URL = "https://lol-tft.pages.dev/lol/lol.umd.js";
  var STYLE_ID = "lol-tft-entry-style";
  var Z = "2147483000";

  var mounted = null;
  var overlay = null;
  var loading = false;

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
      "background:#1a2026;border-bottom:1px solid #24292e;color:#b59758;font:13px/1.6 -apple-system,'Microsoft YaHei',sans-serif;}",
      "#lol-tft-overlay-host{flex:1 1 auto;overflow:auto;}",
      ".lol-tft-overlay-close{margin-left:auto;padding:4px 12px;border:1px solid #3a4350;border-radius:4px;",
      "background:transparent;color:#b59758;cursor:pointer;font:13px/1.4 inherit;}",
      ".lol-tft-overlay-close:hover{background:rgba(255,255,255,.07);}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("脚本加载失败: " + src)); };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function ensureBundle() {
    var host = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (host.LolTft && typeof host.LolTft.mountLolTft === "function") return host.LolTft;
    await loadScript(BUNDLE_URL);
    if (!host.LolTft || typeof host.LolTft.mountLolTft !== "function") {
      throw new Error("战绩脚本未正确导出 mountLolTft");
    }
    return host.LolTft;
  }

  function closePanel() {
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
    injectStyle();
    var launcher = document.getElementById("lol-tft-launcher");
    if (launcher) launcher.style.display = "none";

    overlay = document.createElement("div");
    overlay.id = "lol-tft-overlay";

    var head = document.createElement("div");
    head.id = "lol-tft-overlay-head";
    var title = document.createElement("span");
    title.textContent = "LOL 战绩查询";
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lol-tft-overlay-close";
    closeBtn.textContent = "关闭 (Esc)";
    closeBtn.addEventListener("click", closePanel);
    head.appendChild(title);
    head.appendChild(closeBtn);

    var host = document.createElement("div");
    host.id = "lol-tft-overlay-host";
    host.textContent = "加载中…";

    overlay.appendChild(head);
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";

    try {
      var lib = await ensureBundle();
      host.textContent = "";
      mounted = lib.mountLolTft({ host: host });
    } catch (error) {
      host.textContent = "加载失败：" + (error && error.message ? error.message : String(error));
      console.error("[lol-tft]", error);
    } finally {
      loading = false;
    }
  }

  function mountLauncher() {
    if (document.getElementById("lol-tft-launcher")) return;
    injectStyle();
    var launcher = document.createElement("button");
    launcher.id = "lol-tft-launcher";
    launcher.type = "button";
    launcher.textContent = "LOL 战绩";
    launcher.title = "打开 LOL 战绩查询";
    launcher.addEventListener("click", function () { void openPanel(); });
    document.body.appendChild(launcher);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && overlay) closePanel();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountLauncher);
  } else {
    mountLauncher();
  }

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("打开 LOL 战绩查询", function () { void openPanel(); });
  }
})();
