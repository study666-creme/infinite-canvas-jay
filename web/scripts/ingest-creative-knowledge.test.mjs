import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeSubtitle } from "./audit-video-subtitles.mjs";
import { databaseSummary, openCreativeLibraryDb, replaceKnowledgeSnapshot } from "./creative-library-db.mjs";
import { parseSubtitleCues, selectSubtitleKnowledgeChunks } from "./export-creative-knowledge-chunks.mjs";
import { buildCaseLibraryMeta } from "./ingest-creative-cases.mjs";
import { buildDistillationBatches, normalizeKnowledgeScope, parseReviewedCards, selectEpubPaths, selectKnowledgeChunks, selectPdfPageNumbers, sourceSpecKey, writeGeneratedPack } from "./ingest-creative-knowledge.mjs";
import { renderKnowledgeHtml, renderKnowledgeMarkdown } from "./render-creative-knowledge-report.mjs";

test("故事案例只有用户确认后才计入运行时", () => {
    const meta = buildCaseLibraryMeta(
        [{ status: "verified" }, { status: "auto_verified" }, { status: "candidate" }, { status: "rejected" }],
        { mode: "test", generatedAt: "2026-01-01T00:00:00.000Z" },
    );
    assert.deepEqual(meta, {
        generatedAt: "2026-01-01T00:00:00.000Z",
        caseCount: 4,
        activeCaseCount: 1,
        independentlyReviewedCaseCount: 1,
        candidateCaseCount: 2,
        mode: "test",
    });
});

test("字幕代表分块保留可追溯时间范围", () => {
    const subtitle = `1
00:00:01,000 --> 00:00:03,500
第一段讲故事结构。

2
00:00:04,000 --> 00:00:08,000
第二段讲人物行动与结果。

3
00:02:10,000 --> 00:02:14,000
第三段说明不要让角色原地解释。`;
    const cues = parseSubtitleCues(subtitle);
    const chunks = selectSubtitleKnowledgeChunks(subtitle, 4);

    assert.equal(cues.length, 3);
    assert.equal(cues[0].startMs, 1000);
    assert.match(chunks[0], /^\[00:00:01-00:00:08\]/);
    assert.match(chunks.at(-1), /^\[00:02:10-00:02:14\]/);
    assert.match(chunks.join(" "), /人物行动与结果/);
});

test("VTT 字幕接受点号毫秒并忽略标签", () => {
    const subtitle = `WEBVTT

00:00:00.500 --> 00:00:02.000 align:start
<c>镜头先建立空间。</c>`;
    const chunks = selectSubtitleKnowledgeChunks(subtitle, 2);

    assert.deepEqual(chunks, ["[00:00:00-00:00:02] 镜头先建立空间。"]);
});

test("字幕质检隔离文本过少并标记视觉依赖", () => {
    const tooShort = analyzeSubtitle({ filename: "坏字幕 [BV123].zh.srt", text: "1\n00:00:00,000 --> 00:00:02,000\n字幕制作" });
    const visual = analyzeSubtitle({
        filename: "视觉课程 [BV456].zh.srt",
        text: `1
00:00:00,000 --> 00:01:00,000
这一段先说明一个可以单独理解的故事结构原则，角色目标必须由危机和需求触发，行动结果再改变下一步处境。创作者需要检查角色为什么现在行动、准备获得什么、遇到什么阻碍，以及结果如何形成新的选择。只有这些因果能够单独读懂，后续的悬念和反转才有承载基础。

2
00:02:40,000 --> 00:02:50,000
下面看视频中的具体画面，再判断镜头如何变化。

3
00:02:51,000 --> 00:03:20,000
视觉案例结束后只做总结，不补充新的文本证据。这里再次强调，不能把依赖画面才能成立的观察伪装成字幕已经证明的通用结论；纯文本审核只能使用前面明确说出的条件、行动与结果。`,
    });

    assert.equal(tooShort.status, "quarantined");
    assert.ok(tooShort.flags.includes("too_little_text"));
    assert.equal(visual.status, "needs_review");
    assert.ok(visual.flags.includes("large_silent_or_visual_gap"));
    assert.ok(visual.flags.includes("visual_dependency"));
    assert.equal(visual.videoId, "BV456");
});

