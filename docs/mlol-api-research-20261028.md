# 掌盟接口用途与扩展核查

核查时间：2026-10-28。研究范围为当前项目代码、项目内既有抓包分析记录、公开项目源码和少量公共统计请求。没有发送真实账号标识、Cookie 或 scene，没有访问个人战绩接口。本次只新增研究文档。

## 当前项目中的作用

运行时接入的是 `POST https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5`。

`useBattleDetail` 先请求 WeGame 详情；本人查询失败时还会搜索并尝试以另一种账号标识重试。之后才调用掌盟详情。掌盟不是当前战绩列表、召唤师搜索或资料统计的数据源。

请求参数为 `uuid`、`area_id`、`game_id`、`start_time`。当前调用方提供比赛、大区和时间，没有提供 uuid。客户端优先通过脚本管理器发送请求，特定错误时回退到 lol.qq.com 页面桥接。

已映射的字段包括十人英雄、昵称、击杀／死亡／助攻、伤害、装备、符文、召唤师技能、部分经济与补刀、段位信息。可选字段缺失时显示未提供。掌盟 uuid／puuid 与 WeGame openid 不是同一种标识，因此不会用它们直接跳转 WeGame 玩家资料或猜测查看者身份。

## 本次验证的公共统计接口

域名统一为 `https://mlol.qt.qq.com`。以下验证使用 Node 原生 fetch，不携带 Cookie 或账号凭据；这是独立 HTTP 请求结果，不证明任意浏览器来源都允许直接跨域访问。

| GET 路径 | 作用 | 本次结果 |
| --- | --- | --- |
| `/go/database/versionlist?zone=lol&from=h5` | 数据版本列表 | HTTP 200，业务 code 为 0；前四项为 16.21、16.20、16.19、16.18。 |
| `/go/battle_info/odp_proxy/lol_101strategy_build` | 出门装、鞋、核心装与后续装备 | 烬、BOTTOM、16.21 返回非空统计，包含 starting_details、shoes_details、core_details 等。 |
| `/go/battle_info/odp_proxy/lol_101strategy_runeinfo` | 符文组合与单项统计 | 同一英雄、位置与版本返回 rune_top_details、rune_single_details。 |
| `/go/battle_info/odp_proxy/lol_101strategy_skill` | 召唤师技能组合 | 返回 data_details。 |
| `/go/battle_info/odp_proxy/lol_101strategy_skill_point` | 技能优先级和加点序列 | 返回 detaildetails。 |
| `/go/battle_info/odp_proxy/lol_101strategy_confront` | 对位统计 | 返回 low_op_details、high_op_details。 |
| `/go/battle_info/odp_proxy/fuwen_hero_rank?championid=1` | 海克斯大乱斗英雄强化与配装统计 | 安妮返回非空 augment_json、augment_json_irank，以及装备、加点相关字段。 |

101 攻略请求示例：

```text
/go/battle_info/odp_proxy/lol_101strategy_build?itier=255&version_id=16.21&lane=BOTTOM&championid=202
```

分路参数区分大小写，公开实现使用 `TOP`、`JUNGLE`、`MIDDLE`、`BOTTOM`、`SUPPORT`。最初使用小写 middle 请求时，服务返回 HTTP 200 和 code 0，但数据为空。不能仅凭状态码认定查询成功。

上述非空统计的 `dtstatdate` 为 `20261027`。请求一个英雄成功只证明该样本可用，不保证所有英雄、分路和版本都有数据。

## 数据结构与接入要点

这些统计响应不是直接可用的对象数组。`data._fieldValues` 中的字段名可能变化，字段值又是一段 JSON 字符串；解码后，部分字段仍使用 `#`、`_`、`|` 等分隔的字符串。需要先在接口边界解析，再转换为项目自身的结构。

不同字段的比例单位不同。公开实现对部分配装字段按 0—1 比例处理，对部分对象字段按百分之一百分点处理；不能统一乘以 100。强化排行还包含 S／A／B／C 等分档，不能把分档或所有比例字段都当成胜率。

接入时应显示数据版本、日期、分路、统计范围与可获得的样本量。没有数据的英雄或位置显示暂无数据。统计推荐描述群体历史表现，不代表某一场比赛的必选方案。

## 项目记录中存在、尚未重新在线验证的能力

| 接口或字段 | 可形成的功能 | 当前边界 |
| --- | --- | --- |
| `/go/battle_info/get_rank_trend` | 历史赛季段位、近期胜点走势 | 项目记录有成功响应，参数是 scene。当前代码没有自动取得 scene 的流程。 |
| `/go/battle_info/get_battle_list` | 掌盟战绩列表备用来源 | 项目记录涉及 self_uuid 和 target_scene，不能直接替换成 WeGame UIN、openid。 |
| `/go/user_profile/query/user` | 昵称、段位、大区等个人资料 | 需要验证当前请求参数、会话及身份对应关系；不能凭现有 WeGame 登录推定已授权。 |
| 详情里的 time_line、team_gold、player_chart | 对局事件线、经济曲线、个人与团队雷达图 | 既有抓包分析记录出现这些字段，当前映射没有保留；需要有效且脱敏的详情样本确认模式和字段结构。 |

抓包记录未出现 Cookie 头，不等于没有认证或访问限制。scene、其他请求字段和请求头仍可能携带访问上下文。历史抓包成功也不证明当前仍可访问。

## 实施优先级

1. 海克斯强化推荐：在英雄详情旁显示公共排行与选择比例，复用当前强化名称和图标表；先核对统计口径和缺失名称。
2. 英雄攻略页：提供版本、分路选择，以及出装、符文、技能和对位数据。公共接口已获得非空响应，适合独立于账号查询接入。
3. 对局时间线与经济曲线：先确认现有掌盟详情响应中的实际字段，再补数据结构与图表。
4. 历史段位：已改用 WeGame `GetBattleReport.season_list`（查询任意玩家时返回其各赛季段位），不再依赖掌盟分享页 scene 与 HAR 导入；掌盟 `get_rank_trend` 保持未接入。
5. 完整掌盟战绩备用链路：需要先解决玩家标识、访问参数、分页与权限错误的对应关系，工作量明显高于接入公共统计。

## 公开来源

- 接口与参数线索：[sunerpy/winer builds.rs，固定版本 9f1bb941face7b1c49870818d41e4529d931467b](https://github.com/sunerpy/winer/blob/9f1bb941face7b1c49870818d41e4529d931467b/crates/core/src/builds.rs)。本次读取的仓库更新时间为 2026-10-27（北京时间）。
- 公共数据验证：[掌盟版本列表](https://mlol.qt.qq.com/go/database/versionlist?zone=lol&from=h5)、[安妮海克斯统计](https://mlol.qt.qq.com/go/battle_info/odp_proxy/fuwen_hero_rank?championid=1)。
- 本地历史样本记录：`docs/har-analysis-20261027.md`。该文档作为历史证据，不代表相关功能当前已接入。
