// ==UserScript==
// @name         LOL战绩查询
// @namespace    mscststs
// @version      0.13.0
// @description  在 WeGame 页面查询英雄联盟国服战绩（Vue 3 + Vite 重写版）
// @author       mscststs
// @match        https://www.wegame.com.cn/ioi*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wegame.com.cn
// @license      ISC
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// @downloadURL  https://update.greasyfork.org/scripts/454184/LOL%E6%88%98%E7%BB%A9%E6%9F%A5%E8%AF%A2.user.js
// @updateURL    https://update.greasyfork.org/scripts/454184/LOL%E6%88%98%E7%BB%A9%E6%9F%A5%E8%AF%A2.meta.js
// ==/UserScript==

(function () {
  "use strict";

  var PAGE_URL = "https://www.wegame.com.cn/ioi";
  var BUNDLE_URL = "https://lol-tft.pages.dev/lol/lol.umd.js";
  var LOGIN_SDK_URL = "https://www.wegame.com.cn/middle/login/login.sdk.js";
  var HOST_STYLE_ID = "lol-tft-host-style";

  /** 宿主页面级的样式：只做「让出空间 + 换底色」，UI 样式全部在 Shadow DOM 内 */
  function injectHostStyle() {
    if (document.getElementById(HOST_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = HOST_STYLE_ID;
    style.textContent = [
      "body{background:#19212b !important;}",
      "body:before,body:after{content:none !important;}",
      ".frame-nodata-wrap:before,.frame-nodata-wrap:after{content:none !important;}",
      ".frame-nodata-wrap{opacity:0 !important;transition:opacity .3s;}",
      "#content{padding:0 !important;}",
      "#lol-tft-host{display:block;width:100%;min-height:100vh;color:#ddd;}"
    ].join("");
    document.head.appendChild(style);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("脚本加载失败: " + src));
      };
      document.head.appendChild(script);
    });
  }

  function text(node, value) {
    if (node) node.textContent = value;
  }

  async function waitForLogin(login, statusNode) {
    if (!login || typeof login.isLogin !== "function") return;
    if (login.isLogin()) return;

    await new Promise(function (resolve) {
      var settled = false;
      var timer = null;

      function done() {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        resolve();
      }

      text(statusNode, "拉起登录中…");
      if (typeof login.popup === "function") login.popup();
      if (typeof login.onLogin === "function") login.onLogin(done);

      var deadline = Date.now() + 3 * 60 * 1000;
      timer = setInterval(function () {
        if (login.isLogin() || Date.now() > deadline) done();
      }, 1000);
    });
  }

  async function main() {
    injectHostStyle();
    document.title = "LOL 战绩查询";

    var content = document.getElementById("content") || document.body;
    var mountHost = document.createElement("div");
    mountHost.id = "lol-tft-host";
    content.textContent = "";
    content.appendChild(mountHost);
    text(mountHost, "加载中…");

    try {
      await loadScript(LOGIN_SDK_URL);
      var login = (typeof unsafeWindow !== "undefined" ? unsafeWindow : window).WegameLogin;
      var sdk = login && login.default;
      if (sdk) {
        if (sdk.readyPromise) await sdk.readyPromise;
        await waitForLogin(sdk, mountHost);
        if (typeof sdk.isLogin === "function" && !sdk.isLogin()) {
          text(mountHost, "登录超时，请刷新页面重试");
          return;
        }
      }

      text(mountHost, "正在初始化…");
      await loadScript(BUNDLE_URL);

      var lib = (typeof unsafeWindow !== "undefined" ? unsafeWindow : window).LolTft;
      if (!lib || typeof lib.mountLolTft !== "function") {
        throw new Error("战绩查询脚本未正确导出 mountLolTft");
      }

      mountHost.textContent = "";
      lib.mountLolTft({ host: mountHost });
    } catch (error) {
      text(mountHost, "加载失败：" + (error && error.message ? error.message : String(error)));
      console.error("[lol-tft]", error);
    }
  }

  if (location.href.indexOf(PAGE_URL) === 0) {
    main();
  }

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("打开战绩查询页面", function () {
      GM_openInTab(PAGE_URL, { active: true });
    });
  }
})();
