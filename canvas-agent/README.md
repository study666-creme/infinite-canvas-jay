# Infinite Canvas Agent

本目录是卡藏提示词画布的本机 Agent 与 MCP 运行时，负责在网页画布、Codex app-server / Claude CLI 和 Infinite Canvas MCP 工具之间传递状态、工具调用与结果。

它不是手机 Codex Remote 服务。手机远程控制项目代码的独立项目位于 [study666-creme/codex-remote](https://github.com/study666-creme/codex-remote)。

## 本地开发

```bash
cd canvas-agent
npm install
npm run dev
```

默认监听 `http://127.0.0.1:17371`。首次启动会把 URL、token 和画布工作区映射写入 `~/.infinite-canvas/canvas-agent.json`，普通重启会复用该配置。

## 画布联动

1. 网页通过 `/canvas/state` 上报当前画布快照。
2. Local Agent 面板通过 `/agent/codex/turn` 或 `/agent/claude/turn` 发送任务。
3. Codex app-server 或 Claude 调用 `infinite-canvas` MCP。
4. `CanvasSession` 把工具请求发送到当前浏览器画布。
5. 网页执行后通过 `/canvas/result` 返回真实结果。

只有画布任务才注入画布提示词和 MCP。普通代码对话不应自动获得画布状态。

## 主要工具

- 读取画布、选区与快照。
- 创建/更新/删除节点和连线。
- 生成文本、图片、视频、音频与批量流程。
- 更新结构化项目黑板。
- 载入 3D 分镜包、切换镜头并把导演台截图写回画布。

## MCP 注册

本仓库开发时优先使用本地构建：

```bash
npm run build
codex mcp add infinite-canvas -- node /absolute/path/to/infinite-canvas/canvas-agent/dist/index.js mcp
```

已发布包目前仍使用兼容名称 `codex-remote-bridge`：

```bash
npx -y codex-remote-bridge mcp
```

## 环境变量

```text
PORT=17371
CANVAS_AGENT_HOST=127.0.0.1
CANVAS_AGENT_PUBLIC_URL=
CANVAS_AGENT_TOKEN=
CANVAS_AGENT_WORKSPACE=
CANVAS_AGENT_REPO_ROOTS=
```

运行时不会自动读取仓库根目录 `.env`，请通过 shell、进程管理器或 Node `--env-file` 注入。

## 安全

- 默认保持 `127.0.0.1`，不直接暴露公网。
- token 可以调用本机模型、文件工作区和画布工具，不应写入公开前端配置。
- 不要把用户主目录、磁盘根目录或无关仓库设为默认工作区。
- 公网使用必须增加 HTTPS、访问控制、来源白名单和固定强随机 token。

完整架构和验证边界见 [../CANVAS-AGENT.md](../CANVAS-AGENT.md)。