test("合订 EPUB 范围按首尾条目闭区间切分", () => {
    assert.deepEqual(selectEpubPaths(["a.xhtml", "b.xhtml", "c.xhtml", "d.xhtml"], { start: "b.xhtml", end: "c.xhtml" }), ["b.xhtml", "c.xhtml"]);
    assert.throws(() => selectEpubPaths(["a.xhtml"], { start: "missing.xhtml" }), /起点不存在/);
});

test("manifest id 保持逻辑来源稳定", () => {
    const first = sourceSpecKey({ manifestId: "mckee-story", path: "a.epub", epubRange: { start: "a", end: "b" } });
    const changed = sourceSpecKey({ manifestId: "mckee-story", path: "a.epub", epubRange: { start: "c", end: "d" } });
    assert.equal(first, "manifest:mckee-story");
    assert.equal(changed, first);
});

test("长资料取样覆盖开头、中段和结尾", () => {
    const text = Array.from({ length: 60 }, (_, index) => `第${index + 1}段包含故事结构、人物冲突与创作原则，应该检查这一位置的独特标记 M${index + 1}。`).join("\n\n");
    const chunks = selectKnowledgeChunks(text, 12);
    const joined = chunks.join(" ");
    assert.ok(chunks.length >= 8 && chunks.length <= 12);
    assert.match(joined, /M(?:[1-9]|1\d)/);
    assert.match(joined, /M(?:2\d|3\d|4\d)/);
    assert.match(joined, /M(?:5\d|60)/);
});

test("蒸馏批次同时受分块数和字符数限制", () => {
    const batches = buildDistillationBatches(
        Array.from({ length: 17 }, () => "x".repeat(100)),
        { chunksPerBatch: 8, batchChars: 1000 },
    );
    assert.deepEqual(
        batches.map((batch) => batch.length),
        [8, 8, 1],
    );
});

test("扫描 PDF 页抽样覆盖首尾且不超过上限", () => {
    const pages = selectPdfPageNumbers(276, 48);
    assert.equal(pages.length, 48);
    assert.equal(pages[0], 1);
    assert.equal(pages.at(-1), 276);
    assert.equal(new Set(pages).size, pages.length);
});

test("知识作用域只接受四种产品语义", () => {
    assert.equal(normalizeKnowledgeScope("core"), "core");
    assert.equal(normalizeKnowledgeScope("extension"), "extension");
    assert.equal(normalizeKnowledgeScope("corroboration"), "corroboration");
    assert.equal(normalizeKnowledgeScope("unknown"), "specialist");
});

test("已审核卡必须逐张给出审核结论和中文理由", () => {
    const sourceIds = new Map([["support", "src_support"]]);
    const base = { manifestId: "primary", id: "src_primary", title: "测试来源", layer: "private", scope: "core", authority: 0.9 };
    assert.throws(
        () => parseReviewedCards({ ...base, reviewedCardsText: JSON.stringify({ sourceId: "primary", audited: true, cards: [{ title: "卡片", principle: "这是一个具有证据支持的中文原则。" }] }) }, sourceIds),
        /缺少 keep/,
    );
    const cards = parseReviewedCards(
        {
            ...base,
            reviewedCardsText: JSON.stringify({
                sourceId: "primary",
                audited: true,
                cards: [{ title: "卡片", principle: "这是一个具有证据支持的中文原则。", keep: true, auditReason: "材料直接支持。", evidenceSummary: "材料呈现了相应条件和结果。", confidence: 0.82, supportingSourceIds: ["support"] }],
            }),
        },
        sourceIds,
    );
    assert.equal(cards[0].status, "auto_verified");
    assert.deepEqual(cards[0].sourceIds, ["src_primary", "src_support"]);
});

