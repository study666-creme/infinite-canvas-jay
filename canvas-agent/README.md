# Codex Remote Bridge

这个目录目前是历史兼容目录：早期它叫 `canvas-agent`，现在对外应称为 **Codex Remote Bridge**。它有两层用途：

- Codex Remote Bridge：让手机网页远程控制用户自己电脑上的 Codex，会话、引导、图片附件、git push 都走本机 bridge。
- Infinite Canvas Agent：当画布需要 Codex 作为 Agent 大脑时，显式注入画布 MCP 和画布操作提示。

独立开源时应优先把 Codex Remote Bridge 抽成通用能力，画布只作为可选 adapter。当前不要把画布 Agent / 画布 MCP 能力当成已发布的开源产品。本地开发时优先连接 `http://localhost:3000`，不需要先使用线上站点。

## 启动

```bash
npx -y codex-remote-bridge
```

本仓库开发时也可以直接运行：

```bash
cd canvas-agent
npm install
npm run build
node dist/index.js
```

启动后会输出本机地址和 token：

```txt
Local URL: http://127.0.0.1:17371
Connect token: xxxxxx
```

在画布右上角点击 `Agent`，或打开 `/codex-remote`，填入地址和 token 后连接。旧入口 `/mobile-agent` 保留兼容。

Codex app 插件会读取启动输出里的 Local URL 和 Connect token，并直接打开画布网页地址；Canvas Agent 不负责生成画布打开 URL。

Canvas Agent 默认只监听 `127.0.0.1`。网页第一次带正确 token 连接后，Canvas Agent 会记录该网页 Origin；之后其他 Origin 不能复用这个本地 Agent，除非用户清理 `~/.infinite-canvas/canvas-agent.json` 里的 `origins`。

远程使用时，请把本机 Agent 放在受保护的 HTTPS 地址后面（Tailscale/ZeroTier、Cloudflare Tunnel、VPS 反代均可），再在 `/codex-remote` 填入 HTTPS Agent URL 和 Connect token。不要把 `17371` 无鉴权裸露到公网；网页登录只保护网页入口，Agent URL + token 仍是执行本机 Codex 的关键凭证。

重启后想保持手机端配置不变，可以固定 token 和公开地址：

```bash
CANVAS_AGENT_HOST=0.0.0.0 \
CANVAS_AGENT_WORKSPACE=/path/to/project \
CANVAS_AGENT_TOKEN=replace-with-a-long-random-secret \
CANVAS_AGENT_PUBLIC_URL=https://agent.example.com \
npx -y codex-remote-bridge
```

`CANVAS_AGENT_TOKEN` 会覆盖并写入 `~/.infinite-canvas/canvas-agent.json`。`CANVAS_AGENT_PUBLIC_URL` 用于固定 `/config` 和启动输出里的 Agent URL；实际公网稳定性仍取决于 Cloudflare named tunnel、Tailscale Funnel 或自己的反代域名。

`workspaceId` 是本机 Agent 的工作区分桶 ID，用来保存 workspace、active Codex thread 和项目侧配置。它不是 Codex thread ID。旧字段 `canvasId` 仍被接受，只为兼容画布历史调用。

Codex Remote 的开源拆分和风险边界见仓库根目录 [CODEX-REMOTE-OPEN-SOURCE.md](../CODEX-REMOTE-OPEN-SOURCE.md)。

## 发布

`codex-remote-bridge` 使用自己的 `package.json` 版本号，不跟仓库根目录 `VERSION` 绑定。当前 npm 发布 workflow 只允许手动触发，不会在推送到 `main` 时自动发布。

真正准备公开 bridge 时，再在 GitHub 仓库 Secrets 中配置 `NPM_TOKEN` 并手动触发发布。

## Codex MCP

如果希望 Codex 终端能直接操作画布，需要先把 Canvas Agent 注册成 Codex MCP。

### Codex app 插件

仓库内提供了 Codex app 插件：`plugins/infinite-canvas`。在 Codex app 中添加本仓库的 marketplace 后，可以安装 `Infinite Canvas` 插件；插件会注册同一个 `infinite-canvas` MCP，并带上画布操作说明。

