# 画布 Agent 架构

画布 Agent 的目标是理解当前画布、调用画布工具并持续维护创作上下文。Codex 只是可选的大脑之一，不是画布产品中的独立功能入口。

## 当前两种模式

### 网站 Agent

浏览器把当前画布快照、最近对话和用户要求发送给已配置的文本模型。模型通过工具循环调用节点、连线、生成和资产能力，工具结果直接回写当前画布。

这条链路无需 Codex，适合线上画布的默认体验。

### Local Agent / Codex

```text
画布 Agent 面板
  -> canvas-agent HTTP + SSE
  -> Codex app-server
  -> Infinite Canvas MCP
  -> CanvasSession
  -> 当前浏览器画布
```

`CanvasLocalAgentPanel` 会持续上报当前画布快照，并在发送任务时传入 `canvasAgent: true`。`canvas-agent` 只有在这个标记存在时才注入画布提示词和 Infinite Canvas MCP 配置。MCP 工具调用经过 `CanvasSession` 回到当前网页执行，因此这条链路已经具备真实画布联动，不是普通 Codex 聊天。

当前实现尚未完成系统化端到端验证，不能仅凭“连接成功”判断可用。至少需要验证：读取画布、新建文本节点、更新节点、连接节点、触发生成、工具确认、撤销、断线恢复和会话恢复。

## 与 Codex Remote 的边界

[Codex Remote](https://github.com/study666-creme/codex-remote) 服务于“人从手机直接控制项目里的 Codex”，它的会话绑定本地代码工作区，不包含画布状态或画布工具。

画布仓库不再包含 Codex Remote 页面、配额、解锁和公网部署说明。两边只共享通用的 Codex app-server 客户端能力，画布提示词、Canvas MCP、CanvasSession 和工具执行始终由本仓库维护。

## 同步策略

不要再整文件复制两边的 Bridge。推荐下一步从 Codex Remote 抽出无 HTTP、无 UI、无画布依赖的 `codex-app-server-client` 包：

1. Codex Remote 维护 app-server 初始化、thread/turn、事件归一化和附件协议。
2. 画布通过版本化依赖升级该包。
3. 画布 Adapter 注入 `mcp_servers.infinite-canvas`、画布提示词和服务端请求处理器。
4. 每次升级用上述画布工具清单做端到端回归。

在公共 client 包完成前，只同步经过审查的协议修复，并把 `@openai/codex` 固定在双方验证过的相同版本；不要用脚本覆盖 `canvas-agent/src/agents.ts`，否则会丢失画布 MCP 差异。
