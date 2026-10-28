# Security Policy

## Supported versions

只维护最新 release（GitHub Tags / Releases）中的版本。旧版本请先升级到最新 tag。

## 报告安全问题

请优先使用 GitHub 的 **Private vulnerability reporting**：

https://github.com/entyr233/lol-record-helper/security/advisories/new

报告中请包含：

- 受影响的版本（`@version`）
- 浏览器与脚本管理器（ScriptCat / Tampermonkey）
- 复现步骤
- 影响范围（例如能否读取 WeGame 会话、能否执行任意脚本）

**请不要在报告里附带**：WeGame cookie、`p_uin`、ARAMGG API Key、完整 HAR 或其他登录凭证。可以提供脱敏后的错误码、控制台片段或 `复制诊断信息` 的结果（诊断信息不含 cookie）。

## 分发安全

- UI 资源固定到版本 tag，并在执行前做 SHA-256 校验；
- 发布 tag 受 ruleset 保护，禁止删除/移动；
- GitHub Actions 固定到 commit SHA；
- 脚本本身仍通过 `@updateURL` 从 master 更新，请仅从本仓库 raw/Release 安装。