test("可读知识报告直接展示正文、检查项和证据", () => {
    const report = {
        sources: [{ id: "src_1", title: "测试课程" }],
        cards: [
            {
                title: "让行动承担信息",
                category: "叙事",
                principle: "角色通过选择改变局面。",
                triggers: ["解释过多时"],
                appliesTo: ["剧本"],
                checks: ["行动是否产生结果？"],
                avoid: ["只让角色口头说明"],
                evidenceSummary: "来源给出了行动与结果的例子。",
                conflicts: ["抒情段落不必强行套用。"],
                auditReason: "证据能够支持该原则。",
                sourceIds: ["src_1"],
                status: "candidate",
                confidence: 0.8,
                authority: 0.7,
            },
        ],
        warnings: [],
    };
    const markdown = renderKnowledgeMarkdown(report);
    const html = renderKnowledgeHtml(report);

    assert.match(markdown, /核心知识[\s\S]*角色通过选择改变局面/);
    assert.match(markdown, /检查清单[\s\S]*行动是否产生结果/);
    assert.match(markdown, /证据与边界[\s\S]*来源给出了行动与结果的例子/);
    assert.match(html, /角色通过选择改变局面/);
    assert.match(html, /搜索标题、原则、检查项/);
    assert.match(html, /按来源筛选/);
    assert.match(html, /仅独立审核通过/);
    assert.match(html, /只有你确认后的卡才会参与 Agent 检索/);
    assert.match(html, /测试课程/);
});

test("独立审核通过的卡在用户确认前不会进入运行时上下文", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-pack-"));
    const output = path.join(dir, "pack.ts");
    try {
        await writeGeneratedPack(output, {
            sources: [],
            mode: "test",
            cards: [
                { id: "reviewed", title: "待确认", category: "测试", principle: "这条原则已通过独立审核，但用户尚未确认。", appliesTo: [], checks: [], avoid: [], sourceIds: [], status: "auto_verified" },
                { id: "confirmed", title: "已确认", category: "测试", principle: "这条原则已经由用户明确确认。", appliesTo: [], checks: [], avoid: [], sourceIds: [], status: "verified" },
            ],
        });
        const generated = await fs.readFile(output, "utf8");
        const contextMatch = generated.match(/^export const CREATIVE_IMPORTED_KNOWLEDGE_CONTEXT = (.+);$/m);
        assert.ok(contextMatch);
        const context = JSON.parse(contextMatch[1]);
        assert.match(context, /这条原则已经由用户明确确认/);
        assert.doesNotMatch(context, /用户尚未确认/);
        assert.match(generated, /"activeCardCount": 1/);
        assert.match(generated, /"independentlyReviewedCardCount": 1/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("已确认知识快照事务式写入 SQLite 并建立来源关联", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-db-"));
    const dbFile = path.join(dir, "library.sqlite");
    const opened = openCreativeLibraryDb(dbFile);
    try {
        const source = { id: "source-1", title: "测试来源", category: "测试", kind: "txt", source: "test.txt", layer: "private", authority: 0.8, chars: 1000, chunks: 3 };
        const card = { id: "card-1", title: "测试卡", category: "测试", principle: "这是已经由用户确认的可执行原则。", layer: "private", status: "verified", confidence: 0.8, authority: 0.8, sourceIds: [source.id] };
        replaceKnowledgeSnapshot(opened.db, { sources: [source], cards: [card] });

        assert.deepEqual(databaseSummary(opened.db), { sources: 1, knowledgeSources: 1, caseSources: 0, cards: 1, activeCards: 1, cases: 0, activeCases: 0, queuedJobs: 0, failedJobs: 0 });
        assert.equal(opened.db.prepare("SELECT COUNT(*) AS count FROM knowledge_card_sources").get().count, 1);
    } finally {
        opened.db.close();
        await fs.rm(dir, { recursive: true, force: true });
    }
});
