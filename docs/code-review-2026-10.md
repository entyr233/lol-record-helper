# lol-tft 代码审查与改造建议

> 审查对象：`E:\Desktop\lol-tft`（fork of `entyr233/lol-tft`，上游 `mscststs/lol-tft`）
> 审查时间：2026-10-26　审查方式：全量通读 44 个文件 + 线上产物/接口实测 + 外部生态调研
> 说明：本文所有"实测"结论都可在第 2 节复现。

---

## 0. 结论速览（TL;DR）

| 维度 | 评价 | 一句话 |
| --- | --- | --- |
| 项目活性 | ❌ 已停更 | 上游最后提交 2023-12-26，近 3 年无更新；Vue 2 已于 2023-12-31 EOL |
| 技术栈 | ❌ 过时 | vue-cli 3 + webpack 4 + Vue 2.6，**在现代 Node（≥17）上无法直接构建** |
| 数据源 | ✅ 仍存活 | WeGame `wegame.pallas.game.LolBattle` 实测 200（未登录码 8000102）；gtimg 静态资源正常 |
| 部署链 | ⚠️ 能用但脆弱 | userscript 注入 + pages.dev 托管 UMD，产物与源码同步；但调试页永久白屏 |
| 代码质量 | 🟡 及格 | 结构清晰、命名一致；但存在数据错位、竞态、死代码和全局 CSS 污染 |
| 健壮性 | ❌ 差 | 无超时/重试/取消，错误处理靠 `alert`，一个 1MB JSON 失败即整页白屏 |
| 工程化 | ❌ 几乎为零 | 无 lockfile、无测试、无 CI、lint 配置名存实亡、Windows 下 build 直接失败 |

**核心判断**：这不是"补几个 bug"就能救的项目，而是一次**轻量重写**的候选。业务面很小（5 个接口、8 个页面组件、约 1400 行），重写成本远低于继续维护旧栈；建议直接迁到 **Vite 8 + Vue 3 + TS + Shadow DOM 隔离**，约 3–5 人日。

---

## 1. 项目画像

### 1.1 运行时架构（实测还原）

生产形态不是普通网站，而是「**注入到 WeGame 页面的油猴脚本**」：

```
greasyfork 脚本 454184 (v0.12)
  └─ @match https://www.wegame.com.cn/ioi
     ├─ 注入 <style>，把 body 刷成 #1a2026，隐藏 .frame-nodata-wrap
     ├─ 加载 https://wegame.gtimg.com/.../vue/2.6.10/vue.min.js        (宿主 CDN)
     ├─ 加载 https://www.wegame.com.cn/middle/login/login.sdk.js        (登录 SDK)
     ├─ 轮询 WegameLogin.default.isLogin()，未登录则 popup() 拉起
     └─ 加载 https://lol-tft.pages.dev/lol/lol.umd.js                   (本项目产物)
          └─ new unsafeWindow.Vue({ render: h => h("lol") }).$mount("#app")
```

本项目源码里 `src/main.js` 只是**本地调试壳**（`app.vue` 挂一个 `<lol>`），真正的发布入口是 `src/lol/pack.js`（`--target lib`）。

### 1.2 数据流

```
router 页面 (search / self / summary)
   └─ components (summonerInfo / battleList / battleDetail / battleDetailPlayer)
        ├─ utils/request.js  → POST /api/v1/wegame.pallas.game.LolBattle/<Method>
        │                        （dev 由 vue.config.js 代理到 wegame.com.cn，并塞入 cookies 文件里的 Cookie 头）
        └─ const/asyncValues.js → 拉 gtimg 的 rune_list.js / items.js 映射表
             utils/request.js  → 拉 gtimg 的 hero/{id}.js 拿技能图标
```

### 1.3 技术栈与代码分布

