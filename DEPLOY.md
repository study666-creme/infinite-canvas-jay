# 部署指南

本文说明如何将本仓库部署到 GitHub，并通过 Vercel、Render 或 Docker 对外提供访问。

## 部署前须知

- 主应用是 `web/` 目录下的 Next.js 应用，构建产物为 standalone 模式。
- **AI API Key、画布项目、素材与生成记录默认保存在访问者的浏览器本地**，服务端不持久化用户创作数据。
- 当前版本 AI 请求由**浏览器前台**直连用户配置的 OpenAI 兼容接口；部署前端本身**不需要**在服务器配置 API Key。
- 本地文件夹保存（File System Access API）仅 Chrome / Edge 等支持该 API 的浏览器可用。
- 项目处于活跃开发阶段，存储格式可能调整，公网多人共用前请自行评估风险（见 README 提示）。

## 本仓库（Jay fork）

| 项 | 地址 |
|----|------|
| **GitHub** | https://github.com/study666-creme/infinite-canvas-jay |
| **上游** | https://github.com/basketikun/infinite-canvas |
| **Vercel** | 导入上述仓库，**Root Directory = `web`** |

```powershell
git clone https://github.com/study666-creme/infinite-canvas-jay.git
cd infinite-canvas-jay\web
npm install
npm run dev
```

## 推送到 GitHub（维护者）

本 fork 已配置：

- `origin` → `https://github.com/study666-creme/infinite-canvas-jay.git`
- `upstream` → `https://github.com/basketikun/infinite-canvas.git`

```powershell
cd D:\canvas\infinite-canvas
git checkout github-main
git push -u origin github-main:main --force
```

首次推送用 `github-main:main`（单次 root commit，避免浅克隆 `main` 缺对象）。之后可在 `github-main` 上继续开发并 `git push`。

从上游同步（可选）：

```powershell
git fetch upstream
git merge upstream/main
```

若本仓库基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 二次开发，请：

1. 保留 [LICENSE](LICENSE) 与原作者版权声明。
2. 在 README 或本文件中说明上游来源与主要改动。
3. 按 README 要求，**保留原作者信息和前端页面标识**（不要抹掉来源链接与协议说明）。

## Vercel（推荐）

### 方式 A：一键脚本（推荐，不用找控制台菜单）

在 **PowerShell** 执行（只需做一次登录）：

```powershell
cd D:\canvas\infinite-canvas
npx vercel login
.\scripts\fix-vercel-project.ps1
```

脚本会自动：把 **Root Directory** 设为 `web`、**Node.js** 设为 `20.x`，并从 GitHub `main` 触发一次 production 部署。

### 方式 B：控制台手动改（注意不是 General 页）

你截图里在 **Settings → General**，**Root Directory 不在这里**。

正确路径：

