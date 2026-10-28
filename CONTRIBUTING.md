# Contributing

感谢参与。这个项目是浏览器用户脚本 + Vue 3 UI，改动前请先看 `readme.md` 的「开发与构建」。

## 本地开发

```bash
npm install
npm run dev          # 本地演示站（mock 数据）
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e     # 需要先构建 userscript；本地可用 PW_EDGE=1 走系统 Edge
npm run build:all
```

Node 要求：`^22.22.2 || >=24.15.0`。

## 提交前检查

- `npm run lint`
- `npm run typecheck`
- `npm test`
- **修改了 UI/脚本模板时**：`npm run build:all`，并提交 `userscript/lol-tft.user.js`、`userscript/lol-tft-ui.js`
- 不要把 WeGame cookie、ARAMGG Key、HAR、`.env` 提交进仓库

## Commit 约定

`<type>(vX.Y.Z): 描述`，type 使用 `feat` / `fix` / `docs` / `ci` / `chore`。

## 发布

1. 更新 `package.json` version 与 `CHANGELOG.md`
2. `npm run build:all`
3. 提交并打 tag `vX.Y.Z`
4. tag push 后，Release workflow 会自动创建 GitHub Release

## 安全问题

见 [SECURITY.md](SECURITY.md)，不要用公开 Issue 报告凭证泄露类问题。
