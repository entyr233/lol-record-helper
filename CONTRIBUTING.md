# Contributing

感谢参与。这个项目是浏览器用户脚本 + Vue 3 UI，改动前请先看 `readme.md` 的「开发与构建」。

## 本地开发

```bash
npm install
npm run dev          # 本地演示站（mock 数据）
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e     # 构建并运行三浏览器 E2E；PW_EDGE=1 时 Chromium 项目使用系统 Edge
npm run build:all
```

Node 要求：`^22.22.2 || >=24.15.0`。

## 提交前检查

- `npm run lint`
- `npm run typecheck`
- `npm test`
- **修改了 UI/TypeScript 脚本壳或 manifest 时**：`npm run build:all`，并提交 `userscript/lol-tft.user.js`；UI 由 Release workflow 上传，不写回仓库
- 不要把 WeGame cookie、ARAMGG Key、HAR、`.env` 提交进仓库

## Commit 约定

`<type>(vX.Y.Z): 描述`，type 使用 `feat` / `fix` / `docs` / `ci` / `chore`。

## 发布

1. 更新 `package.json` version 与 `CHANGELOG.md`
2. `npm run build:all`
3. 提交到开发分支，确认 CI 通过，再打 tag `vX.Y.Z`
4. tag push 后，Release workflow 上传草稿资产并更新 UI 备用源，完成后公开 GitHub Release
5. 确认壳与 UI 资产可下载且 SHA-256 一致，再将该提交快进到 master

## 安全问题

见 [SECURITY.md](SECURITY.md)，不要用公开 Issue 报告凭证泄露类问题。
