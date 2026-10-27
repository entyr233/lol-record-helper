# 掌盟历史段位接入

## 目标与范围

- 保留当前可用战绩功能，删除截图中上游捐赠、主页、GitHub 导航。
- 修复左侧战绩固定高度导致的文字重叠。
- 接入掌盟历史段位，提供 HAR 离线导入、段位页链接查询与刷新。
- 验收：HAR 契约与界面行为测试、完整测试、构建及浏览器布局检查。

## 当前证据

只读检查 `E:\Desktop\StormSniffer-20261027-124101.har`，共 915 条请求。
`POST https://mlol.qt.qq.com/go/battle_info/get_rank_trend` 有两次成功响应，
均包含 25 个赛季/赛段（S3 到 S16 第三赛段），以及单双排、灵活组排各 10 个走势点。
历史来自 `data.season_rank_list`；最近走势来自 `data.trend.rank_trend`。
请求 JSON 为 `{scene}`，不能用 WeGame 的 UIN、openid 或 PUUID 替代。
同一 scene 出现在掌盟用户资料响应及 `https://lol.qq.com/m/zmlolzone/page/tier-detail/?scene=...`。
HAR 中的历史段位玩家与用户截图中的战绩玩家不同，界面必须单独显示历史记录的来源玩家。

## 接入边界

HAR 在浏览器本地解析；不提交 HAR、Cookie 或 scene 到仓库，不持久化 scene。
导入先展示已捕获的响应，仅点击刷新时访问掌盟。
粘贴官方段位页链接后可直接查询；现有 WeGame 查询流程没有签发 scene 的能力。
HAR 数据只证明采集时的响应，在线刷新仍取决于 scene 有效期与掌盟查询权限。

## 进度

已核对当前工作树（开始时干净）、请求结构、字段与布局原因。正在实现接口适配与界面。
