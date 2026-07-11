# AI / Maintainer Handoff

本文件给后续维护者和 AI 使用。开始修改画布、Prompt Hub、媒体、Agent 或创作资料库前，先阅读根目录 `AGENTS.md`，再核对当前工作区状态。

## 仓库边界

- `web/`：Next.js 主应用。
- `canvas-agent/`：本机 HTTP/SSE、Codex/Claude 适配与 Canvas MCP。
- `plugins/infinite-canvas/`：Codex App 插件。
- `web/knowledge/creative/`：本地创作资料收件箱与审核配置。
- `docs/`：Fumadocs 文档站。
- Prompt Hub、New API、Codex Remote 和视频网关是独立服务或仓库，不要把它们的无关改动混入本仓库。

工作区可能已有用户改动。先运行 `git status --short`，不要回滚或覆盖来源不明的修改。

## 登录与本地数据

- 用户区由 `PromptHubAuthGate` 保护。
- 登录负责身份、卡藏服务权限和浏览器账号分区，不等于云同步。
- 画布 key 由 `infinite-canvas:canvas_store:<user>` 组成；素材使用同类账号分区。
- 图片、视频和音频存为 Blob，节点 JSON 只保留 `storageKey` 与元数据。
- 写媒体必须使用 `uploadImage` / `uploadMediaFile`，不要长期持久化大 base64。
- WebDAV 由用户主动同步，修改数据结构时需要考虑版本与兼容。

## Prompt Hub 生成

- 连接图片生成时，上游连接参考图优先；节点自身图片只在没有连接参考图时回退使用。
- 提交卡藏生成前，参考图副本会压缩并通过媒体上传转换为 `storage://card-images/...` 引用；原画布图片不能被替换。
- Prompt Hub 错误可能是嵌套 `{ error: { message, code, details } }`，不能回退成 `[object Object]`。
- 成功结果通过共享日志写入 `/image` 生成记录。
- 图片与视频历史首屏读取轻量摘要，打开详情时再恢复完整媒体。

## 统一模型目录

- New API 公开目录为 `https://newapi.prompt-hubs.com/api/model-catalog`，画布代理为 `/api/model-catalog`；目录将 New API 实时价格与人工审核的模态、端点和参数白名单合并。
- `/api/model-pricing` 只能从统一目录派生价格，不得再根据模型名、tags 或 `supported_endpoint_types` 猜模态，也不得把小数积分向上取整。
- 卡藏 `/api/v1/models` 输出所有已审核的文本、图片和视频模型；`/api/v1/generate/models` 保留为图片兼容接口。响应包含公开别名、`parameters`、目录版本和由人民币价格乘以 100 得到的积分价格，不得把上游模型 ID 或服务端 New API Key 下发浏览器。
- 画布在登录、打开模型选择器、页面重新获得焦点时刷新目录，登录状态下还会每五分钟后台刷新。并发刷新由 store 合并；目录短暂不可用时可以保留最后有效列表。
- 每个付费图片、视频或文本请求必须通过 `?refresh=1` 强制读取当前价格，刷新失败时返回 503，不得按旧价继续扣费或调用。固定按次、按秒和按实际输入/输出 Token 三种计费方式都以服务端结算为准。
- 图片和视频设置必须按所选模型的参数枚举展示；切换模型时清理不合法的比例、分辨率和媒体引用，提交前卡藏服务端还会再次校验。网页 Agent 的卡藏文本模型使用标准工具调用与工具结果续轮，不经过浏览器本地 API Key。
- 默认图片、视频和文本模型分别为 `ph-hub:image2`、`ph-hub:sd2.0`、`ph-hub:creative-5-5`，普通界面显示为“全能模型2 · 1K”、`sd2.0` 和“全能模型5.5”。昂贵香蕉模型不默认勾选，新模型只进入设置中的可选池，不得自动改变用户当前列表。
- 选择器必须按模态过滤。图片张数、比例、分辨率和参考图上限均从目录参数派生；目录声明固定值时 UI 不得继续展示无效选项。
- 真实模型映射、请求阶段和服务日志仅供管理员“画布调用”页面排障；普通用户界面和生成状态只显示公开名称、能力、参数与价格，不暴露服务链路术语。
- Prompt Hub 的独立 MJ 能力不进入画布模型目录。未知模型只进入 `unclassified_models`；只有补齐并审核模态、端点、参数和价格后才可进入画布可选池，禁止根据名称猜测能力。

## 生成取消

- 同一批生成的多个节点可能共享 AbortController。
- 删除节点、清空画布或取消批次时，必须终止所有相关请求。
- 每个异步阶段写回节点前都要确认请求仍有效，避免删除的加载/错误节点被晚到 Promise 重新创建。

## Agent 与项目状态

