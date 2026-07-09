# Codex Remote 开源与解耦说明

`/codex-remote` 和本地 `canvas-agent` 中的 Codex 控制能力，本质上是一个自托管的 **Codex Remote Console**：手机网页连接用户自己电脑上的本机 bridge，再由 bridge 调用本机 Codex app-server 继续项目任务。旧入口 `/mobile-agent` 只作为兼容路由保留。

它不应该强依赖 Infinite Canvas。画布可以保留入口，但独立开源时应拆成一个通用项目，并作为和画布同级的线上入口挂载。

当前线上入口约定为 `/codex-remote`。仓库访问者可以直接打开部署后的网页看到真实界面；实际控制 Codex 时仍需要在自己的电脑上运行 bridge 并填写 Agent URL + token。

## 开源成熟度

开源通常不是只有“开/不开”两档，可以按成熟度理解：

1. **源码公开**：能看到代码，但部署、配置、安全边界可能不完整。
2. **可自部署**：提供 README、环境变量、构建命令、反代说明，普通开发者能跑起来。
3. **生产可用**：安全模型、鉴权、日志、升级、故障排查、许可说明都写清楚。
4. **社区项目**：有独立包名、版本策略、贡献指南、Issue 模板、发布流程、插件/适配器生态。

当前目标应先做到第 2-3 档：可自部署，并把安全边界说清楚。

## workspaceId 是什么

`workspaceId` 是本机 Agent 的项目分桶 ID，不是画布 ID，也不是 Codex thread ID。

它用来保存和区分：

- 本机项目目录，也就是 Codex 的 `cwd`
- 当前默认 Codex thread
- 该项目下的会话列表和消息缓存
- Git repo 选择和 push 目标

独立版里，用户心智应该是：

- `Workspace`：本机项目目录，例如 `D:\project`
- `Workspace ID`：这个项目在 bridge 里的稳定 key，例如 `default`、`canvas`、`new-api`
- `Codex Thread ID`：具体要继续的 Codex 会话

当前代码仍兼容旧字段 `canvasId`，只是为了不破坏画布侧已有调用。独立开源版应把对外文案统一为 `workspaceId`。

## 为什么要和画布解耦

手机远程操作 Codex 和 Infinite Canvas 是两条能力：

- **Codex Remote Console**：人用手机远程控制电脑上的 Codex，继续读项目、改代码、跑命令、push。
- **Canvas Agent Brain**：画布内部的 Agent 需要一个更强的大脑时，可以通过 MCP/adapter 调用 Codex 来操作画布。

前者不需要画布；后者可以作为画布插件能力存在。不要把远程控制台做成必须依赖画布的功能，否则开源后不通用，也容易让用户误以为 `workspaceId` 是画布 ID。

## 建议拆分结构

独立仓库可以这样拆：

```text
codex-remote-console/
  apps/web/              移动端优先的 Web 控制台
  packages/bridge/       本机 bridge，连接 Codex app-server
  packages/shared/       协议类型、消息格式、工具函数
  docs/                  反代、安全、部署、故障排查
```

Infinite Canvas 侧只保留可选集成：

- 一个入口链接到 Codex Remote
- 一个 Canvas adapter，用于画布 Agent 需要 Codex 当大脑时传入画布 MCP 上下文
- 画布侧调用时显式传 `canvasAgent: true`，才注入画布操作提示

## Codex 相关风险边界

从 OpenAI Codex 的公开文档看，`codex app-server` 是面向 rich client 集成的能力，CLI 也提供 `app-server`、`remote-control`、`mcp-server` 等入口。做自托管控制台本身不是问题，但要守住这些边界：

- 不要提交或泄露 OpenAI/Codex 登录凭证、API key、Connect token。
- 不要提供“别人免费使用你的 Codex 额度”的公共服务。
- 不要转售、出租或共享账号访问能力。
- 不要绕过 Codex 的审批、限制、安全措施或用量限制。
- 不要反向工程私有服务；只使用官方 CLI、app-server、MCP 等公开能力。
- 如果以后做成 ChatGPT App / Connector / Action，还需要单独遵守 OpenAI App Developer Terms。

推荐开源定位：

> 自托管的 Codex Remote Console。用户在自己的电脑上运行 bridge，用自己的 Codex 环境和自己的 token 连接。项目不托管公共 Codex 后端，不代替用户提供 Codex 额度。

参考：

- https://developers.openai.com/codex/app-server
- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/concepts/customization
- https://openai.com/policies/row-terms-of-use/
- https://openai.com/policies/services-agreement/
- https://openai.com/policies/developer-apps-terms/
