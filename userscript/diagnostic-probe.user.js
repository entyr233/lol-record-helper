// ==UserScript==
// @name         LOL-TFT 掌盟登录探针
// @namespace    mscststs
// @version      2.0.0
// @description  验证 GM_xmlhttpRequest 能否带上 qq.com 登录 cookie 调通掌盟详情接口
// @author       mscststs
// @match        https://www.wegame.com.cn/*
// @match        https://wegame.com.cn/*
// @grant        GM_xmlhttpRequest
// @connect      mlol.qt.qq.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  function show(text, color) {
    var old = document.getElementById("lol-tft-probe-bar");
    if (old) old.remove();
    var bar = document.createElement("div");
    bar.id = "lol-tft-probe-bar";
    bar.textContent = text;
    bar.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
      "padding:8px 12px", "color:#fff",
      "font:13px/1.5 -apple-system,'Microsoft YaHei',sans-serif", "text-align:center",
      "background:" + (color || "#8e44ad")
    ].join(";");
    (document.body || document.documentElement).appendChild(bar);
  }

  function gmDetail() {
    return new Promise(function (resolve) {
      var form = new FormData();
      form.append("uuid", "4ac74bb2-87e2-4e8f-85db-529fad2b0624");
      form.append("area_id", "9");
      form.append("game_id", "301035914179");
      form.append("start_time", "1792491004");
      GM_xmlhttpRequest({
        method: "POST",
        url: "https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5",
        data: form,
        timeout: 15000,
        onload: function (response) {
          var code = "?", msg = "";
          try {
            var j = JSON.parse(response.responseText);
            code = String(j.result !== undefined ? j.result : (j.code ?? "?"));
            msg = String(j.msg || j.err_msg || (j.data && j.data.info ? "有数据! mode=" + j.data.info.game_mode_name : "") || "");
          } catch (e) { msg = "响应解析失败"; }
          resolve({ code: code, msg: msg });
        },
        onerror: function () { resolve({ code: "NETWORK", msg: "请求失败" }); },
        ontimeout: function () { resolve({ code: "TIMEOUT", msg: "超时" }); }
      });
    });
  }

  function run() {
    show("掌盟探针：请求中…", "#8e44ad");
    gmDetail().then(function (r) {
      var ok = r.code === "0";
      show(
        "掌盟探针：" + (ok ? "✅ 详情接口通了！GM 带 cookie 有效，10人详情可以做" : "❌ result=" + r.code + " " + r.msg + "（1001=qq.com 域没有登录 cookie）"),
        ok ? "#1e8e3e" : "#c0392b"
      );
      console.log("[LOL-TFT 探针]", JSON.stringify(r));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