- 运行时依赖：仅 `vue@2.6.14` + `vue-router@3.6.5`
- 构建：`@vue/cli-service@3.12` + webpack 4 + less，另外在 devDependencies 里冗余声明了 20+ 个 webpack 生态包
- 代码量：44 个文件（不含 `.git`），源码约 1400 行；最大文件 `battleDetailPlayer.vue`（14.7KB）
- 资源：`src/lol/assets/bg.webp` 84KB **从未被引用**（背景图用的是外链 `wsd.pages.dev`）

### 1.4 上游状态（GitHub API 实测）

| 项 | 值 |
| --- | --- |
| 上游 star / fork | 5 / 3 |
| 最后 push | 2023-12-26 `feat:damage` |
| 未关闭 issue | 1 —— 2023-09-14「希望把对面的胜率也标出来~」 |
| release tag | 无 |
| 你的 fork | 创建于 2026-10-26，与上游同一 commit `4cd9d5f`，无本地提交 |

---

## 2. 实测证据（可复现）

| # | 检查项 | 结果 | 含义 |
| --- | --- | --- | --- |
| 1 | `POST /api/v1/wegame.pallas.game.LolBattle/GetBattleList`（无 cookie） | `200` `{"result":{"error_code":8000102,"error_message":""}}` | **接口仍活着**；未登录错误码 8000102，且 `error_message` 是空串 |
| 2 | 同上 `SearchPlayer` | `200` 同错误码 | 同上 |
| 3 | `game.gtimg.cn/.../items/items.js` | `200`，原始 926KB / gzip 119.8KB，`Cache-Control: max-age=120` | 未版本化 + 仅缓存 2 分钟 → 冷启动反复重下近 1MB |
| 4 | `.../runeList/rune_list.js` | 200，131KB，可 JSON 解析 | 映射表可用但偏大 |
| 5 | `.../hero/17.js` | 200，58KB/英雄 | 每个英雄一次额外请求 |
| 6 | `ddragon/api/versions.json` | 最新 **16.21.1** | 官方资源已到 2026 年 10 月版本 |
| 7 | `ddragon/cdn/16.21.1/.../champion.json`（zh_CN） | 200 | 可完全替代 gtimg 做英雄/装备图标与中文名 |
| 8 | `raw.communitydragon.org/latest/...` | 200 | 皮肤/图标全量备选 |
| 9 | 部署产物 `lol-tft.pages.dev/lol/lol.umd.js` | 200，90,830B；chunk 0–8、4 个 css 全部 200 | 部署完整，且 chunk 3 含 2023-12-26 的「伤害」功能 → **产物与源码同步** |
| 10 | 部署的 `/lol/index.html` | 200，仍含字面量 `<%= BASE_URL %>favicon.ico`，无任何启动 script；`favicon.ico` 404 | 该"调试页"永远白屏 |
| 11 | `v2.vuejs.org/eol` | "Vue 2 has reached EOL and is no longer actively maintained" | 官方 EOL 确认 |
| 12 | npm registry | `vite@8.3.5`；`@vue/cli-service@5.0.9`（2022 年） | 构建工具代际差 4 年+ |
| 13 | 本机 Node | `v24.21.0` | webpack 4 的 md4 哈希在此版本必然抛 `ERR_OSSL_EVP_UNSUPPORTED` |

---

## 3. 问题清单

严重度：**P0** 阻断 / **P1** 明显功能或数据错误 / **P2** 健壮性与体验 / **P3** 风格与可维护性

### P0 — 阻断级

**P0-1　构建链已死（无法 `npm run build`）**
- 位置：`package.json:10`、`.gitignore:3`
- 现象：① webpack 4 使用 md4 哈希，Node ≥17（OpenSSL 3）直接抛 `ERR_OSSL_EVP_UNSUPPORTED`，需 `NODE_OPTIONS=--openssl-legacy-provider` 才能跑；② 构建脚本用 Unix 的 `mv`，**Windows 上必然失败**；③ `package-lock.json` 被 gitignore，依赖树不确定，20 个 2019–2020 年的包现在解析极易冲突。
- 影响：这个 fork 在当前环境下"装不上、构建不了"，任何改进都无从开始。
- 建议：迁 Vite（见第 4 节），或临时用 Node 16 + WSL 只做止血。

