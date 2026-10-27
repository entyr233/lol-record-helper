# lol-tft

英雄联盟国服战绩查询 —— 以**用户脚本**形式注入 WeGame 页面，在 PC 浏览器查看真实战绩。

- 脚本入口：登录 https://www.wegame.com.cn/home/ 后，页面右下角「LOL 战绩」按钮
- 数据来源：wegame pallas 接口（同源）+ LOL 助手现行格式 + 掌盟详情回退
- 技术栈：Vue 3 + TypeScript(strict) + Vite + vue-router 4（Shadow DOM 隔离，无 UI 框架）
- 状态：**总览 / 对局列表 / 10 人详情 全部真实数据可用**

## 功能

| 模块 | 内容 |
| --- | --- |
| 总览 | 召唤师资料、等级、赞/黑、四类场次统计（所有/大乱斗/匹配/排位）、**段位 + LP** |
| 近期表现 | 最近 20 场胜负走势（点色块定位到列表对应页并高亮）、常用英雄一键筛选、连胜连败与胜率（重开单列、不计入胜率）；「刷新战绩」同时更新总览与列表并显示更新时间 |
| 对局列表 | 翻页制（每页 10 条），胜负/队列/时长/时间、MVP/SVP/逃跑徽章、对局评价标签（Carry局等）；模式/英雄/胜负/天数筛选 |
| 对局详情 | 10 人全量：KDA、伤害四系柱状图、装备、符文、召唤师技能与释放次数、评分、补刀/经济；摘要按「当前查看玩家」取英雄/昵称/胜负；点名字跳转其战绩页 |
| 搜索 | 按昵称搜索全大区同名玩家，结果可直接收藏 |
| 收藏 | 按「大区 + 账号类型 + 账号标识」去重，顶栏常驻收藏夹，搜索页/详情页/首页共用同一份数据（兼容旧版收藏） |
| 历史段位 | 掌盟 HAR 离线导入 / 官方段位页链接查询；按赛季和模式筛选；近期段位走势与在线刷新 |

## 历史段位查询（v1.3.0）

在总览下方展开「历史段位查询」：

- 点击「导入掌盟 HAR」，选择打开过掌盟历史段位页的抓包文件。文件在浏览器本地解析，导入时不联网。
- 或粘贴掌盟官方段位页链接 `https://lol.qq.com/m/zmlolzone/page/tier-detail/?scene=...`，点击「查询」。
- 可按单双排 / 灵活组排和历史赛季筛选，展开「近期段位走势」查看最近记录。
- HAR 中的玩家可能与上方正在查看的战绩玩家不同，历史区域单独显示来源昵称和采集时间。包含多个玩家时可选择记录。
- 点击「刷新查询」才使用该记录的 scene 请求掌盟。失败保留已导入快照；链接过期或权限受限时需更新掌盟链接。

`scene` 由掌盟签发，现有 WeGame UIN/openid 不能直接替代。链接、scene 和 HAR 不会写入本地存储或分发包。
导入与查询后的内容只保留在当前页面，切换战绩玩家或关闭面板后需重新导入。

v1.3.0 同时移除了上游捐赠、主页和 GitHub 导航，将左侧战绩改为自适应高度，修复文字重叠。

## 数据源与鉴权（重要）

| 接口 | 用途 | 鉴权 |
| --- | --- | --- |
| `wegame.com.cn/api/v1/wegame.pallas.game.LolBattle/*` | 列表/资料/统计/详情 | wegame 登录 cookie（同源自动携带） |
| `mlol.qt.qq.com/go/battle_info/get_battle_detail_h5` | 详情**回退源** | `.qq.com` 登录 cookie（QQ 侧） |
| `mlol.qt.qq.com/go/battle_info/get_rank_trend` | 历史段位与近期走势 | 掌盟段位页的 `scene` |

