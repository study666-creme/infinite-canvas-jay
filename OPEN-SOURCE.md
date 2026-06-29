# 开源与合规说明（Jay fork）

本仓库 **必须保持开源**，协议为 **AGPL-3.0**（见 [LICENSE](LICENSE)）。

## 上游

| 项 | 内容 |
|----|------|
| 原项目 | [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) |
| 协议 | **AGPL-3.0** |
| 本 fork | [study666-creme/infinite-canvas-jay](https://github.com/study666-creme/infinite-canvas-jay) |

## 你可以怎么做（合法）

| 做法 | 是否允许 |
|------|----------|
| GitHub **公开** fork，免费或收费提供在线画布 | ✅ 代码须 **继续 AGPL 公开**，保留原作者版权与页面标识 |
| 自用、学习、改 UI、接 Prompt Hub API | ✅ |
| 把 **Prompt Hub（卡藏）** 当闭源 SaaS 卖 | ✅ **Prompt Hub 是另一个项目**，不受本画布 AGPL 传染（仅通过 HTTP API 连接） |
| 把 **本画布** 改完闭源、不公开源码、当独立产品卖 | ❌ 需上游 [商业授权](docs/content/docs/business/business.mdx) |

## 你不能怎么做

- ❌ 删除 LICENSE / 原作者信息 / 前端来源标识后闭源运营  
- ❌ 把 AGPL 代码打包进闭源产品交付客户且不公开修改源码  

## 与 Prompt Hub 的关系

- **无限画布**：AGPL 开源，代码在 `infinite-canvas-jay`  
- **Prompt Hub（卡藏）**：你的提示词仓库，可独立选择授权方式；画布通过用户登录后的 API 读写卡片，**不要求** Prompt Hub 也 AGPL  

## 部署到 Vercel

公网部署画布 **不等于** 闭源。只要 GitHub 仓库公开、用户能获取对应源码，即符合 AGPL 网络服务条款的常见做法。

---

如有闭源商用需求，请联系上游维护者洽谈授权，勿自行闭源 fork。