**P0-2　调试页与产物不匹配（永久白屏）**
- 位置：`package.json:10`、`public/index.html:1-30`、`src/lol/pack.js:2`
- 现象：`--target lib` 的入口是 `pack.js`（只注册全局组件），但 `public/index.html` 既没有 `<script src="./lol/lol.umd.js">` 也没有 `new Vue().$mount`，且 `index.html` 里的 `<%= BASE_URL %>` 在 lib 构建下不会被 html-webpack-plugin 替换（实测线上原样保留）。
- 影响：`lol-tft.pages.dev/lol/index.html` 打开是空白页，新人无法本地预览/回归。
- 建议：拆成两个 build target（app + lib），或干脆只保留 Vite 的 lib 模式 + 一个独立的 `dev.html` 手写挂载。

### P1 — 功能/数据错误

**P1-1　「匹配 / 排位」指标疑似写反**
- 位置：`src/lol/components/summonerInfo.vue:43-53`
- 现象：界面 "匹配" 取 `total_rank_*`，"排位" 取 `total_match_*`。
- 影响：玩家看到的场次/胜场全部张冠李戴，是整个页面最"伤信任"的错误。
- 建议：按语义修正为 匹配→`total_match_*`、排位→`total_rank_*`，并用一个真实账号核对一次（该字段不在 sample/ 里，属未证实项，但命名语义几乎可以确定）。

**P1-2　全局 CSS 污染宿主页面**
- 位置：`src/app.vue:12-27`（`html, body` 无 scoped）、`src/lol/main.vue:26`（`* { box-sizing: content-box }`）、`main.vue:65-77`（`::-webkit-scrollbar` 全局）
- 现象：这些 SFC 的 `<style lang="less">` **没有 scoped**，构建后被注入到 wegame.com.cn 文档，`*` 选择器会改写宿主页面所有元素的盒模型。
- 影响：轻则 WeGame 自身 UI 错位，重则页面布局崩坏；且升级 WeGame 时会被动"背锅"。
- 建议：Shadow DOM（或 iframe）隔离 + 组件内 `scoped`，只保留一个受控的 reset 作用域。

**P1-3　登录失效检测绑在错误文案上，实际永远不触发**
- 位置：`src/lol/components/summonerInfo.vue:99-108`
- 现象：用 `e.message.indexOf("auth check failed")` 判断是否需要重登；而实测服务端未登录时 `error_message` 为**空串**、`error_code` 为 8000102，于是 `request.js` 抛出的 message 只有 "请求失败：GetSummonerInfo | "，永远匹配不上 → 只会弹 `alert("请求用户数据出错")`。
- 影响：登录过期后用户只能自己猜怎么恢复。
- 建议：在请求层做 `error_code → 语义` 映射（8000102 = 未登录），抛类型化错误，由 UI 决定重登。

**P1-4　初始化失败即整页白屏，且无重试**
- 位置：`src/lol/view/summary.vue:27-33`、`src/lol/const/asyncValues.js:8-23`
- 现象：`Promise.all` 里任一 gtimg 请求失败 → catch 里 `alert` → `ready` 永远 false → 整个页面空白，只能刷新。
- 建议：映射表改为**构建期或首屏可降级**（失败时用 id 兜底占位图），并加"重试"按钮。

**P1-5　分页 offset 用去重后的数组长度，会漏页**
- 位置：`src/lol/components/battleList.vue:111`（`offset: this.battles.length`）、`:118`（过滤重复后再 push）
- 现象：服务端返回含重复 `game_id` 时，去重后长度 < 实际请求偏移，下一页会从错误位置开始。
- 建议：单独维护 `serverOffset`，按"本次返回条数"累加。