- 2026 现任格式：列表 `GetBattleList`；资料 `GetSummonerInfo`（含 `season` 段位）；统计 `GetBattleReport`（带 `sids:[255]`，返回 `season_list`）
- 老接口被限制时（8000120 等）：先弹**官方人机验证**（TCaptcha + VerifyRecongnition）后自动重试；详情再失败则回退掌盟接口（postMessage 桥：脚本同时在 lol.qq.com 上运行，替面板做同源请求绕过 CORS）
- 登录态判断**以 cookie 为准**（`uin/p_uin`），不依赖 SDK 的 isLogin()（它在刷新后经常误报）
- 静态映射（符文/装备名）构建期固化，图标走版本化 CDN

## 2026 年的重要变更（相对上游 mscststs/lol-tft）

1. 上游的宿主页 `wegame.com.cn/ioi` 已 404 → 改为任意 WeGame 页面右下角浮动入口 + 全屏面板
2. 单文件分发：UI 打包内联进 userscript（约 200KB），不再依赖远端 bundle 托管
3. Vue 2（已 EOL）→ Vue 3 + TS + Vite；Shadow DOM 隔离，不污染宿主页样式
4. 错误码全量映射（来自现任助手前端）+ 界面直接显示错误码，方便排障

## 开发

~~~bash
npm install
npm run dev          # 本地演示站（mock 数据），http://localhost:5173
npm run typecheck    # vue-tsc
npm test             # vitest
~~~

- 开发默认走 mock（sample/*.json 扩展的示例数据），页面右下角有数据源状态条
- 要连真实数据：右下角「粘贴 Cookie」（或设 `LOL_TFT_COOKIE` 环境变量）；`LOL_TFT_MOCK=0` 强制真实接口
- 登录弹窗只在 wegame 域内可用（登录 SDK 限制），本地开发看真实数据用 cookie 粘贴

## 构建与安装

~~~bash
npm run build:userscript   # dist/userscript/lol-tft.user.js（单文件，含内联 UI）
npm run build:app          # dist/site/（演示页）
~~~

安装：把 `dist/userscript/lol-tft.user.js` 拖进浏览器（ScriptCat/Tampermonkey）→ 覆盖安装 → F5。
本地定制版已停用上游自动更新地址，后续通过重新构建安装更新，避免被上游脚本覆盖。
原项目来源：https://greasyfork.org/zh-CN/scripts/454184（保留作者与许可证信息）。

## 目录

~~~text
src/api/          接口层（client/captcha/mlolDetail/transport/contracts/errors/types）
src/components/   UI 组件
src/composables/  组合式逻辑（翻页列表/异步取消/登录动作/用户参数）
src/const/        大区/队列/段位/评价 等映射
src/data/         构建期固化的符文/装备映射（node scripts/sync-static-data.mjs 更新）
src/styles/       全部样式（仅注入 Shadow DOM）
userscript/       用户脚本模板（bundle 构建时内联）+ 注入探针
scripts/          静态数据同步 / userscript 构建
tests/            契约/策略/生命周期/历史段位/冒烟测试
docs/             代码审查报告 / HAR 分析 / 迁移说明
~~~

## 排障速查

| 错误码 | 含义 |
| --- | --- |
| 8000101 | 请求参数不合法（会自动用规整后的 uin 重试） |
| 8000004 | 当前大区没有角色（换大区） |
| 8000009 / 8000021 | 对方设置了查询权限 |
| 8000022 / 8000120 | 需要人机验证（自动弹滑块） |
| 8000023 | 该用户已注销 |
| 8000102 | wegame 登录失效（点「重新登录」或去 /home/ 登录） |
| 1001 | 掌盟接口无 .qq.com 登录态（去 lol.qq.com 登录一次） |

## 合规与隐私

本项目调用 WeGame/掌盟的非公开接口，仅供个人查询使用，不做批量抓取；不收集不上传任何数据。
诊断工具（`__LOL_TFT_DUMP__`）只读取被拒响应的结构，不包含 cookie。

## 相关文档

- 代码审查报告：docs/code-review-2026-10.md
- HAR 分析（掌盟接口族逆向）：docs/har-analysis-20261027.md
- 历史段位接口与验证：docs/har-rank-history-20261027.md
- Vue2→Vue3 迁移说明：docs/migration-vue2-to-vue3.md
