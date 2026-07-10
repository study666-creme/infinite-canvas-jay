# 文档站

`docs/` 是卡藏提示词画布的 Fumadocs 文档站。正文位于 `content/docs/`，首页与导航位于 `src/`。

```bash
cd docs
bun install --frozen-lockfile
bun run dev
```

默认开发地址为 `http://localhost:3000`。与主应用同时运行时请指定其他端口：

```bash
bun run dev -- -p 3001
```

验证：

```bash
bun run types:check
bun run build
```

文档规则：

- README 只放项目介绍、核心能力、快速开始和文档入口。
- 已实现功能写入 `content/docs/overview/features.mdx`。
- 已实现但仍需真实环境或用户验收的事项写入 `content/docs/progress/pending-test.mdx`。
- 后续工作写入 `content/docs/progress/todo.mdx`。
- 不重复维护部署说明；详细部署以仓库根目录 `DEPLOY.md` 为准。
- 不提交账号、密钥、Cookie、用户画布、私人书籍、完整字幕或未授权媒体。
