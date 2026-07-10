# 参与贡献

感谢你改进卡藏提示词画布。提交前请先搜索现有 Issue，避免重复工作。

## 开发环境

- Node.js 20+
- npm（主应用）
- 可选：Bun（文档站与 Docker 构建）

```bash
git clone https://github.com/study666-creme/infinite-canvas-jay.git
cd infinite-canvas-jay/web
npm ci
npm run dev
```

## 提交原则

- 一个 Pull Request 聚焦一个可说明的问题。
- 沿用现有 Next.js、React、TypeScript、Ant Design、Tailwind 和 Zustand 结构。
- 不提交 `.env*`、API Key、Agent token、Cookie、用户画布、私人资料或大型生成媒体。
- 依赖第三方代码或资产时说明来源与许可证。
- 修改持久化结构、Agent 工具或跨模块契约时补充相应测试和文档。
- UI 改动需同时检查桌面与手机，不得出现横向溢出、文本遮挡或不可见按钮。

## 验证

```bash
cd web
npx tsc --noEmit
npm run build

cd ../canvas-agent
npm run build

cd ../docs
bun install --frozen-lockfile
bun run build
```

只改文档时至少运行：

```bash
node scripts/check-doc-links.mjs
cd docs && bun run build
```

## Pull Request

请说明：

- 问题与解决方式。
- 行为变化和兼容边界。
- 执行过的验证。
- UI 变化对应的桌面与手机截图。
- 新增依赖或第三方资产的许可证。

提交贡献即表示你有权提交这些内容，并同意其按仓库的 [AGPL-3.0](LICENSE) 许可证分发。安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。
