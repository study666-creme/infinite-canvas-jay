# 创作资料库

资料不需要手工选择细分类。只需判断它属于下面哪一种原始材料：

| 原始材料 | 放置目录 | 处理结果 |
| --- | --- | --- |
| 教材、课程笔记、方法论、官方文档、字幕 | `raw/` | 蒸馏为可执行知识卡 |
| 完整网文、完整短剧/电影剧本、市场案例 | `cases/raw/` | 建立独立故事案例索引 |
| 视频文件或视频 URL | `videos/inbox/`、`videos/urls.txt` | 提取或转写字幕到 `raw/` |

不需要再判断“故事、台词、导演、视觉”应该进哪个库。脚本会生成中文分类，并由 Agent 根据当前任务动态检索。

`review.json`、`videos/urls.txt` 和三个收件箱中的用户材料默认被 Git 忽略。首次使用可从 `review.example.json`、`videos/urls.example.txt` 复制本地配置；不要提交私人资料或登录信息。

## 最省事的用法

在 `web` 目录启动统一收件箱：

```bash
npm run knowledge:watch
```

之后向三个目录放文件即可。监听器会分别排队，视频字幕输出到 `raw/` 后会继续进入知识蒸馏。
监听器启动时会扫描已有文件；临时失败按 1、5、20 分钟最多自动重试三次，避免网络故障时无限调用接口。

直接打开对应文件夹：

```bash
npm run open-knowledge-folder
npm run open-case-folder
npm run open-video-folder
```

查看 SQLite 中的来源、案例、正式卡、候选卡和失败任务：

```bash
npm run knowledge:status
```

## 单独运行

```bash
npm run knowledge:ingest
npm run knowledge:cases
npm run knowledge:subtitle
```

也可以直接指定视频，不必先移动文件：

```bash
npm run knowledge:subtitle -- --input "D:\path\video.mp4"
```

重复传入 `--url`、把 URL 作为位置参数，或用每行一条的文本文件批量输入：

```bash
npm run knowledge:subtitle -- --url "https://example.com/video-a" --url "https://example.com/video-b"
npm run knowledge:subtitle -- "https://example.com/video-a" "https://example.com/video-b"
npm run knowledge:subtitle -- --url-file "D:\path\video-urls.txt"
```

播放列表或 B站合集只需传合集 URL。脚本先用 yt-dlp 展开条目，再按原顺序逐条处理；`--start-index` 从 1 开始，以下命令从第 6 条开始、最多处理 20 条、每条间隔 3 秒：

```bash
npm run knowledge:subtitle -- --url "https://www.bilibili.com/medialist/play/your-list" --start-index 6 --max-videos 20 --interval 3
```

多个 URL 展开后共用同一段顺序范围。默认最多处理 200 条，条目间隔 2.5 秒；单个视频 URL 也走相同的展开和限制流程。

未显式传入本地文件或 URL 时，脚本会同时扫描 `videos/inbox/` 和 `videos/urls.txt`；后者不存在时忽略，空行和以 `#` 开头的行也会忽略。两处都为空时，Windows 桌面会打开文件选择器。

## 本地 SQLite

数据库位于 `web/data/creative-library.sqlite`，用于：

- 记录来源、内容哈希和处理状态；
- 未变化的文件复用蒸馏结果，避免重复调用模型；
- 区分正式卡、候选卡、审核拒绝项；
- 保存故事案例结构索引；
- 记录字幕、知识和案例任务的成功、失败与重试。

SQLite 不保存整本原文。原始资料仍保留在各自 `raw` 目录。前端运行时读取自动生成的 TypeScript 静态索引，因此部署到 Vercel 等无持久磁盘环境时不依赖本地数据库。

## 知识卡质量流程

1. 自动读取资料并推断中文分类。
2. 第一轮模型提炼可执行原则、触发条件、证据摘要和适用边界。
3. 第二轮隔离模型审核材料是否真正支持结论，过滤空泛、过度推断和伪专业内容。
4. 通过阈值的卡标记为 `auto_verified`；不确定内容保留为 `candidate`，不会进入正式检索。
5. Agent 每轮检索 `0-5` 张相关卡，不强制打满。

