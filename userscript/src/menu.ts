import { isWegameHost } from "./host";
const PROJECT_HOME = "https://github.com/" + __REPO__;
const OFFICIAL_HELPER_URL = "https://www.wegame.com.cn/helper/lol/";
const PANEL_HOME_URL = "https://www.wegame.com.cn/?lol_tft_panel=1";
function openProjectUrl(url: string) {
  try { window.open(url, "_blank", "noopener"); } catch (e) { /* 忽略 */ }
}

export function registerMenuCommands(openPanel: () => Promise<void>) {
  function openSelfPanelFromMenu() {
    if (isWegameHost() && window.top === window) {
      void openPanel();
      return;
    }
    // 在别的网站点菜单：打开 WeGame 并自动弹出面板
    openProjectUrl(PANEL_HOME_URL);
  }

  const commands = [
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
      const register = GM.registerMenuCommand;
      commands.forEach(function (command) {
        register(command.title, command.run);
      });
    }
  } catch (e) { /* 菜单注册失败不影响主流程 */ }
}