**P1-6　切换对局没有请求取消，存在竞态**
- 位置：`src/lol/components/battleDetail.vue:55-57,84-90`
- 现象：快速点两局时，先发的请求若后返回会覆盖详情 → 列表选中 A、右侧显示 B。
- 建议：`AbortController` + 请求序号比对（只接受最新一次）。

**P1-7　0 值被当成"无数据"**
- 位置：`src/lol/components/battleDetailPlayer.vue:250`（`c[key] || -Infinity`）
- 现象：伤害为 0 时被替换成 `-Infinity`，`maxData` 计算错误；配合 `histogram.vue:20` 的 `value/max` 会得到 `NaN%/Infinity%` 的非法宽度。
- 建议：`??` 代替 `||`，并对 `max<=0` 做除零保护。

**P1-8　死代码里的运行时炸弹**
- `src/lol/components/battleListItem.vue:77`：`t_push("以少胜多")` —— 未定义函数（应为 `t.push`）。当前 `tags` 计算属性只被注释掉的模板使用所以没炸，一旦恢复该区块立刻 ReferenceError。
- `src/lol/components/icons.vue:37,52`：`rune[this.id].icon` / `.name` 无空值保护，遇到映射表里没有的新符文/新 id 直接 TypeError；`items.find` 有保护但 `rune` 没有。
- 建议：删死代码；映射访问统一走 `rune[id]?.icon ?? fallback`。

### P2 — 健壮性与体验

| 位置 | 问题 | 建议 |
| --- | --- | --- |
| `utils/request.js:18-31` | 无超时、无重试、无 `credentials`/`signal`；错误只抛裸字符串 | 换 `ofetch`/`ky`，统一超时 10s + 指数退避 + 类型化错误 |
| `utils/request.js:44-55` | `getRoleInfo` 无失败兜底，无持久缓存 | 内存缓存 + `localStorage`（带版本号），失败降级为默认图标 |
| `utils/storage.js:12-20` | `JSON.parse` 无 try/catch，localStorage 可能不可用 | 包一层安全读写 |
| `utils/index.js:98-113` | `clearCookie` 只清 `Domain=wegame.com.cn` 且**清不掉 HttpOnly** | 交给扩展 `chrome.cookies`，或直接依赖 SDK 的 logout |
| `utils/index.js:58-70` | `copy` 用已废弃的 `document.execCommand` | `navigator.clipboard.writeText` + 降级 |
| `utils/index.js:71-87` | `seconds2str(0)` 返回空串（reduce 无初值） | `if (time === 0) return "0秒"` |
| `battleList.vue:154` | CSS 语法错误 `overflow:overlay .no-data {
  ...`（少了分号，把选择器吃掉了） | 修正为独立规则，并换 `overflow: auto` |
| `app.vue:27` | `overflow: none` 非法值 | `overflow: hidden` |
| `icons.vue:97-104` | 每张技能图标一次网络请求，无 loading 占位 | 骨架屏 + `loading="lazy"` |
| `summonerInfo.vue:108`、`summary.vue:31` | 用 `alert` 报错 | 全局 toast / 错误边界 |
| `const/areas.js` | 29 条 2023 年区服，硬编码 | 改为接口/配置下发，或至少补 `峡谷之巅` 等 |
| `public/index.html:8` | 标题仍是 `调试工具`；外链 unpkg 无 SRI；Vue 版本 2.6.10 与 package.json 的 2.6.14 不一致 | 换本地依赖 + 锁定版本 |
| `src/mock.js` | 无条件覆盖 `window.WegameLogin` | 仅在 `process.env.NODE_ENV === "development"` 时导入 |
| `.env` | 5 个 `VUE_APP_*` 变量中 3 个从未被读取；`vue.config.js` 用的 `VUE_APP_PUBLIC_PATH/INDEX_PATH` 反而没定义 | 清理配置，补 `.env.example` |
| `package.json:10` | 无 `files`/`engines`；`main` 指向空的 `index.js` | 补 `engines.node`，删除空入口 |

