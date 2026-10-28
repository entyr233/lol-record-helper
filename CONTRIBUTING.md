# Contributing

感谢参与。这个项目是浏览器用户脚本 + Vue 3 UI，改动前请先看 `readme.md` 的「开发与构建」。

## 本地开发

```bash
npm install
npm run dev          # 本地演示站（mock 数据）
npm run check        # lint + typecheck
npm run test:related -- src/...   # 日常只跑相关单测
npm test             # 全量单测（发布前）
npm run test:coverage
npm run build:all
npm run test:e2e:build   # 构建 Chromium E2E；PW_EDGE=1 时使用系统 Edge
npm run test:e2e:all     # 三浏览器，发布前
```

Node 要求：`^22.22.2 || >=24.15.0`。

## 提交前检查

- [ ] `npm run check`
- [ ] 按改动范围跑 `npm run test:related -- <文件>`；大改动再跑 `npm test`
- [ ] 修改 UI/TypeScript 脚本壳或 manifest 时：`npm run build:all`，并提交 `userscript/lol-tft.user.js`；UI 由 Release workflow 上传，不写回仓库
- [ ] 不要把 WeGame cookie、ARAMGG Key、HAR、`.env` 提交进仓库

## Commit 约定

`<type>(vX.Y.Z): 描述`，type 使用 `feat` / `fix` / `docs` / `ci` / `chore`。

## 发布

1. 更新 `package.json` version 与 `CHANGELOG.md`
2. `npm run build:all`
3. 提交到开发分支，确认 CI 通过，再打 tag `vX.Y.Z`
4. Release workflow 会复用该提交的 CI 结果，并在发布前跑一次三浏览器 E2E
测试投入策略见 docs/test-audit.md。
