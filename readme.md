# lol-tft

英雄联盟国服战绩查询 —— 以**用户脚本**形式注入 `www.wegame.com.cn/ioi` 页面运行。

- 数据来源：WeGame 的 `wegame.pallas.game.LolBattle` 接口（需登录态，由 WeGame 页面自身提供）
- 运行形态：userscript 注入 → 加载单文件 IIFE 包 → 在 Shadow DOM 内挂载 Vue 3 应用
- 技术栈：Vue 3 + TypeScript + Vite + vue-router 4，样式为手写 CSS（无 UI 框架）
- 脚本主页：https://greasyfork.org/zh-CN/scripts/454184

## 目录结构

~~~
src/
  api/           接口层：类型、错误码映射、超时/重试/取消、静态资源地址
  components/    UI 组件（对局列表、详情、召唤师信息、图标、柱状条）
  composables/   组合式逻辑（带取消的异步数据、分页列表、用户参数）
  const/         大区、队列、评价位、胜负映射
  data/          构建期生成的符文/装备中文名映射（runes.json / items.json）
  styles/        app.css —— 全部 UI 样式，仅注入 Shadow DOM
  views/         路由页面
  mount.ts       挂载入口（默认 Shadow DOM）
  main.ts        独立演示站入口
  entry-lib.ts   用户脚本用的 IIFE 入口
userscript/      油猴脚本（发布到 greasyfork）
scripts/         静态数据同步脚本
tests/           Vitest 单测
sample/          真实接口返回样本（测试/契约基准）
docs/            代码审查报告等文档
~~~

## 开发

~~~bash
npm install
npm run dev          # 本地演示站（带 WegameLogin mock），http://localhost:5173
npm run typecheck    # vue-tsc 类型检查
npm test             # Vitest
~~~

本地开发时接口请求走 `/api/v1/wegame.pallas.game.LolBattle`，需要一个把请求转发到
`https://www.wegame.com.cn` 并附带登录 cookie 的开发代理（见下）。

## 构建与发布

~~~bash
npm run build        # 产出 dist/lol/lol.umd.js —— 用户脚本加载的单文件包
npm run build:app    # 产出 dist/site/index.html —— 可直接打开的演示/调试页
~~~

发布流程（与旧版一致，产物路径不变）：

1. 把 `dist/lol/lol.umd.js` 上传到 `https://lol-tft.pages.dev/lol/lol.umd.js` 所在位置
2. 需要更新脚本本体时，把 `userscript/lol-tft.user.js` 提交到 greasyfork（脚本 id 454184）

> 注意：IIFE 包已内置 Vue 与 vue-router，不再依赖宿主页面的全局 Vue，也不再有独立 CSS 文件。

## 静态数据

符文图标/名称、装备中文名已固化在 `src/data/*.json`，运行时不再拉取 gtimg 的
`items.js`（926KB）与 `rune_list.js`（131KB）。版本更新后执行：

~~~bash
node scripts/sync-static-data.mjs
~~~

## 合规与隐私

- 本项目调用 WeGame 的私有接口，非官方授权，接口随时可能变更；仅用于个人查询自己的战绩
- 不收集、不上传任何用户数据；查询结果只留在浏览器内存中
- 登录态完全依赖 WeGame 页面自身，本项目不存储 cookie
