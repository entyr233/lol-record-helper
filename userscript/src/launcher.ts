import { canUsePanelHere, isHelperPage } from "./host";

export function mountLauncher(panel: { openPanel: () => Promise<void>; injectStyle: () => void; mountHelperPanel: () => void }, log: (...args: unknown[]) => void, warn: (...args: unknown[]) => void): void {
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
    // 助手页才需要 UI 面板；普通 WeGame 页面在点击悬浮按钮时才加载 UI
    mountHelperPanel();
    // 官方助手页已经有「LOL 助手增强」面板，再挂一个悬浮按钮会变成两个入口
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
      // WebKit does not focus buttons on pointer clicks; retain the invoking control.
      launcher.focus();
      void openPanel();
    });
    parent.appendChild(launcher);
    log("入口按钮已挂载", parent === document.body ? "body" : "html");
  } catch (error) {
    warn("入口按钮挂载失败：", error);
  }

}
