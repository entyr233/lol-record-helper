// ==UserScript==
// @name         LOL战绩查询
// @namespace    mscststs
// @version      __VERSION__
// @description  在 WeGame 页面内查询英雄联盟国服战绩（无需任何配置，登录即用）
// @author       mscststs
// @match        https://www.wegame.com.cn/*
// @match        https://wegame.com.cn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wegame.com.cn
// @license      ISC
// @grant        none
// @run-at       document-idle
// @noframes
// @downloadURL  https://update.greasyfork.org/scripts/454184/LOL%E6%88%98%E7%BB%A9%E6%9F%A5%E8%AF%A2.user.js
// @updateURL    https://update.greasyfork.org/scripts/454184/LOL%E6%88%98%E7%BB%A9%E6%9F%A5%E8%AF%A2.meta.js
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

  var Z = "2147483000";
  var STYLE_ID = "lol-tft-entry-style";

  var mounted = null;
  var overlay = null;
  var loading = false;

  function getLib() {
    try {
      if (typeof LolTft !== "undefined" && LolTft && typeof LolTft.mountLolTft === "function") return LolTft;
    } catch (e) { /* ignore */ }
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow.LolTft) return unsafeWindow.LolTft;
    } catch (e) { /* ignore */ }
    return window.LolTft || null;
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

  function openPanel() {
    if (loading || overlay) return;
    var lib = getLib();
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
    overlay.appendChild(head);
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";

    if (!lib) {
      host.textContent = "战绩脚本未正确加载：bundle 缺失（请重新构建 userscript）";
      return;
    }
    try {
      mounted = lib.mountLolTft({ host: host });
    } catch (error) {
      host.textContent = "加载失败：" + (error && error.message ? error.message : String(error));
      console.error("[lol-tft]", error);
    }
  }

  function mountLauncher() {
    if (document.getElementById("lol-tft-launcher")) return;
    injectStyle();
    var launcher = document.createElement("button");
    launcher.id = "lol-tft-launcher";
    launcher.type = "button";
    launcher.textContent = "LOL 战绩";
    launcher.title = "打开 LOL 战绩查询（同源请求，自动使用当前登录态）";
    launcher.addEventListener("click", openPanel);
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
})();
