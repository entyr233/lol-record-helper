// ==UserScript==
// @name         LOL-TFT 注入探针
// @namespace    mscststs
// @version      1.0.0
// @description  只用来验证脚本管理器是否在 wegame 页面注入成功（与主脚本无关）
// @author       mscststs
// @match        https://www.wegame.com.cn/*
// @match        https://wegame.com.cn/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  function report() {
    var hasLib = "undefined";
    try { hasLib = typeof window.__LOL_TFT__; } catch (e) { hasLib = "error"; }

    var bar = document.createElement("div");
    bar.id = "lol-tft-probe-bar";
    bar.textContent = "LOL-TFT 探针：注入成功 ✅　主脚本 __LOL_TFT__ = " + hasLib + "　（" + new Date().toLocaleTimeString() + "）";
    bar.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
      "padding:8px 12px", "background:#c0392b", "color:#fff",
      "font:13px/1.5 -apple-system,'Microsoft YaHei',sans-serif", "text-align:center"
    ].join(";");
    var parent = document.body || document.documentElement;
    parent.appendChild(bar);
    console.log("[LOL-TFT 探针] 注入成功，location =", location.href, "| __LOL_TFT__ =", hasLib);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", report, { once: true });
  } else {
    report();
  }
})();