1. 打开 [infinite-canvas-jay 项目](https://vercel.com/study666-cremes-projects/infinite-canvas-jay)
2. 顶部点 **Settings**
3. 左侧点 **Build and Deployment**（不是 General）
4. 往下滚找到 **Root Directory** → 填 `web` → **Save**
5. 同页 **Node.js Version** → 选 **20.x** → **Save**
6. 顶部 **Deployments** → 最新一条 → **Redeploy**

### 首次从 GitHub 导入

1. 在 [Vercel](https://vercel.com/) 导入 GitHub 仓库 `study666-creme/infinite-canvas-jay`。
2. 导入页点 **Root Directory** 旁的 **Edit** → 选 `web`（或在 Build and Deployment 里改）。
3. Framework Preset 选 **Next.js**（一般会自动识别）。
4. 构建命令：`npm run build`；安装命令见 `web/vercel.json`。
5. 部署完成后访问分配的域名；首次打开在右上角配置弹窗填入 Base URL 与 API Key。

也可用带参数的导入链接（自动填 Root Directory）：

https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fstudy666-creme%2Finfinite-canvas-jay&project-name=infinite-canvas-jay&root-directory=web

若部署失败（404 / DEPLOYMENT_NOT_FOUND）：

1. Vercel → 项目 → **Deployments** → 点开最新一条看 **Build Logs** 红色报错
2. 确认 **Root Directory = `web`**（不是仓库根目录）
3. **Node.js Version = 20.x**（Settings → General）
4. 重新 **Redeploy**（不要用已失败的旧域名缓存）

## 开源合规

公网部署前请读 **[OPEN-SOURCE.md](OPEN-SOURCE.md)**：本画布 fork **必须 AGPL 公开**；Prompt Hub 可独立闭源运营。

可选环境变量（构建时注入，均有默认值，通常不必配置）：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_APP_VERSION` | 由 `next.config.ts` 从根目录 `VERSION` 读取，一般无需手动设置 |
| `NEXT_PUBLIC_DOC_URL` | 文档站地址，默认 `https://docs.canvas.best` |

根目录 **不要** 放 `vercel.json`（含 `rootDirectory` 会导致 Vercel 新建项目报错）。构建配置见 `web/vercel.json`；**Root Directory 只在 Vercel 控制台设为 `web`**。

## Render

仓库根目录有 [render.yaml](render.yaml)，可使用 Docker 运行时部署：

1. 在 Render 连接 GitHub 仓库并创建 Web Service。
2. 或点击 README 中的 Deploy to Render 按钮（需将仓库 URL 改为你自己的 fork）。
3. 免费实例空闲约 15 分钟后会休眠，适合体验与演示。

详见 [Render 部署文档](docs/content/docs/overview/render.mdx)。

## Docker

使用发布镜像或本地构建：

```bash
# 使用 docker compose（推荐）
docker compose up -d

# 或手动构建
docker build -t infinite-canvas .
docker run --rm -p 3000:3000 infinite-canvas
```

访问 `http://localhost:3000`。

详见 [Docker 部署文档](docs/content/docs/overview/docker.mdx)。

## 本地开发

```bash
cd web
bun install   # 或 npm install
bun run dev   # 或 npm run dev
```

默认 `http://localhost:3000`，画布路由为 `/canvas`。

## 接入视频 / Seedance / 即梦风格 API

本 fork 在画布中增强了即梦风格 UI、Seedance 视频参数、`@` 引用与本地媒体落盘等能力。接入方式与上游一致：

1. 在右上角配置弹窗填写 **OpenAI 兼容 Base URL** 与 **API Key**。
2. 视频生成：在模型名中配置 Seedance 等视频模型，Base URL 指向你的兼容网关（例如自建 [jimeng-free-api-all](https://github.com/) 或其它转发服务）。
3. **视频网关需自行部署**，与本前端分离；前端只通过浏览器请求你配置的地址，不会在仓库内附带第三方账号或密钥。

使用 New API 等系统时，可用带参数的跳转自动填配置：

```text
https://你的部署域名?apiKey={key}&baseUrl={address}
```

## 部署后检查清单

- [ ] 首页与 `/canvas` 可正常打开
- [ ] 配置弹窗可保存 Base URL / API Key（存于浏览器 localStorage）
- [ ] 文生图 / 视频生成请求发往预期网关（在浏览器网络面板确认）
- [ ] 若启用本地文件夹保存，在 Chrome/Edge 中授权目录并可读写
- [ ] Prompt Hub：设置里能登录；**插入素材 → Prompt Hub 卡片库** 能列出并插入
- [ ] README 与 LICENSE 仍包含上游版权声明

## 开源协议与「能不能商用」

本项目采用 **AGPL-3.0**（见 [LICENSE](LICENSE) 与 [开源协议说明](docs/content/docs/business/license.mdx)）。简要结论：

| 场景 | 是否允许 | 说明 |
|------|----------|------|
| 本地自用、学习、研究 | ✅ | 直接使用即可 |
| 开源 fork + 公网部署（代码公开） | ✅ | 需保留版权与 AGPL，向用户提供对应源代码（公开 GitHub 仓库通常即满足） |
| 收费提供托管 / SaaS（代码仍 AGPL 公开） | ✅ | AGPL 允许收费，但**不能闭源**你对本项目的修改 |
| 闭源商用、私有化交付且不公开修改代码 | ❌ | 需与原作者 [商务合作](docs/content/docs/business/business.mdx) 获取商业授权 |

**不会「侵权」的前提**：遵守 AGPL-3.0——保留作者信息、继续使用 AGPL 开源你的衍生版本、网络服务场景下向用户提供源码。若你记得作者说过「可以商用」，通常指的是 **在 AGPL 框架下的商用**（例如开源部署、收费托管但代码公开），或 **通过商务渠道获取闭源授权**；**不等于**可以随便闭源卖产品。

上游项目：[basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)

## 本 fork 主要改动（相对上游）

| 类别 | 内容 |
|------|------|
| 部署 | 根目录 `DEPLOY.md`、`vercel.json`（Root Directory = `web`）、`docs/.../github-deploy.mdx` |
| Prompt Hub | 设置页连接卡藏；图片节点右键存卡；**素材库 Tab 从卡片库插入图片+提示词** |
| 视频 / 即梦 | Seedance 参数、视频参考 `@`、本地媒体落盘、即梦风格 UI |
| 本地媒体 | `local-media-store`、可选导出到本机文件夹 |

如有闭源交付、企业内网长期闭源运行等需求，请邮件联系上游维护者（见商务合作文档）。