- 公开网页 Agent 与 `canvas-agent` 只提供通用画布工具协议，不得内置行业知识、创作流派、短剧流程、个人按钮或其他维护者预设。
- 网页模型、本机 Codex、Claude 和无界面 API 是可替换执行后端，必须共享画布节点、可选项目状态与工具确认语义。
- 网页 Agent 与本机 Agent 使用同一组画布工具语义。
- `canvas-agent` 已支持按画布创建/恢复 Codex 对话、绑定工作目录、传入图片附件和确认后回写工具结果；不得再把“画布接 Codex”列为未实现功能。
- `canvas-agent/src/private-context.ts` 提供可选本机扩展：私有说明通过 frontmatter 的 `triggers`/`excludes` 声明作用域，报告依靠卡片自身字段做通用检索且只召回 `verified` 卡。行业触发词只能留在 Git 忽略的私有说明中，不能写回公开代码。`POST /agent/private-context/preview` 用于受保护的命中审计；普通 Codex 代码对话和无关画布请求不得注入。
- `CanvasProject.creativeProjectState` v2 是项目级主记录；画布“项目黑板”只是它的可视化镜像。旧项目仅在顶层状态缺失时从黑板迁移一次，稳态不得让旧黑板反向覆盖项目状态。
- 状态按产物 ID、节点 ID、版本、`status` 和 `userConfirmed` 记录。`approved` 不等于用户确认；内容变化必须递增版本并重新进入审核。
- 状态只服务用户当前任务，不得据此强制推导固定阶段顺序。
- 所有创建、改写、删除、连线/引用变化和付费生成都必须遵循界面确认规则。
- 页面刷新会让内存中的工具执行上下文失效，因此旧待确认动作会明确过期，不能留下永久 `awaiting_user_confirmation`。
- 用户确认的项目事实和约束始终高于可选私有知识与模型推断。
- 普通 Codex 代码对话不应自动注入画布提示词或 Canvas MCP。

## 3D 导演台

- 这是当前唯一必须依赖浏览器画布运行态的 Agent 能力；载入、摆位、切镜和截图必须操作真实 Three.js 实例。故事、剧本和分镜推理仍通过项目状态与通用工具保持可测试边界。
- 核心组件：`web/src/app/(user)/canvas/components/canvas-director-stage.tsx`。
- 协议：`web/src/app/(user)/canvas/utils/director-stage-types.ts`。
- Agent 工具：`canvas_director_get_state/load_packet/load_shot/capture_shot/capture_all`。
- 一个分镜包最多 60 个镜头；预演和截图每批最多 10 个，单集总镜头数不受 10 个限制。超过 60 个必须明确报错并拆包，不能静默截断。
- “本批截图”只回写当前批次，截图固定 `1280x720`，并显式标为待用户确认的 `preview_grid`，不能按标题误识别为文字分镜。
- 手动角色/道具与 Orbit 相机调整必须同步回分镜包，切镜头或批量截图不能丢失。
- 批量截图期间锁定导入、编辑和关闭，避免 WebGL runtime 在捕获中途被销毁。
- 当前是空间预演，不要在文档中声称已支持真实角色、骨骼动画或自动 3D 重建。

## 创作资料库

- 这是可选的本地私有工具，不是公开 Agent 的内置知识。生成索引、报告、来源材料与个人预设均被 Git 忽略；公开构建不附带这些文件，本机 `canvas-agent` 仅在本地文件存在或环境变量指定时按需加载。
- SQLite 位于忽略目录 `web/data/`，只用于摄取缓存和审核状态。
- 方法资料、完整案例和视频字幕使用不同收件箱。
- 私有扩展中的正式卡需要通过二次审核和用户确认；`auto_verified` 仍属待确认，只有 `verified` 能进入正式检索。
- 完整作品只建立结构索引，不复制完整原文进数据库或生成包。
- 视频入口只负责把人工字幕、自动字幕或语音转写安全生成到 `raw/`，之后才进入与书籍相同的中文蒸馏、审核、去重和分类流程。
- 远程字幕以 BVID 作为恢复主键，先写 `.part` 并通过 SRT 校验后原子发布；合集展开条目不足、认证超时和条目失败必须显式报告。
- 不要声称公开 Agent 已拥有完整书籍、完整视频字幕、维护者知识包或实时趋势数据。

## 验证

```bash
cd web
npx tsc --noEmit
npm run build

cd ../canvas-agent
npm run build

cd ../docs
bun run types:check
bun run build
```

UI 修改还需检查桌面与手机截图、文本溢出、按钮重叠和 WebGL/canvas 非空像素。功能状态同步到：

- `docs/content/docs/overview/features.mdx`
- `docs/content/docs/progress/pending-test.mdx`
- `docs/content/docs/progress/todo.mdx`
