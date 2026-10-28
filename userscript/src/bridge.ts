export function installHelperTgpBridge() {
  try {
    if (!/^(www\.)?wegame\.com\.cn$/.test(location.hostname)) return;
    if (!/^\/helper\/lol(?:\/|$)/.test(location.pathname)) return;
    const uinMatch = document.cookie.match(/(?:^|;\s*)(?:p_)?uin=(o?[0-9]+)/);
    const uin = uinMatch ? String(Number(uinMatch[1].replace(/^o/, ""))) : "";
    if (uin) {
      // 官方页面的兜底逻辑会读 p_uin 推断大区；这里补一份，减少首次初始化失败
      try { document.cookie = "p_uin=o" + uin + "; path=/"; } catch (e) { /* ignore */ }
    }
    let area = 0;
    try {
      area = Number(localStorage.getItem("lol_tft:lol-tft-helper-area") || 0) ||
        Number(localStorage.getItem("lol_tft:last-area") || 0) || 0;
    } catch (e) { /* ignore */ }
    const topWin = window.top;
    if (!topWin) return;
    topWin.TGP = topWin.TGP || {};
    topWin.TGP.status = topWin.TGP.status || {};
    if (area) topWin.TGP.status.aid = area;
    if (uin) topWin.TGP.status.uin = uin;
  } catch (e) { /* 跨域/权限问题忽略，不影响主流程 */ }
}

// ---------- lol.qq.com 桥接侧：替 wegame 面板做同源 mlol 请求 ----------
// （掌盟接口 CORS 只放行 lol.qq.com；wegame 面板通过隐藏 iframe + postMessage 调用）
export function isLolQqBridgeHost() {
  return location.hostname === "lol.qq.com" || location.hostname === "mlol.qt.qq.com";
}

export function installBridge() {
  const wegameOriginRe = /^https:\/\/(www\.)?wegame\.com\.cn$/;
  globalThis.addEventListener("message", function (event) {
    if (!wegameOriginRe.test(event.origin)) return;
    if (!event.source) return;
    const data: unknown = event.data;
    if (!data || typeof data !== "object" || !("type" in data) || data.type !== "lol-tft-detail-request") return;
    const request = data as Record<string, unknown>;
    if (typeof request.id !== "string" || !request.id) return;
    const source = event.source as Window;

    const url = "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5";
    const form = new FormData();
    form.append("uuid", String(request.uuid || ""));
    form.append("area_id", String(request.areaId || ""));
    form.append("game_id", String(request.gameId || ""));
    form.append("start_time", String(request.startTime || ""));
    const opt: RequestInit = { method: "POST", credentials: "include", body: form };
    fetch(url, opt).then(function (r) { return r.text().then(function (text) { return { text: text, status: r.status }; }); }).then(function (res) {
      source.postMessage({ type: "lol-tft-mlol-response", id: request.id, text: res.text, status: res.status }, event.origin);
    }).catch(function (error) {
      source.postMessage({ type: "lol-tft-mlol-response", id: request.id, error: String(error && error.message || error) }, event.origin);
    });
  });

  notifyReady();
  [500, 1500, 3000].forEach(function (delay) { setTimeout(notifyReady, delay); });

  function notifyReady() {
    try {
      if (window.parent && window.parent !== window) {
        let targetOrigin = "*";
        try {
          if (document.referrer) targetOrigin = new URL(document.referrer).origin;
        } catch (e) { /* referrer 不可解析时退回广播 */ }
        window.parent.postMessage({ type: "lol-tft-bridge-ready" }, targetOrigin);
      }
    } catch (e) { /* ignore */ }
  }
}
