# 卡藏提示词画布

卡藏提示词画布是面向 AI 图像与视频创作的节点式工作台。它把提示词、参考图、视频节点、生成记录、资产沉淀和画布 Agent 放在同一个空间里，适合把一次次生成经验整理成可复用的创作流程。

## 当前定位

- 「卡藏画布」负责承载创作流程、节点关系、生成结果和 Agent 操作。
- 「生图工作台 / 视频创作台」负责快速发起单次生成，并把有效结果沉淀回资产或画布。
- 「我的资产」负责保存图片、视频、提示词与可复用素材。
- 本地数据默认保存在浏览器侧，支持按项目导入导出。

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
