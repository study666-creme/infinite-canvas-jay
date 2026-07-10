# 部署指南

主应用是 `web/` 下的 Next.js 项目。Vercel 是当前推荐部署方式；Docker 和 Render 适合自托管。

## 部署前确认

- 用户区默认连接卡藏登录服务，服务端地址由 `PROMPT_HUB_API_BASE` 控制。
- 画布、素材和生成记录主要保存在访问者浏览器，不会因为部署到服务器就自动云同步。
- 自定义模型请求通常由浏览器直连用户配置的服务，部署端不应内置公共 API Key。
- `/api/prompt-hub-media`、`/api/qianfan-proxy` 和 `/webdav-proxy` 会校验卡藏 Bearer token。
- 本机 `canvas-agent` 不能部署到 Vercel。它需要在用户电脑上访问 Codex、工作区和当前浏览器画布。

## Vercel

1. 在 Vercel 导入 `study666-creme/infinite-canvas-jay` 或自己的 fork。
2. 将 **Root Directory** 设置为 `web`。
3. Framework Preset 选择 **Next.js**，Node.js 使用 20 或更高版本。
4. 部署后访问 `/canvas`，用卡藏账号完成登录。

一键导入：

[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fstudy666-creme%2Finfinite-canvas-jay&project-name=prompt-canvas&root-directory=web)

当前公开体验地址：

```text
https://infinite-canvas-jay.vercel.app/canvas
```

不要在仓库根目录添加带 `rootDirectory` 的 `vercel.json`；Root Directory 应在 Vercel 项目设置中配置。

### 环境变量

| 变量 | 是否必需 | 作用 |
| --- | --- | --- |
| `PROMPT_HUB_API_BASE` | 否 | 卡藏登录与 token 校验地址，默认 `https://api.prompt-hubs.com` |
| `NEW_API_BASE_URL` | 否 | 服务端读取模型价格的 New API 地址，默认 `https://newapi.prompt-hubs.com` |
| `NEW_API_API_KEY` | 否 | New API 管理接口鉴权；未配置时价格接口使用公开可读能力或回退本地价格 |

不要把 `NEW_API_API_KEY`、模型密钥或 Agent token 写入 `NEXT_PUBLIC_*` 变量。

## Docker

从当前源码构建：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

发布 Git tag 后，GitHub Actions 会构建 `ghcr.io/study666-creme/infinite-canvas-jay`。使用已发布镜像：

```bash
docker compose up -d
```

默认访问 [http://localhost:3000](http://localhost:3000)。容器只运行 Web 应用；用户创作数据仍在浏览器中。

## Render

仓库根目录的 `render.yaml` 使用 Docker runtime。连接仓库创建 Blueprint/Web Service 后即可构建。免费实例可能休眠，适合作为演示环境，不适合作为需要稳定代理和长任务的生产后端。

## 本地 Agent

本机画布 Agent 与 Web 部署分开启动：

```bash
cd canvas-agent
npm install
npm run build
npm start
```

默认地址为 `http://127.0.0.1:17371`。首次启动生成的配置保存在 `~/.infinite-canvas/canvas-agent.json`，因此 URL 和 token 不会因为普通重启自动变化。固定公网 URL 或 token 时使用：

```text
CANVAS_AGENT_HOST=0.0.0.0
CANVAS_AGENT_PUBLIC_URL=https://agent.example.com
CANVAS_AGENT_TOKEN=<long-random-secret>
CANVAS_AGENT_WORKSPACE=/absolute/path/to/workspace
```

公网暴露 Agent 前必须增加 HTTPS、访问控制和严格来源限制。Agent token 等同本机代码执行入口，不应直接放进公开网页环境变量。

## 视频网关

Seedance、即梦或其他返回远程媒体 URL 的兼容服务，通常还需要网关提供：

```http
GET /v1/media/fetch?url=<encoded-url>
Authorization: Bearer <api-key>
```

响应必须是真实视频二进制及正确 `Content-Type`，不能用 JSON 错误体冒充视频。详细排查见 [视频生成与播放](docs/content/docs/overview/video-playback.mdx)。

## 发布检查

- [ ] `/`、`/canvas`、`/image`、`/video` 和 `/assets` 可打开。
- [ ] 未登录时显示卡藏登录页，登录后只读取当前账号对应的浏览器分区。
- [ ] 自定义模型配置不会出现在服务端日志、仓库或公开环境变量中。
- [ ] 图片、视频和音频生成能写入节点并在刷新后恢复。
- [ ] WebDAV 测试与同步失败时有明确提示。
- [ ] 本机 Agent 只连接预期工作区，token 未泄露。
- [ ] 部署版本对应的源码、[LICENSE](LICENSE) 与上游说明可访问。
