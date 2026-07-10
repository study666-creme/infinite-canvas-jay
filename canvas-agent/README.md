# Infinite Canvas Agent

本目录是画布的本地 Agent 与 MCP 运行时。它负责在网页画布、Codex app-server 和 Infinite Canvas MCP 工具之间传递状态、工具调用与结果。

它不是手机 Codex Remote 服务。独立的手机控制台位于 [study666-creme/codex-remote](https://github.com/study666-creme/codex-remote)。

## 本地开发

```bash
cd canvas-agent
npm install
npm run dev
```

默认监听 `http://127.0.0.1:17371`。启动后会输出 Agent URL、Connect token 和默认工作区。画布的 Local Agent 面板会优先自动发现本机配置，也可以手动填写。

## 画布联动

Local Agent 面板会：

1. 通过 `/canvas/state` 持续上报当前画布快照。
2. 通过 `/agent/codex/turn` 发送带 `canvasAgent: true` 的任务。
3. 由 Codex app-server 加载 `infinite-canvas` MCP。
4. 通过 `/canvas/result` 把工具结果返回给 Codex。

只有 `canvasAgent: true` 才注入画布提示词和 MCP；普通 Codex 工作区会话不应走这条路径。

## MCP

构建后可把本地入口注册到 Codex：

```bash
npm run build
codex mcp add infinite-canvas -- node /absolute/path/to/infinite-canvas/canvas-agent/dist/index.js mcp
```

插件安装流程仍可使用已发布包名 `codex-remote-bridge` 作为兼容入口，但这个名称不再代表画布中的产品定位。后续应迁移到独立的 Infinite Canvas Agent 包名。

## 安全

- 默认只监听 `127.0.0.1`。
- Connect token 可以调用 Codex 和画布工具，不应提交到仓库或写入前端公开配置。
- Codex 会以 `workspace-write` 和无逐次批准模式运行；画布侧的工具确认开关仍应保留。
- 不要把用户主目录或磁盘根目录设置为默认工作区。

## 维护边界

通用 Codex app-server 协议应逐步抽到版本化 client 包；本目录只维护画布 MCP、CanvasSession、画布提示词和工具确认。完整设计见 [../CANVAS-AGENT.md](../CANVAS-AGENT.md)。
