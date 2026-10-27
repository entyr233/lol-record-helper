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

GitHub Actions 验证流程固定使用 Node.js 24.22.1，通过 `npm ci` 按 `package-lock.json`
安装锁定依赖，依次运行 Vitest、类型检查和一次用户脚本构建，再复用产物测试检查
metadata、版本一致性和构建占位符。CI 不配置登录 Cookie、不调用真实 WeGame API，也不执行发布。

本地开发时接口请求走 `/api/v1/wegame.pallas.game.LolBattle`，需要一个把请求转发到
`https://www.wegame.com.cn` 并附带登录 cookie 的开发代理（见下）。

## 构建与发布

~~~bash
npm run build        # 产出 dist/lol/lol.umd.js —— 构建用户脚本的中间包
npm run build:userscript # 产出 dist/userscript/lol-tft.user.js —— 可安装的单文件脚本
npm run build:app    # 产出 dist/site/index.html —— 可直接打开的演示/调试页
~~~

普通用户从 [Greasy Fork 脚本页](https://greasyfork.org/zh-CN/scripts/454184) 点击安装，
由 Tampermonkey 等用户脚本管理器接管。模板 `userscript/lol-tft.template.js` 不能直接安装。

本地验收或发布时，运行 `npm run build:userscript`，再将生成的
`dist/userscript/lol-tft.user.js` 导入脚本管理器，或把该文件完整内容提交到上述 Greasy Fork 脚本页。
`dist` 是 Git 忽略的生成目录；当前脚本已内联 UI bundle，发布时不再依赖上传远端 UI 包。

> 注意：IIFE 包已内置 Vue 与 vue-router，不再依赖宿主页面的全局 Vue，也不再有独立 CSS 文件。

## 静态数据

符文图标/名称、装备中文名已固化在 `src/data/*.json`，运行时不再拉取 gtimg 的
`items.js`（926KB）与 `rune_list.js`（131KB）。版本更新后执行：

~~~bash
node scripts/sync-static-data.mjs
~~~

## 数据源

| 场景 | 数据 | 说明 |
| --- | --- | --- |
| 正式使用（油猴脚本） | **真实** | 脚本运行在 wegame 页面内，⟦/api/...⟧ 是同源请求，浏览器自动带登录 cookie |
| 本地开发 | mock | 用 ⟦sample/*.json⟧ 扩展出的示例数据，在页面右下角有一个数据源状态条 |
| 本地开发（真实） | **真实** | 在右下角状态条点「粘贴 Cookie」，把浏览器里 wegame 请求的 Cookie 整行贴进去即可，无需重启 |

**怎么拿到 cookie（仅本地开发需要）**

1. 浏览器登录 https://www.wegame.com.cn/ （右上角能看到头像/昵称）
2. F12 → 「网络 / Network」→ 勾选「保留日志」→ 按 F5 重新加载
3. 筛选框输入 ⟦home⟧（或点筛选器里的「文档」），点最上面那条 document 请求
4. 右侧「标头 / Headers」→ 「请求标头 / Request Headers」→ 找到 ⟦Cookie:⟧ 行，三击选中值 → Ctrl+C
5. 粘到页面右下角状态条里。支持三种格式：纯 cookie 串、⟦Cookie: xxx⟧、整段 cURL

粘贴后会立刻用一次真实请求校验：有效则自动重载切到真实数据；仍返回 8000102 会提示
"cookie 未被识别为登录态"（常见原因：没登录、复制不全、抓的是第三方上报域）。

开发服务器只绑定 `127.0.0.1`，包括传入 `--host` 时。开发工具可先同源 GET
`/__lol-tft/status` 获取当前进程的 `devToken`；写入会话仅接受 POST
`/__lol-tft/cookie`，JSON 为 `{ "cookie": "..." }`，清除会话用无请求体的 DELETE。
两种方法都需 `Content-Type: application/json` 和 `x-lol-tft-dev-token` 请求头，
请求体上限为 16 KiB。浏览器会自动携带同源 Origin；本地命令行工具需显式传入
与访问地址一致的 Origin（如 `http://127.0.0.1:5173`）。重启后需重新获取 token。

> 2026 年变更：WeGame 的 ⟦/ioi⟧ 战绩页已下线（404）。用户脚本从「接管整个页面」改为
> 「任意 WeGame 页面右下角浮动入口 + 全屏面板」，不再依赖宿主 DOM 结构。

### 段位 / LP / 常用英雄

当前使用的 5 个接口（SearchPlayer / GetSummonerInfo / GetBattleReport / GetBattleList / GetBattleDetail）
**不包含段位字段**。腾讯移动端另有 ⟦get_battle_topbar_info⟧（含段位/常用英雄），但需要 App 级签名，
浏览器侧不可用。

想确认网页接口族里是否还有段位方法，可用一次真实 cookie 跑探测脚本：

~~~bash
node scripts/probe-api.mjs "<从浏览器复制的 cookie>"
~~~

脚本会把「存在的方法」列出来（网关在鉴权后才校验方法名，所以必须有有效 cookie）。

## 合规与隐私

- 本项目调用 WeGame 的私有接口，非官方授权，接口随时可能变更；仅用于个人查询自己的战绩
- 不收集、不上传任何用户数据；查询结果只留在浏览器内存中
- 登录态完全依赖 WeGame 页面自身，本项目不存储 cookie
