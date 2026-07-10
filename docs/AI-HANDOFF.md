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

## 生成取消

- 同一批生成的多个节点可能共享 AbortController。
- 删除节点、清空画布或取消批次时，必须终止所有相关请求。
- 每个异步阶段写回节点前都要确认请求仍有效，避免删除的加载/错误节点被晚到 Promise 重新创建。

## Agent 与项目黑板

- 网页 Agent 与本机 Agent 使用同一组画布工具语义。
- 创作任务先读取画布，再创建或更新唯一项目黑板。
- 用户确认常量和活动硬约束优先于知识卡、案例和模型推断。
- 不要假装所有专门 Agent 同时运行；只调用当前缺口需要的能力。
- 普通 Codex 代码对话不应自动注入画布提示词或 Canvas MCP。

## 3D 导演台

- 核心组件：`web/src/app/(user)/canvas/components/canvas-director-stage.tsx`。
- 协议：`web/src/app/(user)/canvas/utils/director-stage-types.ts`。
- Agent 工具：`canvas_director_get_state/load_packet/load_shot/capture_shot/capture_all`。
- 最多 10 个镜头，截图固定 `1280x720`。
- 手动角色/道具与 Orbit 相机调整必须同步回分镜包，切镜头或批量截图不能丢失。
- 当前是空间预演，不要在文档中声称已支持真实角色、骨骼动画或自动 3D 重建。

## 创作资料库

- SQLite 位于忽略目录 `web/data/`，只用于摄取缓存和审核状态。
- 方法资料、完整案例和视频字幕使用不同收件箱。
- 正式卡需要通过二次审核；`candidate` 不能进入前端正式检索。
- 完整作品只建立结构索引，不复制完整原文进数据库或生成包。
- 不要声称 Agent 已拥有完整书籍、完整视频字幕或实时趋势数据。

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
