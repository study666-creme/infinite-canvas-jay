# 卡藏提示词画布 Codex 插件

该插件把本机 Canvas Agent MCP 注册给 Codex App，让 Codex 可以打开画布、读取真实节点、创建内容、连接流程、触发生成并操作 3D 导演台。

## 自动安装

把下面内容发给 Codex：

```text
请从 https://github.com/study666-creme/infinite-canvas-jay 安装 Infinite Canvas Codex 插件。
请 clone 仓库，确认 plugins/infinite-canvas/.codex-plugin/plugin.json 存在，
把仓库加入 personal marketplace，再安装 infinite-canvas 插件并校验 MCP。
安装后告诉我是否需要新建对话以加载技能和工具。
```

## 本仓库调试安装

```bash
git clone https://github.com/study666-creme/infinite-canvas-jay.git
cd infinite-canvas-jay
codex plugin marketplace add "$(pwd)"
codex plugin add infinite-canvas@infinite-canvas-local
```

仓库内 `.agents/plugins/marketplace.json` 已指向 `./plugins/infinite-canvas`。安装或更新插件后建议新建 Codex 对话，避免继续使用旧技能缓存。

## 使用

```text
打开卡藏提示词画布并连接本机 Agent
读取当前画布并总结节点结构
根据文字分镜载入 3D 导演台并批量截图
```

插件默认运行：

```bash
npx -y codex-remote-bridge mcp
```

`codex-remote-bridge` 是当前 npm 兼容包名，产品职责仍是 Infinite Canvas Agent。

## 手动排查

先启动 Web 应用：

```bash
cd web
npm ci
npm run dev
```

再启动 Agent：

```bash
cd ../canvas-agent
npm install
npm run dev
```

从终端输出或 `http://127.0.0.1:17371/config` 读取本机 URL 与 token。不要公开 token，也不要把它写进仓库环境文件。

更多说明见仓库根目录 [CANVAS-AGENT.md](../../CANVAS-AGENT.md)。
