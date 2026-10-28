/** 只有 WeGame / lol.qq.com 页面才挂载悬浮按钮和面板 */
export function isWegameHost() {
  return /^(www\.)?wegame\.com\.cn$/.test(location.hostname);
}
export function canUsePanelHere() {
  return isWegameHost() || /^lol\.qq\.com$/.test(location.hostname);
}

export function isHelperPage() {
  return /^\/helper\/lol(?:\/|$)/.test(location.pathname);
}
