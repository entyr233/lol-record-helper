# 测试投入审计

> 目标：测试帮助发现真实问题，同时保持修改容易、反馈及时。**不按数量批量删除**。

## 当前策略

| 场景 | 命令 | 内容 |
| --- | --- | --- |
| 日常开发 | 
pm run check` | lint + typecheck |
| 日常开发 | 
pm run test:related -- <改动文件>` | 只跑相关单测 |
| 常规 CI | 
pm run test:coverage` + 
pm run test:e2e` | 一次完整单测 + Chromium E2E |
| 正式发布 | 
pm run test:e2e:all` | Chromium / Firefox / WebKit 各跑一次 |

普通开发不要求每次全量单测；发布前才做三浏览器验证。\n\n`verify` 是固定 required check：文档-only 改动也会报告成功，但只跑变更检测，不跑 lint/build/test。

## 本轮精简

| 处理 | 用例 | 原因 |
| --- | --- | --- |
| 删除 | `tests/repoLinks.test.ts`（2 条） | 只检查静态 URL；构建脚本已校验 manifest/模板仓库地址 |
| 删除 | `appSmoke`「顶栏 GitHub 主页入口」（1 条） | 纯静态链接属性，不影响真实查询行为 |
| 保留 | 请求取消 / 超时 / 登录 / 缓存 / 数据解析 | 直接影响战绩查询可靠性 |
| 保留 | `apiContract` / `sampleContract` | 防止真实样本 schema 漂移与脱敏回归，属于高价值契约 |

单测数量从 534 降到 531，但目的不是数字，而是去掉“改一处文案就重跑全量”的低价值耦合。

## 后续审查候选（未删除）

以下用例暂保留，后续按“是否曾发现真实回归”逐个判断：

- `battleListItem`：胜/负/重开/Leaver 展示，同一行为在组件层重复覆盖，可考虑合并为少数表驱动用例。
- `devSessionServer`：只服务本地开发服务器，生产风险较低；但涉及 cookie 校验/安全，先保留。
- `aramView`：部分用例偏 UI 文案与结构，待确认是否与 `aramgg` 解析测试重复后再精简。
- `recentStats` / `recentStatsUtils`：分别覆盖组件与纯函数，暂不合并。

## 不纳入常规 CI 的内容

- 三浏览器 E2E 只在发布 workflow 跑；
- Node 22 不再作为独立 CI 矩阵（`engines` 仍允许，升级前手动验证）；
- 文档/README 改动不再单独触发重复发布验证。

验证：文档-only 提交应跳过 lint/build/单测/E2E。
