# 画布 Agent 架构

画布 Agent 的职责是读取当前画布、理解用户本轮指令并调用真实画布工具。Codex、Claude、网页模型和无界面 API 是可替换执行后端，不是画布数据层。

公开运行时只包含通用工具协议，不内置短剧、导演、故事结构或其他行业工作流，也不分发仓库维护者的私有知识。使用者可以在自己的部署中增加提示、知识检索或项目模板；本机私有文件存在或环境变量指向这些文件，才视为显式启用。

## 执行后端

### 网页 Agent

浏览器把当前画布快照、最近对话和用户任务发送给已配置的文本模型。模型通过工具循环读取状态、创建或更新节点、连接流程、调用生成并把结果写回当前画布。

该模式不依赖本机 Codex，适合作为线上默认体验。

### 本机 Codex / Claude

```text
画布 Local Agent 面板
  -> canvas-agent HTTP + SSE
  -> Codex app-server 或 Claude CLI
  -> Infinite Canvas MCP
  -> CanvasSession
  -> 当前浏览器画布
```

前端持续上报当前画布快照。发送任务时，`canvas-agent` 只对明确标记为画布任务的请求注入画布提示词和 MCP；普通代码工作区对话不会自动获得画布上下文。

Codex 链路已经支持按画布创建或恢复对话、绑定独立工作目录、传递图片附件，并在用户确认工具调用后把真实结果写回当前画布。这是现有能力，不是后续设想；仍需继续验证断线、长任务和真实设备上的恢复体验。

`omnidirector-engine` 可作为无界面 API、扩展契约和开发验收层接入，但不再作为与画布并列的第二个用户工作台扩建。

### 可选私有上下文

`canvas-agent` 可以在本机画布任务中加载两类 Git 忽略文件：私有任务说明 `web/knowledge/creative/agent-context.md`，以及用户确认后的知识报告 `web/knowledge/creative/creative-knowledge-report.json`。任务说明在 frontmatter 中用 `triggers` 与可选 `excludes` 正则声明作用域，并可用分号分隔的 `budget-groups` 正则按本轮涉及领域动态限制卡数；报告按卡片自身字段检索。只有作用域命中或召回到正式卡时才注入，每轮从 `verified` 卡中召回 `0-5` 张。公开代码不硬编码行业触发词，`auto_verified` 与普通候选都不会进入运行时。

受 token 保护的 `POST /agent/private-context/preview` 可返回本轮命中卡、命中词、来源标题和可信度，用于排查召回。`GET /config` 只披露是否启用及来源/正式卡数量，不返回私有文件路径或正文。

## 状态与扩展边界

Agent 每轮先读取真实画布，只更新用户要求的内容。结构化项目状态可用于记录阶段、约束、已确认结果和待办，但它是可选的协作数据，不是一条强制创作流水线。

普通节点操作、生成调用和状态维护只依赖画布工具。3D 导演台的载入、摆位、切换机位和截图需要当前浏览器中的 Three.js 实例，因此必须通过真实画布运行态完成。

关键状态包括：

- 当前阶段与完成度。
- 用户已确认的项目常量与约束。
- 待确认问题与下一缺口。
- 相关节点的版本、状态和用户确认状态。

## MCP 工具范围

- 状态：读取画布、选区和快照。
- 节点：创建、更新、删除、选择和批量布局。
- 连线：连接节点、删除连线。
- 生成：文本、图片、视频、音频和生成流程。
- 项目状态：按需创建或更新结构化项目元数据。
- 3D 导演台：载入最多 60 个镜头的完整分镜包，按每批最多 10 个镜头切换、预演并截取单镜头或批量截图。

3D 导演台截图固定输出 `1280x720`，并作为带 `metadata.directorStage` 的标准图片节点写回画布。角色、道具与相机的手动调整会同步回当前分镜包。

## 配置与工作区

默认配置文件：

```text
~/.infinite-canvas/canvas-agent.json
```

每个画布 `canvasId` 对应一个本机工作区配置。`canvasId` 只用于隔离画布会话与工作区映射，不代表画布数据已上传到 Agent。

常用环境变量见 [.env.example](.env.example)：

- `CANVAS_AGENT_HOST`
- `CANVAS_AGENT_PUBLIC_URL`
- `CANVAS_AGENT_TOKEN`
- `CANVAS_AGENT_WORKSPACE`
- `CANVAS_AGENT_REPO_ROOTS`
- `CANVAS_AGENT_PRIVATE_CONTEXT`：设为 `off` 可关闭本机自动发现。
- `CANVAS_AGENT_PRIVATE_INSTRUCTIONS`：可选私有任务说明路径。
- `CANVAS_AGENT_PRIVATE_KNOWLEDGE_REPORT`：可选知识报告路径。

## 安全边界

- 默认只监听 `127.0.0.1`。
- token 可以调用本机模型、工作区和画布工具，必须视为密钥。
- 不要把用户主目录、磁盘根目录或无关仓库设为默认工作区。
- 公网反向代理必须使用 HTTPS、访问控制、来源白名单和固定强随机 token。
- 工具确认开关应保留，尤其是生成、文件写入和批量删除操作。
- 私有知识包、来源材料、审核报告和个人预设必须留在 Git 忽略目录；公开构建不包含它们。本机 Agent 只有在这些本地文件实际存在或环境变量显式指定时才加载。

## 当前验证

本机运行时、网页工具路由和 3D 导演台均已完成构建验证。私有上下文另有回归覆盖：只召回 `verified` 卡、保留可解释来源、触发范围不匹配时不注入。3D 导演台额外通过了 WebGL 非空像素、双镜头载入、手动调整持久化、两张 `1280x720` 截图入画布以及 `390px` 手机布局回归。

仍需在真实账号与真实模型上持续验证断线恢复、长任务、生成取消、工具确认和多工作区会话恢复。对应项目记录在 [待验证清单](docs/content/docs/progress/pending-test.mdx)。

## 与手机 Codex 的边界

[Codex Remote](https://github.com/study666-creme/codex-remote) 是独立项目，用于从手机继续本机 Codex 代码任务。它不需要依赖画布。画布只有在需要让 Codex 直接读取和操作节点时才使用本仓库的 Canvas MCP 与 `canvas-agent`。
