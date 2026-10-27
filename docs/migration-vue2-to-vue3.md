# 迁移说明：Vue 2 + vue-cli → Vue 3 + Vite

分支 `feat/vue3-vite-rewrite`。旧实现完整保留在 `master`，随时可回退。

## 一、文件对照

| 旧 | 新 | 说明 |
| --- | --- | --- |
| `vue.config.js` | `vite.config.ts` | 双构建模式：lib（用户脚本）/ app（演示页） |
| `src/main.js` + `src/mock.js` | `src/main.ts` + `src/dev/mock.ts` | 演示站入口，mock 独立成模块 |
| `src/lol/pack.js` | `src/entry-lib.ts` | IIFE 导出 `window.LolTft.mountLolTft` |
| —— | `src/mount.ts` | 新增：Shadow DOM 挂载，样式彻底隔离 |
| `src/lol/utils/request.js` | `src/api/client.ts` + `errors.ts` + `types.ts` | 超时/重试/取消/错误码映射/类型 |
| `src/lol/const/asyncValues.js` | `src/api/staticData.ts` + `src/data/*.json` | 映射表改为构建期固化 |
| `src/lol/mixins/*.js` | `src/composables/useUserInfo.ts`、`useAsyncData.ts` | mixin → 组合式 |
| `src/lol/components/*.vue` | `src/components/*.vue` | 组件一一对应，增加类型与取消 |
| `src/lol/utils/index.js` | `src/utils/format.ts`、`storage.ts`、`weGameLogin.ts` | 拆分 + 修 bug |
| `package.json` 的 webpack 全家桶 | 仅 vue / vue-router / vite / vitest / vue-tsc | 依赖从 30+ 降到 6 |

## 二、同时修掉的问题（对应代码审查报告编号）

| 编号 | 问题 | 处理 |
| --- | --- | --- |
| P0-1 | webpack 4 在现代 Node 无法构建；build 用 Unix `mv` | Vite 构建，跨平台 |
| P0-2 | lib 产物与 `public/index.html` 不匹配、调试页白屏 | `build:app` 产出真正可用的演示页 |
| P1-1 | 「匹配/排位」标签取反 | `SummonerInfo.vue` 按 `match/rank` 语义正确映射 |
| P1-2 | 全局 CSS 污染宿主页 | `mount.ts` 使用 Shadow DOM，样式只在本组件内 |
| P1-3 | 用错误文案判断登录失效，实际永不触发 | `ApiError` 按 `error_code` 判定（8000102） |
| P1-4 | 映射表加载失败即白屏 | 映射表打包进产物，图标失败自动回退占位图 |
| P1-5 | 分页 offset 用去重后长度导致漏页 | `useBattleList` 单独维护 `serverOffset`，并有单测 |
| P1-6 | 切换对局无取消，存在竞态 | `useAsyncData` 用 `AbortController` + 序号校验 |
| P1-7 | 伤害 0 值被当 `-Infinity` | `maxValues` 用数值比较，`barPercent` 防除零 |
| P1-8 | 死代码 `t_push` / `rune[id].icon` 无保护 | 死代码删除，图标访问全部带兜底 |
| P2 | 无超时/重试、alert 报错、localStorage 无保护 | 已在 `client.ts`/`storage.ts`/UI 状态中处理 |
| P2 | 静态资源未版本化、926KB `items.js` | 映射表前置生成（约 32KB），图标走 ddragon 版本化 URL |
| P2 | `@match *://*/*` 过宽 | 用户脚本只匹配 `www.wegame.com.cn/ioi*` |

## 三、有意保留的行为（平移优先）

- 路由结构与 URL 形式不变（`#/area/:area/type/:accountType/id/:id` 等）
- 接口方法、请求头（`trpc-caller`）、参数名（`account_type/area/id/from_src`）不变
- 视觉风格、信息密度、三个视图页不变；未新增未验证的功能

## 四、尚未做（需要真实账号/额外逆向）

- 段位、LP、常用英雄：需要 WeGame 移动端接口（`m.wegame.com.cn/.../get_battle_topbar_info`），
  目前返回 `AccessControl Not Register`，需补齐客户端注册头，见审查报告 §5.1
- 对面 10 人胜率（上游 issue #1）：接口层已支持，属下一步功能
- i18n、暗色/亮色主题、MV3 扩展形态

## 五、回退

~~~bash
git checkout master          # 回到旧实现
git checkout feat/vue3-vite-rewrite   # 回到新实现
~~~