### P3 — 风格与可维护性

- **死代码/空文件**：`index.js`(0B)、`libs/request/index.js`(0B)、`libs/request/base.js`（带着 WeGame UA 的伪浏览器头，无人引用）、`battleListItem.vue` 的 `tags`/`judgement` 计算属性、`battleDetail.vue` 与 `battleList.vue` 未使用的 `icons` 导入、`self.vue` 未使用的 `rq` 导入、`summonerInfo.vue:87` 的空语句 `("");`
- **代码重复**：`summary.vue`/`search.vue`/`battleList.vue` 的 `mounted + Promise.all + ready` 模式重复 4 次，可抽 `useAsyncData`
- **两套命名**：列表接口用 snake_case，详情接口用 camelCase，没有类型定义兜底
- **无测试**：`sample/gameid_result.json`、`sample/gamelist_result.json` 是现成的真实 fixture，却没写一个测试；`test` 脚本直接 `exit 1`
- **lint 名存实亡**：`.eslintrc.js` 里 `plugin:vue/essential` 重复声明、`@vue/standard` 被注释、还残留小程序全局变量（`wx`/`Page`/`__WECHAT__`），并且关掉了 `no-useless-catch` 等有用规则
- **可访问性**：全部用 `div @click` 当按钮、`img` 无 `alt`、无键盘/焦点样式、颜色对比度偏低
- **国际化**：中文硬编码在模板里，无 i18n

---

## 4. 改造方案（三档，按投入排序）

### 方案 A｜止血补丁（0.5 人日）— 只适合"先让它能跑"
1. 加 `.nvmrc` 钉 Node 16，或构建脚本前置 `NODE_OPTIONS=--openssl-legacy-provider`；把 `mv` 换成 `cpy-cli`
2. 修 P1-1（标签写反）、P1-5（offset）、P1-7（0 值）、P1-2 中的 `*{box-sizing}`
3. 删死代码与空文件，`test` 脚本换成 `vitest run`（先只加 2 个 fixture 测试）
4. 补 `package-lock.json` 并提交

> 取舍：改完仍是 Vue 2 EOL 技术栈，6 个月内还得再重写一次。**不推荐作为最终方案**，但可作为重写期间的过渡。

### 方案 B｜Vite + Vue 3 迁移（3–5 人日）✅ 推荐
业务面小，属于"平移"而非"重做"。分 7 步：

1. **脚手架**：`pnpm create vite` → Vue 3 + TS；删掉 `vue.config.js`、`babel.config.js`、webpack 全家桶 devDependencies（约 20 个包）
2. **组件平移**：`filters` → `computed`/工具函数；`mixins` → `composables`（`useUserInfo`/`useAsyncData`）；`props: ["a","b"]` → 带类型与 `required` 的 `defineProps`
3. **状态与请求**：`pinia`（或纯 `reactive`）；请求层换成 `ofetch`（内置超时/重试/`AbortController`），并把 5 个接口收敛成一个 `LolBattleClient`，`error_code` 做语义映射
4. **类型**：将 `sample/*.json` 转成 `types.ts`（或用 `json-schema-to-typescript`），让 snake_case/camelCase 两套契约都有类型
5. **样式隔离**：用 Shadow DOM 挂载——
   ```ts
   const host = document.createElement("div");
   host.id = "lol-tft-root";
   document.body.appendChild(host);
   const root = host.attachShadow({ mode: "open" });
   root.appendChild(styleEl);          // 样式全部进 shadow
   createApp(App).mount(root.appendChild(document.createElement("div")));
   ```
   这样能彻底解决 P1-2，也不再需要 `body{background:...!important}` 这种宿主 hack
