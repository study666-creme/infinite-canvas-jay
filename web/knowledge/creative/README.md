# Creative Knowledge Ingest

把你有权使用的创作书籍、字幕、课程笔记、官方文档放进 `raw/`，然后运行：

```bash
npm run knowledge:ingest
```

脚本会生成：

- `src/app/(user)/canvas/utils/creative-knowledge-pack.generated.ts`
- `knowledge/creative/creative-knowledge-report.json`

生成包会被画布 Agent 自动注入到创作类任务中，用于故事、剧本、台词/对白、导演、分镜、色彩、剪辑、声音、AI 视频生成和质检。

## 支持格式

- 直接支持：`.txt`、`.md`、`.srt`、`.vtt`、`.html`、`.epub`
- 需要 Calibre：`.mobi`、`.azw`、`.azw3`
- PDF：优先使用 `pdftotext`，没有则尝试 Calibre

Calibre 下载并安装后，确保命令行能运行：

```bash
ebook-convert --version
```

## 高质量蒸馏模式

本地模式只能做索引和粗提取。要让脚本把书/字幕蒸馏成更具体的原创知识卡，设置：

```bash
$env:KNOWLEDGE_LLM_API_KEY="你的 key"
$env:KNOWLEDGE_LLM_BASE_URL="https://api.openai.com/v1"
$env:KNOWLEDGE_LLM_MODEL="你的模型名"
npm run knowledge:ingest -- --llm
```

脚本会要求模型做版权安全改写：只输出原创总结，不长段引用原文。

## 指定来源

可以编辑 `sources.json`，明确列出文件和合法 URL。没有 `sources.json` 时，会自动扫描 `raw/`。

```json
{
  "files": [
    {
      "path": "raw/story-book.epub",
      "title": "故事结构笔记",
      "category": "故事与剧本"
    }
  ],
  "urls": [
    {
      "url": "https://example.com/official-video-prompt-guide",
      "title": "官方 AI 视频提示词指南",
      "category": "AI视频生成"
    }
  ]
}
```

## 版权边界

这个工具用于处理你有权使用的个人资料、公开官方文档、课程笔记和字幕文件。不要用它抓取或传播盗版书籍。生成包只保存蒸馏后的原则，不保存完整原文。
