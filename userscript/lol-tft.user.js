// ==UserScript==
// @name         LOL 战绩助手
// @namespace    mscststs
// @version      2.17.1
// @description  LOL 战绩助手：英雄联盟国服战绩查询，支持官方助手登录、大区切换与掌盟详情回退
// @author       mscststs
// @homepage     https://github.com/entyr233/lol-record-helper
// @homepageURL  https://github.com/entyr233/lol-record-helper
// @supportURL   https://github.com/entyr233/lol-record-helper/issues
// @source       https://github.com/entyr233/lol-record-helper
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
// @resource     lol-tft-ui https://github.com/entyr233/lol-record-helper/releases/download/v2.17.1/lol-tft-ui.js
// @connect      mlol.qt.qq.com
// @connect      lol.qq.com
// @connect      game.gtimg.cn
// @connect      www.wegame.com.cn
// @connect      wegame.com.cn
// @connect      data.dtodo.cn
// @connect      github.com
// @connect      objects.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      fastly.jsdelivr.net
// @connect      raw.githubusercontent.com
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/entyr233/lol-record-helper/master/userscript/lol-tft.user.js
// @updateURL    https://raw.githubusercontent.com/entyr233/lol-record-helper/master/userscript/lol-tft.user.js
// ==/UserScript==

