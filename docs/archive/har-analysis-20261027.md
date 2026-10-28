# HAR 分析报告：StormSniffer-20261027-093839.har

> 分析时间：2026-10-27　文件：9.28MB，820 条请求，时间跨度 50 秒（2026-10-27 00:54 CST 前后）

## 0. 一句话结论

这份 HAR 抓的是**掌上英雄联盟 App（iOS）**的流量，不是 WeGame 网页的——里面**没有任何 wegame.com.cn 请求**，
所以「登录信息过期」这个问题它解释不了。但它意外提供了**一条更肥的数据线**（掌盟接口族），
而且确认了「段位 + LP + Riot ID」在腾讯侧都是现成字段。

## 1. 流量构成

| 域名 | 请求数 | 内容 |
| --- | --- | --- |
| game.gtimg.cn | 397 | 静态资源：段位图标（tier-1/tier-9）、battle_tag、TFT 棋子图 |
| mlol.qt.qq.com | 237 | **掌盟接口**：战绩列表/详情、用户资料、资产、好友关系 |
| down.qq.com | 38 | 头像/英雄头像图 |
| lol.qq.com | 29 | 官网页面与活动资源 |
| 其它 | ~119 | 埋点/上报（被广告插件拦截，ERR_BLOCKED_BY_CLIENT） |

## 2. 掌盟接口族（mlol.qt.qq.com/go/...）—— 全部 200

| 接口 | 作用 | 关键点 |
| --- | --- | --- |
| `/go/battle_info/get_battle_list` | 对局列表 | 请求体要 `self_uuid` + `target_scene`（v3_ 开头的不透明令牌） |
| `/go/battle_info/get_battle_detail_h5` | 对局详情 | 由 `lol.qq.com/cp/gamedetail/index.html?area=&gameId=&userId=` 调用 |
| `/go/user_profile/query/user` | 用户资料 | 返回 `tier:"大师"`、`gameNickName:"一梦浮生云来去#29837"`（Riot ID）、大区/等级 |
| `/go/battle_info/get_player_recent_stat` 等 | 近期数据/常用英雄 | |
| `get_user_trophy_v2 / get_riot_point / get_skin_last_buy` | 资产 | |

### 关键观察

1. **237 个请求没有一个带 Cookie 头**（0/237）——鉴权靠请求体里的 `scene` 令牌（v3_...）与 `self_uuid`，不靠浏览器 cookie。
2. **CORS 只放行 `https://lol.qq.com`**（Allow-Origin 是具体来源，不是 *；Allow-Credentials: true）。
   我们脚本跑在 wegame.com.cn 域，浏览器侧直接 fetch 会被 CORS 拒绝，除非用 `GM_xmlhttpRequest`（需要 @grant）。
3. **战绩隐私**：目标玩家开了隐私，列表接口返回 `code:100 `该玩家在游戏中设置了战绩隐私``；
   但 `get_battle_detail_h5` 对具体对局仍返回完整数据（10 人全量）。
4. **玩家字段非常全**（比我旧的 wegame 样本还富）：
   - `game_level: {tier:"1", league_points:"59", rank:"3"}` —— 段位 + LP + 段位内排名
   - `name: "D927#41091"` —— Riot ID（gameName#tag）
   - 伤害三系/承伤/插眼排眼/控制时长/占比（damage_percent 等 6 个百分比）
   - `player_chart`：雷达图数据（参团/经济/KDA/承伤/伤害/治疗，个人 vs 团队两条线）
   - `perk_style_url / perkSubStyle / item0..6 / puuid / position / is_mvp / is_svp`
   - 对局级：`time_line`（事件线+击杀线）、`team_gold`（经济曲线）、`atakhan_event`、`lol_summary_info`（一血/一塔/首龙/首先锋）

## 3. 对项目的影响

### 路线 A：修好 WeGame 会话（原路）
「登录信息过期」仍缺一个关键信息：**错误码**。界面现在会显示「xxx（错误码 8000xxx）」，
把这个数字给我即可定位。也可以在 wegame 页面（登录态下）用 F12 → 网络 → 导出 HAR 再给我分析。

### 路线 B：接掌盟/官网数据线（新发现）
- `lol.qq.com/cp/gamedetail/index.html?area=&gameId=&userId=` 是**公开的战绩详情页**（无 cookie 可用）
- 若拿得到对局列表（需要 scene 令牌），详情可以走这条线，数据比 wegame 老接口更全（含时间线/经济曲线/段位/雷达图）
- 代价：需要再逆向 `scene` 的签发（可能在搜索接口返回里），且脚本要加 `@grant GM_xmlhttpRequest` 绕 CORS

### 路线 C（推荐，短期）：A+B 混合
- 列表继续走 WeGame（一旦会话修好）
- 详情页/段位走掌盟 `get_battle_detail_h5`（公开、字段全）
- 两者用 `game_id`/`area_id` 对齐

## 4. 段位字段的直接证据

- 用户资料：`tier: "大师"`（掌盟档案级）
- 对局详情每名玩家：`game_level: {tier:"1", league_points:"59", rank:"3"}`
- 段位图标资源：`game.gtimg.cn/images/lol/cp/gamedetail/tier-1_*.png`（tier-N 编号）

## 5. 下一步（按优先级）

1. 【需要你】在 wegame 页面打开面板，把界面上的**错误码**发我；或抓一份 **wegame 页面的 HAR**（这次抓的是掌盟 App 的）
2. 【可做】detail 走掌盟 `get_battle_detail_h5` 的可行性验证：拿一场已知 `gameId+area+userId` 试试公开页能不能直接复现
3. 【可做】等真实数据通了，把段位/胜点/雷达图接进 UI（字段已确认存在）
