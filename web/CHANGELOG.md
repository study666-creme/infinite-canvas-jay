# CHANGELOG (Jay fork)

本文件供 Vercel 构建读取；完整历史见仓库根目录 [CHANGELOG.md](../CHANGELOG.md)。

## Unreleased (study666-creme/infinite-canvas-jay)

+ 画布：视频选帧对话框（默认最后一帧、时间轴自选、右侧预览）；修复 blob 缓存失效导致截帧 Failed to fetch
+ 画布：视频节点悬停工具栏、放大预览、播放/选中分离
+ 画布：简化生成进度 UI（节点中央小号百分比）；去掉选中节点四角蓝色角点
+ 画布：修复双击文本节点编辑崩溃（@ 引用编辑器 ref 类型）
+ 画布：多图结果不再把图片节点自动转为文本节点，提示词保留在图片节点
+ 文档：补充视频生成 prompt 组合规则与节点工具栏说明

+ 文档：视频播放已知问题与故障排查（`docs/.../video-playback.mdx`、`DEPLOY.md`）
+ 画布：节点成组/取消成组、框选平移交互调整、视频点击播放；操作说明面板与文档同步
+ 画布：图片/视频生成低调进度条；修复即梦/MJ 一次返回多图只解析一张的问题
+ 画布：黑色玻璃生成动效；视频 `@` 引用与 media/fetch 播放链路（**播放未稳定**）
+ Prompt Hub（卡藏）双向：设置页登录、素材库 Tab 插入图片+提示词、节点右键存卡
+ Vercel 部署：`web/` 为 Root Directory

## v0.4.0-jay

基于上游 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) v0.4.0 fork。