6. **资源**：Data Dragon / CommunityDragon 版本化 URL（`.../cdn/<ver>/img/champion/<Name>.png`），映射表在**构建期**拉取成 JSON 打进包（或由 GH Action 每周同步一次 patch 版本），彻底摆脱 `max-age=120` 的 926KB `items.js`
7. **发布**：Vite `build.lib`（`formats: ["iife"]`，`name: "LolTft"`）产出单文件；GitHub Actions 打 tag 后自动 `PUT` 到 greasyfork（其 API 支持 `/scripts/454184` 更新）

### 方案 C｜重写成 MV3 浏览器扩展或独立站点（1–2 周）— 想要"长期产品"时选
- **MV3 扩展**：`chrome.cookies` 能读 HttpOnly cookie，`host_permissions` 精确到 `wegame.com.cn`，不再需要 `@match *://*/*`；后台 service worker 做请求与缓存；`chrome.scripting` 注入 UI
- **独立站点**：保留现有 WeGame 登录态桥接（或在扩展里做），前端是普通 SPA，天然可测、可分享、可 SSR
- **取舍**：多一层安装门槛（扩展商店审核），但登录态更稳、合规面更清楚

---

## 5. 外部调研：新思路

### 5.1 数据源：还有一层更"肥"的接口没人用
国服数据必须走腾讯侧（Riot 官方 API 的平台路由值不含国服，`developer.riotgames.com` 只把 `zh_CN` 当语言/资源）。但除了现在用的 `wegame.pallas.game.LolBattle`，社区逆向笔记（`rainzee/WegameApiReversing`）还记录了**移动端 another 接口族**：

| 能力 | 端点 |
| --- | --- |
| 按昵称查全大区角色 | `m.wegame.com.cn/api/mobile/lua/proxy/index/mwg_lol_proxy/query_by_nick` |
| 段位/总场次/最近 KDA/皮肤数/英雄数 | `.../mwg_lol_proxy/get_battle_topbar_info` |
| 常用英雄 | `.../mwg_lol_proxy/get_often_used_champion` |
| 对局列表/详情 | `m.wegame.com.cn/api/trpc/Proxy/Forward/trpc.wegameapp.lol_common_service.DataLogic/GetBattleList(Detail)` |

我实测这些端点是**存在的**（返回 `{"code":508,"msg":"AccessControl Not Register"}` / `{"code":500,"msg":"req error"}`），说明需要客户端注册头/签名，尚未直接可用。**收益**：能补上现在完全缺失的「段位、LP、总场次、常用英雄」，这是同类产品的标配信息。**风险**：逆向成本 + 接口稳定性不可控。

### 5.2 静态资源：可以彻底告别 gtimg
- **Data Dragon**（官方、版本化、zh_CN、免鉴权）：`https://ddragon.leagueoflegends.com/cdn/16.21.1/...`，实测可用
- **Community Dragon**（`raw.communitydragon.org`）：皮肤/图标/技能图标更全，实测可用
- 价值：URL 里带版本号 → 可设 `immutable` 长缓存；不再受 `max-age=120` + 926KB `items.js` 的折磨

### 5.3 产品功能：上游 issue 和竞品都在说什么
- 上游唯一未关闭 issue：#1「希望把对面的胜率也标出来~」（2023-09）——**最划算的功能点**：一局里 10 个人的近期胜率/战绩，直接复用现有 `GetBattleList`，只是把 10 个人的列表都拉一遍（可并发 + 缓存）
- 同类开源实现可参考的思路：`Kroomax/LOLHistory`（WeGame → 本地分析与可分享 HTML 报告）、`mizi6654/LeagueHistory`（智能分析/自动秒选）、`shecong/LOL-GameAssistant`（观战、对局分析）、greasyfork `500284`（大乱斗团队 ELO 均分）——都是"在 WeGame 页面上加分析层"的同一条赛道
- 建议新增（按投入产出排序）：
  1. 对面 10 人胜率/近期战绩（对应上游 issue）
  2. 段位 + LP 变化趋势（需 5.1 的接口）
  3. 常用英雄 Top5 + 该英雄近期胜率
  4. 分均补刀/分均伤害/视野分（数据在 `player_details` 里已有，只是没展示）
  5. 双排/多排搭档胜率
  6. 一键生成分享图（canvas / html-to-image）