添加本地 marketplace 时建议使用仓库绝对路径，避免 Codex 从其他工作目录解析失败：

```bash
cd /path/to/infinite-canvas
codex plugin marketplace add "$(pwd)"
codex plugin add infinite-canvas@infinite-canvas-local
```

插件默认通过 npm 启动 MCP：

```bash
npx -y codex-remote-bridge mcp
```

使用时可以直接在 Codex 里说“打开 Infinite Canvas”，插件会优先启动本地画布和本地 Agent，读取 Local URL 和 Connect token，然后直接打开画布网页地址新建并连接画布。如果自动连接失败，再检查本地画布服务和 Canvas Agent 是否都已启动。

Canvas Agent 启动后，给 Codex 添加 MCP：

```bash
codex mcp add infinite-canvas -- npx -y codex-remote-bridge mcp
```

本仓库开发时可以改成，实际使用建议替换为本机绝对路径：

```bash
codex mcp add infinite-canvas -- node /path/to/infinite-canvas/canvas-agent/dist/index.js mcp
```

Canvas Agent 源码使用 TypeScript 编写，MCP 协议层使用官方 `@modelcontextprotocol/sdk`，工具入参使用 `zod` 描述。

如果希望终端里的 Codex 不被 MCP 审批卡住，可以在 `~/.codex/config.toml` 里给这个 MCP 设置自动放行：

```toml
[mcp_servers.infinite-canvas]
command = "npx"
args = ["-y", "codex-remote-bridge", "mcp"]
default_tools_approval_mode = "approve"
```

可用工具：

- `canvas_get_state`
- `canvas_get_selection`
- `canvas_export_snapshot`
- `canvas_apply_ops`
- `canvas_create_text_node`
- `canvas_create_image_prompt_flow`

`canvas_apply_ops` 示例：

```json
{
  "ops": [
    {
      "type": "add_node",
      "nodeType": "text",
      "title": "标题",
      "position": { "x": 0, "y": 0 },
      "metadata": { "content": "文本内容" }
    }
  ]
}
```

## 侧边栏 Codex

本地面板会把提示词发送给 Canvas Agent。Canvas Agent 使用官方 `@openai/codex` CLI 的 `codex app-server --stdio` 启动并复用同一个 Codex thread，启动时会注入 `infinite-canvas` MCP 配置并自动放行 MCP 审批，真正执行画布修改前仍由网页侧边栏二次确认。

侧边栏会展示 Codex 返回的 `thread.started`、`turn.started`、`item.*`、`turn.completed` 等结构化事件；收到 app-server 的 `item/agentMessage/delta` 时，Canvas Agent 会转成 `item.updated`，网页会用同一条消息做真实流式更新，并把工具细节收进运行日志。

侧边栏上传或粘贴的图片会先发到本机 Canvas Agent，再由 Canvas Agent 临时写入本机文件并作为 app-server `localImage` 输入传给 Codex；前端会提示附件体积，单次请求体限制为 30MB。

## Claude Code

Claude Code Adapter 代码暂时保留，但当前网页侧边栏只开放 Codex。后续开放 Claude 入口时，Canvas Agent 会调用本机 `claude -p --output-format stream-json` 并把流式 JSON 事件转发到侧边栏。

如果希望 Claude Code 也能操作画布，需要给 Claude Code 添加同一个 MCP。建议用 user scope，避免 Canvas Agent 从不同目录启动时找不到配置：

```bash
claude mcp add --scope user --transport stdio infinite-canvas -- npx -y codex-remote-bridge mcp
```

本仓库开发时可以改成：

```bash
claude mcp add --scope user --transport stdio infinite-canvas -- node /path/to/infinite-canvas/canvas-agent/dist/index.js mcp
```

Canvas Agent 调用 Claude Code 时会默认带上 `--allowedTools mcp__infinite-canvas__*`，画布写操作仍由网页侧边栏确认。