本地无模型模式只建立候选索引。高质量蒸馏需要配置：

```bash
$env:KNOWLEDGE_LLM_API_KEY="你的 key"
$env:KNOWLEDGE_LLM_BASE_URL="https://api.openai.com/v1"
$env:KNOWLEDGE_LLM_MODEL="你的模型名"
npm run knowledge:ingest -- --llm
```

案例库使用同一组环境变量：

```bash
npm run knowledge:cases -- --llm
```

完整作品不会被压成通用方法卡。案例脚本按顺序抽样分段，提取叙事视角、世界设定、人物欲望、关系变化、故事发动机、真实存在的前三集钩子、场景功能、节奏曲线、短剧适配、可借鉴结构和禁止照搬项，再进行独立审核。运行时只在点子、故事、人物或剧本任务中检索最多 3 个案例。

## 视频字幕

字幕功能不再直接“蒸馏视频”，只负责生成字幕文件：

1. 本地视频有文本字幕轨时，用 FFmpeg 直接提取为 SRT。
2. 视频 URL 由 yt-dlp 先提取人工字幕和自动字幕并转为 SRT；没有 yt-dlp 时会优先通过 `python -m pip` 自动安装。
3. 没有可用字幕时，本地视频直接转写音轨；远程视频先由 yt-dlp 下载最佳音频，再复用 `faster-whisper` 转写。首次使用会按需安装 `faster-whisper`。
4. SRT 输出到 `raw/`；远程文件名包含视频标题和 ID，避免合集条目重名，并与书籍和笔记走同一知识蒸馏流程。

只允许提取已有文本字幕、不做语音转写：

```bash
npm run knowledge:subtitle -- --embedded-only --input "D:\path\video.mkv"
```

B站登录态可以直接从浏览器读取，也可以指定 Netscape 格式的 cookies.txt：

```bash
npm run knowledge:subtitle -- --url "https://www.bilibili.com/video/BV..." --browser edge
npm run knowledge:subtitle -- --url "https://www.bilibili.com/video/BV..." --cookies "D:\private\bilibili-cookies.txt"
```

未显式设置 `--cookies` 或 `--browser` 时，B站 URL 会按本机已安装或已有配置的 Edge、Chrome、Firefox 依次尝试登录态，最后匿名访问。遇到浏览器 Cookie 数据库占用时，关闭对应浏览器后重试。

cookies.txt 等同登录凭据：不要提交到 Git，不要放进 `raw/`、`videos/` 或共享目录，使用临时私有路径并在任务后及时撤销。脚本只把 cookie 文件路径交给 yt-dlp，不会把 cookie 内容写入日志或 SQLite。

画面中烧录的字幕属于 OCR 问题。当前回退方案识别音轨中的语音，不保证逐字等同画面字幕。

## 支持格式

- 直接读取：`.txt`、`.md`、`.srt`、`.vtt`、`.html`、`.epub`
- 通过 Calibre：`.mobi`、`.azw`、`.azw3`
- PDF：优先 Poppler `pdftotext`，失败后尝试 Calibre
- 视频：`.mp4`、`.mov`、`.mkv`、`.avi`、`.webm`、`.m4v`、`.ts`、`.mts`、`.m2ts`

## 人工覆盖

通常不需要逐张审核。只有需要强制批准或屏蔽知识卡时，把 `review.example.json` 复制为本地 `review.json`，再编辑 `approved` 或 `rejected` ID 数组。

项目活动要求、已确认剧情、人设和资产不属于知识卡。它们保存在结构化“项目黑板”中，并始终比外部知识和案例拥有更高优先级。

## 版权边界

只处理你有权使用的个人资料、公开官方文档、课程笔记和字幕。生成包只保存原创结构摘要和方法卡，不保存整本原文，不用于传播盗版内容。