### 5.4 分发形态
- 现状：greasyfork userscript + Cloudflare Pages 静态托管（实测部署健康）
- 更稳的选择：MV3 扩展（读 HttpOnly cookie、精确 host 权限、可离线缓存）；或"扩展只做登录态桥接 + 独立站点做展示"，把 `@match *://*/*` 这种过宽匹配彻底去掉

---

## 6. 立即可做的 10 件事（按性价比排序）

| # | 动作 | 预计 | 收益 |
| --- | --- | --- | --- |
| 1 | 修「匹配/排位」标签（`summonerInfo.vue:43-53`） | 10 min | 纠正最伤信任的数据错误 |
| 2 | 删全局 `* { box-sizing }`，改 Shadow DOM 挂载 | 2 h | 不再污染 WeGame 页面（P1-2） |
| 3 | 请求层加超时/重试/Abort + `error_code` 语义映射 | 3 h | 修掉 P1-3、P1-6，错误可读 |
| 4 | 映射表构建期化（ddragon/cdragon），弃用 926KB `items.js` | 4 h | 首屏少 ~1MB 且可长缓存 |
| 5 | 修 offset 分页 + 0 值处理 + `seconds2str(0)` | 1 h | 修 P1-5、P1-7 |
| 6 | 建 Vite + Vue3 + TS 骨架，先迁 1 个页面做试点 | 1 d | 验证迁移路径，建立信心 |
| 7 | 用 `sample/*.json` 写 MSW + Vitest，覆盖请求层与 2 个组件 | 1 d | 有回归网，后续重构才敢动 |
| 8 | GitHub Actions：lint + typecheck + test + build + 发布 | 0.5 d | 不再"手搓发版" |
| 9 | 实现「对面 10 人胜率」（上游 issue #1） | 1 d | 用户可见的功能增量 |
| 10 | 清理死代码/空文件/未用导入，补 `engines` 与 lockfile | 0.5 d | 降低后续维护成本 |

---

## 7. 风险与合规提醒

1. **ToS 风险**：抓取 WeGame 私有接口（`trpc-caller` 头、cookie 认证）属于灰色地带，接口随时可能变更或加签名；建议在 README 明确"非官方、仅供个人查询"，不做批量爬取。
2. **登录态**：不要把 cookie 写进仓库或日志（当前 `vue.config.js` 读本地 `cookies` 文件仅用于 dev，且已被 `.gitignore` 覆盖，这点做得对）；上线形态建议走 SDK/扩展，不自己存明文。
3. **隐私**：查询他人战绩会拿到 10 人 openid/昵称，别落库、别上传第三方。
4. **依赖安全**：2020 年的依赖树存在已知漏洞（webpack 4 `loader-utils`、`node-forge` 等），迁 Vite 可一次性解决。

---

## 8. 审查方法备注

- 全量通读 `src` 下 34 个源文件 + 配置，未抽样
- 字段契约用脚本对 `sample/*.json` 的 key 集合与代码里所有 `data.xxx` 引用做集合差：**当前引用的字段全部存在于样本**（说明 2023 年的契约没漂），问题在语义（标签写反）与数值处理（0 值）上
- 线上接口/产物实测使用 Node `fetch` 直接请求（无 cookie，故只能验证"存活"不能验证"返回正确"）
- 未能验证的项已显式标注：P1-1 需真实账号核对；5.1 的移动端接口需进一步逆向 header
- 本次审查受环境限制（嵌套工具链不可用），全部通过 Node 原生脚本完成；文中行号均由脚本定位，非人工估算
