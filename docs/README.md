# 文档与目录索引

## 项目目录

| 目录 | 职责 |
| --- | --- |
| `src/` | 网页 UI、接口访问、状态和业务逻辑 |
| `userscript/` | 用户脚本壳源码、manifest 与生成的安装入口 |
| `dev/` | 开发服务器、会话切换、mock 数据与浏览器登录 mock |
| `tests/` | 单元测试、浏览器测试、截图检查与样本 |
| `tests/fixtures/wegame/` | 开发 mock 和接口契约测试共用的脱敏 WeGame 样本 |
| `scripts/` | 构建、静态数据同步和发布辅助脚本 |
| `docs/assets/` | 文档图片 |
| `docs/reviews/` | 已完成的代码审查与验证记录 |
| `docs/archive/` | 历史迁移、抓包和接口研究记录 |
| `.agents/skills/` | 项目级 Vue、Vite 技能及参考资料 |
| `.github/` | CI、发布工作流和协作模板 |
| `dist/` | 可再生成的本地构建产物，不入库 |

包管理文件、工具默认配置、网页入口、项目说明与协作规则保留在根目录。

## 常用代码入口

- [玩家查询参数](../src/composables/usePlayerParams.ts)：路由身份到 `PlayerQueryParams` 的转换。
- [共享战绩页](../src/composables/useBattleFeed.ts)：玩家级页缓存与并发请求复用。
- [WeGame 登录](../src/utils/wegameLogin.ts)：SDK 就绪、登录与账号读取。

## 当前维护文档

- [项目说明](../README.md)
- [贡献、构建与发布](../CONTRIBUTING.md)
- [Agent 协作规则](../AGENTS.md)
- [代码命名规则](../AGENTS.md#命名规则)
- [性能与缓存](performance.md)
- [测试投入策略](test-audit.md)

## 审查记录

- [Vue／Vite 审查与本地清理](reviews/skill-review.md)
- [代码审查建议核查与处理](reviews/review-resolution-2026-10-28.md)
- [用户脚本优化审查](reviews/optimization-review.md)
- [上游 Vue 2 代码审查归档](reviews/code-review-2026-10.md)

## 历史资料

- [Vue 2 至 Vue 3 迁移](archive/migration-vue2-to-vue3.md)
- [掌盟 HAR 分析](archive/har-analysis-20261027.md)
- [掌盟接口研究](archive/mlol-api-research-20261028.md)

历史资料中的版本、分支、目录和接口状态描述保留为当时的记录；当前路径和开发流程以本索引、根目录配置及贡献指南为准。