(() => {
  // userscript/src/host.ts
  function isWegameHost() {
    return /^(www\.)?wegame\.com\.cn$/.test(location.hostname);
  }
  function canUsePanelHere() {
    return isWegameHost() || /^lol\.qq\.com$/.test(location.hostname);
  }
  function isHelperPage() {
    return /^\/helper\/lol(?:\/|$)/.test(location.pathname);
  }

  // userscript/src/menu.ts
  var PROJECT_HOME = "https://github.com/entyr233/lol-record-helper";
  var OFFICIAL_HELPER_URL = "https://www.wegame.com.cn/helper/lol/";
  var PANEL_HOME_URL = "https://www.wegame.com.cn/?lol_tft_panel=1";
  function openProjectUrl(url) {
    try {
      window.open(url, "_blank", "noopener");
    } catch (e) {
    }
  }
  function registerMenuCommands(openPanel) {
    function openSelfPanelFromMenu() {
      if (isWegameHost() && window.top === window) {
        void openPanel();
        return;
      }
      openProjectUrl(PANEL_HOME_URL);
    }
    const commands = [
      { title: "打开自建战绩面板", run: openSelfPanelFromMenu },
      { title: "打开官方助手页", run: function() {
        openProjectUrl(OFFICIAL_HELPER_URL);
      } },
      { title: "打开项目主页", run: function() {
        openProjectUrl(PROJECT_HOME);
      } },
      { title: "反馈 / 问题", run: function() {
        openProjectUrl(PROJECT_HOME + "/issues");
      } }
    ];
    try {
      if (typeof GM_registerMenuCommand === "function") {
        commands.forEach(function(command) {
          GM_registerMenuCommand(command.title, command.run);
        });
        return;
      }
      if (typeof GM !== "undefined" && GM && typeof GM.registerMenuCommand === "function") {
        const register = GM.registerMenuCommand;
        commands.forEach(function(command) {
          register(command.title, command.run);
        });
      }
    } catch (e) {
    }
  }

  // userscript/src/bridge.ts
  function installHelperTgpBridge() {
    try {
      if (!/^(www\.)?wegame\.com\.cn$/.test(location.hostname)) return;
      if (!/^\/helper\/lol(?:\/|$)/.test(location.pathname)) return;
      const uinMatch = document.cookie.match(/(?:^|;\s*)(?:p_)?uin=(o?[0-9]+)/);
      const uin = uinMatch ? String(Number(uinMatch[1].replace(/^o/, ""))) : "";
      if (uin) {
        try {
          document.cookie = "p_uin=o" + uin + "; path=/";
        } catch (e) {
        }
      }
      let area = 0;
      try {
        area = Number(localStorage.getItem("lol_tft:lol-tft-helper-area") || 0) || Number(localStorage.getItem("lol_tft:last-area") || 0) || 0;
      } catch (e) {
      }
      const topWin = window.top;
      if (!topWin) return;
      topWin.TGP = topWin.TGP || {};
      topWin.TGP.status = topWin.TGP.status || {};
      if (area) topWin.TGP.status.aid = area;
      if (uin) topWin.TGP.status.uin = uin;
    } catch (e) {
    }
  }
  function isLolQqBridgeHost() {
    return location.hostname === "lol.qq.com" || location.hostname === "mlol.qt.qq.com";
  }
  function installBridge() {
    const wegameOriginRe = /^https:\/\/(www\.)?wegame\.com\.cn$/;
    globalThis.addEventListener("message", function(event) {
      if (!wegameOriginRe.test(event.origin)) return;
      if (!event.source) return;
      const data = event.data;
      if (!data || typeof data !== "object" || !("type" in data) || data.type !== "lol-tft-detail-request") return;
      const request = data;
      if (typeof request.id !== "string" || !request.id) return;
      const source = event.source;
      const url = "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5";
      const form = new FormData();
      form.append("uuid", String(request.uuid || ""));
      form.append("area_id", String(request.areaId || ""));
      form.append("game_id", String(request.gameId || ""));
      form.append("start_time", String(request.startTime || ""));
      const opt = { method: "POST", credentials: "include", body: form };
      fetch(url, opt).then(function(r) {
        return r.text().then(function(text) {
          return { text, status: r.status };
        });
      }).then(function(res) {
        source.postMessage({ type: "lol-tft-mlol-response", id: request.id, text: res.text, status: res.status }, event.origin);
      }).catch(function(error) {
        source.postMessage({ type: "lol-tft-mlol-response", id: request.id, error: String(error && error.message || error) }, event.origin);
      });
    });
    notifyReady();
    [500, 1500, 3e3].forEach(function(delay) {
      setTimeout(notifyReady, delay);
    });
    function notifyReady() {
      try {
        if (window.parent && window.parent !== window) {
          let targetOrigin = "*";
          try {
            if (document.referrer) targetOrigin = new URL(document.referrer).origin;
          } catch (e) {
          }
          window.parent.postMessage({ type: "lol-tft-bridge-ready" }, targetOrigin);
        }
      } catch (e) {
      }
    }
  }

  // userscript/src/loader.ts
  function normalizeUiText(text) {
    return String(text != null ? text : "").replace(/\r\n/g, "\n");
  }
  function buildUiUrls(repo, version) {
    return [
      "https://github.com/" + repo + "/releases/download/" + version + "/lol-tft-ui.js",
      "https://cdn.jsdelivr.net/gh/" + repo + "@ui/versions/" + version + "/lol-tft-ui.js",
      "https://fastly.jsdelivr.net/gh/" + repo + "@ui/versions/" + version + "/lol-tft-ui.js"
    ];
  }
  function sha256Hex(text) {
    const cryptoApi = globalThis.crypto;
    if (!(cryptoApi == null ? void 0 : cryptoApi.subtle) || typeof TextEncoder === "undefined") {
      return Promise.reject(new Error("当前浏览器不支持 UI 完整性校验（缺少 WebCrypto）"));
    }
    return cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(normalizeUiText(text))).then((buffer) => {
      return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
    });
  }
  function diagnosticsText(input) {
    var _a;
    const message = input.error instanceof Error ? input.error.message : String((_a = input.error) != null ? _a : "");
    return [
      "LOL 战绩助手 v" + input.version,
      "UI SHA-256: " + input.sha256,
      "URL: " + input.href,
      "UA: " + input.userAgent,
      "错误: " + message
    ].join("\n");
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function createUiLoader(warn) {
    const UI_RESOURCE = "lol-tft-ui";
    const UI_TAG = "v2.17.1";
    const UI_URLS = buildUiUrls("entyr233/lol-record-helper", UI_TAG);
    const UI_URL = UI_URLS[0];
    const UI_SHA256 = "8abe3898f197fb5dfb91cf85b0009b9640e1676f74128e3191050c1569f945a4";
    let libCache = null;
    let libPromise = null;
    function verifyAndEvaluate(text) {
      return sha256Hex(text).then(function(hash) {
        if (!UI_SHA256 || hash !== UI_SHA256) {
          throw new Error("UI 资源完整性校验失败（可能被篡改或版本不匹配），已拒绝执行");
        }
        return evaluateLib(normalizeUiText(text));
      });
    }
    function getLib() {
      if (libCache) return libCache;
      try {
        if (typeof LolTft !== "undefined" && LolTft && typeof LolTft.mountLolTft === "function") return LolTft;
      } catch (e) {
      }
      try {
        if (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.LolTft) return unsafeWindow.LolTft;
      } catch (e) {
      }
      try {
        if (window.LolTft && typeof window.LolTft.mountLolTft === "function") return window.LolTft;
      } catch (e) {
      }
      return null;
    }
    function evaluateLib(text) {
      try {
        const factory = new Function(text + "\n;return (typeof LolTft !== 'undefined' ? LolTft : null);");
        const evaluated = factory();
        if (evaluated && typeof evaluated.mountLolTft === "function") return evaluated;
      } catch (error) {
        warn("new Function 执行 UI 失败，尝试页面注入：", error);
      }
      const script = document.createElement("script");
      script.textContent = text;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
      let pageLib = null;
      try {
        pageLib = typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.LolTft || window.LolTft || null;
      } catch (e) {
      }
      if (pageLib && typeof pageLib.mountLolTft === "function") return pageLib;
      throw new Error("UI bundle 无法执行（可能被页面 CSP 拦截）");
    }
    function requestUiTextFrom(url) {
      return new Promise(function(resolve, reject) {
        if (typeof GM_xmlhttpRequest === "function") {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            timeout: 3e4,
            onload: function(response) {
              if (response.status >= 200 && response.status < 300 && response.responseText) resolve(response.responseText);
              else reject(new Error("HTTP " + response.status + "：" + url));
            },
            onerror: function() {
              reject(new Error("网络错误：" + url));
            },
            ontimeout: function() {
              reject(new Error("请求超时：" + url));
            }
          });
          return;
        }
        if (typeof fetch === "function") {
          fetch(url, { credentials: "omit" }).then(function(response) {
            if (!response.ok) throw new Error("HTTP " + response.status + "：" + url);
            return response.text();
          }).then(resolve, function(error) {
            reject(error && error.message ? error : new Error("网络错误：" + url));
          });
          return;
        }
        reject(new Error("当前环境无法加载 UI bundle"));
      });
    }
    function requestUiText() {
      const failures = [];
      function tryAt(index) {
        if (index >= UI_URLS.length) {
          return Promise.reject(new Error("全部 UI 源加载失败：" + failures.join("；")));
        }
        return requestUiTextFrom(UI_URLS[index]).then(verifyAndEvaluate).catch(function(error) {
          failures.push(errorMessage(error));
          return tryAt(index + 1);
        });
      }
      return tryAt(0);
    }
    function ensureLib() {
      const current = getLib();
      if (current) return Promise.resolve(current);
      if (libPromise) return libPromise;
      let resourceText = "";
      try {
        if (typeof GM_getResourceText === "function") resourceText = GM_getResourceText(UI_RESOURCE) || "";
      } catch (e) {
      }
      let task;
      if (resourceText) {
        task = verifyAndEvaluate(resourceText).catch(function(error) {
          warn("内置 UI 校验/解析失败，尝试从固定 tag 的 CDN 重新下载：", error);
          return requestUiText().catch(function(remoteError) {
            const first = errorMessage(error);
            const second = errorMessage(remoteError);
            throw new Error("内置 UI 校验失败：" + first + "；远端重试失败：" + second);
          });
        });
      } else {
        task = requestUiText();
      }
      libPromise = task.then(function(loaded) {
        libCache = loaded;
        return loaded;
      });
      libPromise.then(function() {
        libPromise = null;
      }, function() {
        libPromise = null;
      });
      return libPromise;
    }
    return { getLib, ensureLib, UI_URL, UI_SHA256 };
  }

  // userscript/src/overlay.ts
  function createPanel(log, warn) {
    const VERSION = "2.17.1";
    const Z = "2147483000";
    const STYLE_ID = "lol-tft-entry-style";
    let mounted = null;
    let overlay = null;
    let loading = false;
    let generation = 0;
    let lastFocused = null;
    const { getLib, ensureLib, UI_URL, UI_SHA256 } = createUiLoader(warn);
    function clearHelperLoadError() {
      const existing = document.getElementById("lol-tft-helper-error");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    }
    function showHelperLoadError(error) {
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
      retry.addEventListener("click", function() {
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
    function mountHelperPanel() {
      if (!isHelperPage()) return;
      const current = getLib();
      if (current && typeof current.mountHelperLogin === "function") {
        clearHelperLoadError();
        current.mountHelperLogin();
        return;
      }
      ensureLib().then(function(loaded) {
        clearHelperLoadError();
        if (loaded && typeof loaded.mountHelperLogin === "function") loaded.mountHelperLogin();
      }).catch(function(error) {
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
        try {
          mounted.unmount();
        } catch (e) {
          console.warn("[lol-tft]", e);
        }
        mounted = null;
      }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      document.documentElement.style.overflow = "";
      const launcher = document.getElementById("lol-tft-launcher");
      if (launcher) launcher.style.display = "";
      if (lastFocused && lastFocused.isConnected && typeof lastFocused.focus === "function") {
        try {
          lastFocused.focus();
        } catch (e) {
        }
      }
      lastFocused = null;
    }
    function panelDiagnostics(error) {
      return diagnosticsText({
        version: VERSION,
        sha256: UI_SHA256,
        href: location.href,
        userAgent: navigator.userAgent,
        error
      });
    }
    function copyText(text) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function(resolve, reject) {
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
    function createCopyDiagnosticsButton(error) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "复制诊断信息";
      button.style.cssText = "margin-top:6px;padding:4px 10px;color:#d8bd7e;background:#242c37;border:1px solid #4c463d;border-radius:4px;cursor:pointer;font:12px/1.5 inherit;";
      button.addEventListener("click", function() {
        copyText(panelDiagnostics(error)).then(function() {
          button.textContent = "已复制";
          setTimeout(function() {
            button.textContent = "复制诊断信息";
          }, 1500);
        }, function() {
          button.textContent = "复制失败";
          setTimeout(function() {
            button.textContent = "复制诊断信息";
          }, 1500);
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
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "lol-tft-overlay-close";
      closeBtn.setAttribute("aria-label", "关闭战绩面板");
      closeBtn.textContent = "✕ 关闭 (Esc)";
      closeBtn.addEventListener("click", closePanel);
      head.appendChild(title);
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
      try {
        closeBtn.focus();
      } catch (e) {
      }
      let lib;
      try {
        lib = await ensureLib();
      } catch (error) {
        if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
        host.textContent = "战绩界面加载失败：" + errorMessage(error);
        host.appendChild(createCopyDiagnosticsButton(error));
        console.error("[lol-tft]", error);
        if (currentGeneration === generation) loading = false;
        return;
      }
      try {
        if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
        host.textContent = "";
        mounted = lib.mountLolTft({ host });
        log("面板已挂载");
      } catch (error) {
        if (currentGeneration !== generation || overlay !== currentOverlay || !host.isConnected) return;
        host.textContent = "加载失败：" + errorMessage(error);
        host.appendChild(createCopyDiagnosticsButton(error));
        console.error("[lol-tft]", error);
      } finally {
        if (currentGeneration === generation) loading = false;
      }
    }
    function collectFocusable(root) {
      const selector = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
      let result = Array.from(root.querySelectorAll(selector));
      const all = root.querySelectorAll("*");
      for (let i = 0; i < all.length; i++) {
        const shadow = all[i].shadowRoot;
        if (shadow) result = result.concat(collectFocusable(shadow));
      }
      return result.filter(function(el) {
        return el.getClientRects().length > 0;
      });
    }
    document.addEventListener("keydown", function(event) {
      var _a;
      if (event.key === "Escape" && overlay) closePanel();
      if (event.key !== "Tab" || !overlay) return;
      const items = collectFocusable(overlay);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      let active = document.activeElement;
      while ((_a = active == null ? void 0 : active.shadowRoot) == null ? void 0 : _a.activeElement) active = active.shadowRoot.activeElement;
      if (!items.includes(active)) {
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

  // userscript/src/launcher.ts
  function mountLauncher(panel, log, warn) {
    const { openPanel, injectStyle, mountHelperPanel } = panel;
    if (!canUsePanelHere()) {
      log("非 WeGame 页面：仅注册脚本菜单，不注入悬浮按钮");
      return;
    }
    if (document.getElementById("lol-tft-launcher")) return;
    try {
      injectStyle();
      const parent = document.body || document.documentElement;
      if (!parent) {
        warn("document.body 还不存在，稍后重试");
        setTimeout(() => mountLauncher(panel, log, warn), 800);
        return;
      }
      mountHelperPanel();
      if (isHelperPage()) {
        log("助手页使用内嵌面板，跳过悬浮按钮");
        return;
      }
      const launcher = document.createElement("button");
      launcher.id = "lol-tft-launcher";
      launcher.type = "button";
      launcher.setAttribute("aria-label", "打开 LOL 战绩助手");
      launcher.textContent = "LOL 战绩助手";
      launcher.title = "打开 LOL 战绩助手（同源请求，自动使用当前登录态）";
      launcher.addEventListener("click", () => {
        launcher.focus();
        void openPanel();
      });
      parent.appendChild(launcher);
      log("入口按钮已挂载", parent === document.body ? "body" : "html");
    } catch (error) {
      warn("入口按钮挂载失败：", error);
    }
  }

  // userscript/src/shell.ts
  function startShell() {
    const VERSION = "2.17.1";
    registerMenuCommands(() => openPanel());
    installHelperTgpBridge();
    if (isLolQqBridgeHost()) {
      installBridge();
      return;
    }
    if (window.top !== window) return;
    const log = (...args) => console.log("[lol-tft] v" + VERSION, ...args);
    const warn = (...args) => console.warn("[lol-tft] v" + VERSION, ...args);
    const panel = createPanel(log, warn);
    const { openPanel, closePanel } = panel;
    function expose() {
      const api = { version: VERSION, open: openPanel, close: closePanel };
      try {
        if (typeof unsafeWindow !== "undefined" && unsafeWindow) unsafeWindow.__LOL_TFT__ = api;
      } catch (e) {
      }
      try {
        window.__LOL_TFT__ = api;
      } catch (e) {
      }
    }
    function consumePanelParam() {
      try {
        const search = location.search || "";
        if (search.indexOf("lol_tft_panel=1") < 0) return false;
        try {
          const url = new URL(location.href);
          url.searchParams.delete("lol_tft_panel");
          history.replaceState(null, "", url.pathname + url.search + url.hash);
        } catch (e) {
        }
        return true;
      } catch (e) {
        return false;
      }
    }
    function bootstrap() {
      try {
        expose();
        const autoOpen = canUsePanelHere() && consumePanelParam();
        const start = function() {
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
})();
