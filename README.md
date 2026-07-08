# 卡藏提示词画布

卡藏提示词画布是面向 AI 图像与视频创作的节点式工作台。它把提示词、参考图、视频节点、生成记录、资产沉淀和画布 Agent 放在同一个空间里，适合把一次次生成经验整理成可复用的创作流程。

## 当前定位

- 「卡藏画布」负责承载创作流程、节点关系、生成结果和 Agent 操作。
- 「生图工作台 / 视频创作台」负责快速发起单次生成，并把有效结果沉淀回资产或画布。
- 「我的资产」负责保存图片、视频、提示词与可复用素材。
- 本地数据默认保存在浏览器侧；线上版本需要先登录卡藏账号，并按卡藏用户分桶保存画布与资产。

## 合规说明

本项目保留 AGPL-3.0 许可证，详见 [LICENSE](LICENSE)。产品 UI 已使用「卡藏」品牌，但仓库层面的开源义务不能删除。线上部署时，请确保对应源码可访问。

更完整的说明见 [OPEN-SOURCE.md](OPEN-SOURCE.md)。

## 快速开始

```bash
git clone https://github.com/study666-creme/infinite-canvas-jay.git
cd infinite-canvas-jay/web
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:3000
```

首次打开后，进入右上角配置，填写自己的 OpenAI 兼容 `Base URL` 和 `API Key`。

## 构建

```bash
cd web
npm run build
```

## 登录与数据

线上画布沿用卡片库的卡藏账号登录。未登录用户不能进入画布、资产、生成工作台或移动 Codex 控制页。

- 画布项目、资产库、AI 渠道配置仍主要保存在当前浏览器本地；画布与资产会按卡藏用户 ID 分桶，避免同一设备换账号后混用。
- 卡藏生图、卡片库读取、Prompt Hub 媒体代理会使用当前登录 token；未登录用户不能无成本调用这些线上代理接口。
- 远程 Codex 不会运行在 Vercel 上。要让手机远程操作项目，需要把你自己的 `canvas-agent` 放在受保护的 HTTPS 地址后面，并使用 Connect token 连接。

## 手机操作 Codex

打开 `/mobile-agent` 可以把手机变成 Codex 控制台，连接电脑上的 `canvas-agent` 后继续让 Codex 读项目、改代码、跑命令和部署。

局域网使用示例：

```powershell
$env:CANVAS_AGENT_HOST="0.0.0.0"
$env:CANVAS_AGENT_WORKSPACE="D:\canvas\infinite-canvas"
cd D:\canvas\infinite-canvas\canvas-agent
npm run dev
```

启动后终端会输出 `Connect token` 和可访问地址。同局域网可填入 `http://电脑局域网IP:17371`。远程使用线上画布时，请通过 Cloudflare Tunnel、Tailscale Funnel、ZeroTier 内网地址或 VPS 反代提供 **HTTPS Agent URL**，再在 `/mobile-agent` 填入该地址、token 和工作目录。

不要把 `17371` 端口无鉴权裸露到公网；任何拿到 Agent URL 和 token 的人都能让你的本机 Codex 执行项目任务。

## 部署

推荐部署到 Vercel，并把 Root Directory 设置为 `web`。更多部署、WebDAV、视频网关和故障排查内容见 [DEPLOY.md](DEPLOY.md)。

## 主要目录

```text
web/             前端应用
canvas-agent/    本地画布 Agent
plugins/         Codex 插件
docs/            文档站
scripts/         辅助脚本
```

## 开发备注

- 不要修改或删除 [LICENSE](LICENSE)。
- 不要把 AGPL 派生代码闭源上线。
- 产品 UI 的品牌、导航、首屏和交互可以继续按「卡藏」方向演进。
