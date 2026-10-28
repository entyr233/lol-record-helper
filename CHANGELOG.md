# Changelog

本项目使用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循语义化版本。

## [Unreleased]

## [2.15.0] - 2026-10-28

### Added

- UI CDN 回退：jsDelivr 主源 → fastly → raw，每源都做 SHA-256 校验。
- Playwright 端到端测试：任意网站仅菜单、WeGame 懒加载、助手面板、CDN 回退、篡改拒绝。
- 错误提示支持复制诊断信息（版本 / UI 哈希 / URL / UA / 错误）。
- 对局详情 60 秒内存缓存 + 同 key 请求合并。
- 浮层焦点移入/焦点陷阱/关闭后焦点恢复，加载区域 aria-live。
- Dependabot、Actions SHA 固定、`.gitattributes`、UI 体积预算。

### Changed

- CI 增加 Node 22.22.2 与 Node 24 矩阵；Node 24 跑 Playwright 与覆盖率。
## [2.14.1] - 2026-10-28

### Fixed

- ARAMGG 榜单缓存写入 localStorage 失败时给出明确警告，并继续使用内存缓存。
- 缓存存储封装返回写入结果，便于调用方处理配额/隐私模式失败。
## [2.14.0] - 2026-10-28

### Added

- 轻量脚本壳 + `@resource` 按需加载 UI（`lol-tft.user.js` 约 25KB，`lol-tft-ui.js` 约 305KB）。
- UI 资源固定到版本 tag，并在执行前做 SHA-256 完整性校验。
- ESLint、Vitest 覆盖率阈值、CI 产物漂移检查、tag 发布工作流。
- 助手面板加载失败时的可见重试入口。

### Changed

- 项目更名为「LOL 战绩助手」，仓库迁移至 `entyr233/lol-record-helper`。
- README 重构：安装使用前置、banner、徽章、界面预览。
- 脚本菜单在任意网站可见，非 WeGame 页面只注册菜单、不注入 UI。

## [2.13.1] - 2026-10-28

### Changed

- 项目更名为「LOL 战绩助手」，GitHub 仓库迁移到 `lol-record-helper`。

## [2.13.0] - 2026-10-28

### Changed

- UI bundle 拆分为 `@resource` 按需加载，脚本壳保持轻量。

## [2.12.9] - 2026-10-28

### Added

- 脚本菜单在任意网站可见；非 WeGame 站点不注入悬浮 UI。

## [2.12.8] - 2026-10-28

### Changed

- 助手面板入口并排，ScriptCat 菜单统一为「自建面板 / 官方助手」。

## [2.12.7] - 2026-10-28

### Fixed

- 修复助手面板被官方页面容器覆盖，导致无法展开/拖动。

## [2.12.6] - 2026-10-28

### Added

- 助手面板支持收起紧凑、展开变大、拖动并记忆位置。
