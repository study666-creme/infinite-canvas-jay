#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { contentHash, databaseSummary, finishIngestJob, openCreativeLibraryDb, readCachedSource, readKnowledgeCardsForSource, replaceKnowledgeCardsForSource, startIngestJob, upsertLibrarySource } from "./creative-library-db.mjs";
import { writeReadableKnowledgeReports } from "./render-creative-knowledge-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const defaultInputDir = path.join(appRoot, "knowledge", "creative", "raw");
const defaultManifest = path.join(appRoot, "knowledge", "creative", "sources.json");
const defaultOutputFile = path.join(appRoot, "src", "app", "(user)", "canvas", "utils", "creative-knowledge-pack.generated.ts");
const defaultReportFile = path.join(appRoot, "knowledge", "creative", "creative-knowledge-report.json");
const defaultReviewFile = path.join(appRoot, "knowledge", "creative", "review.json");
const pipelineVersion = "knowledge-distill-v2";

const allowedExts = new Set([".txt", ".md", ".markdown", ".srt", ".vtt", ".html", ".htm", ".epub", ".mobi", ".azw", ".azw3", ".pdf"]);
const categoryFallback = "综合创作";
const qualityTerms = [
    "原则",
    "结构",
    "人物",
    "冲突",
    "场景",
    "台词",
    "对白",
    "对话",
    "潜台词",
    "声口",
    "口语",
    "金句",
    "镜头",
    "剪辑",
    "声音",
    "色彩",
    "光线",
    "导演",
    "表演",
    "悬念",
    "情绪",
    "观众",
    "节奏",
    "prompt",
    "camera",
    "shot",
    "scene",
    "dialogue",
    "subtext",
    "voice",
    "character",
    "conflict",
    "structure",
    "editing",
    "sound",
    "color",
    "lighting",
];
const lowQualityTerms = ["玄学", "秘籍", "包爆", "无脑", "稳赚", "割韭菜", "搬运", "洗稿", "盗版", "破解"];

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputDir = path.resolve(appRoot, args.input || defaultInputDir);
    const manifestFile = path.resolve(appRoot, args.manifest || defaultManifest);
    const outputFile = path.resolve(appRoot, args.output || defaultOutputFile);
    const reportFile = path.resolve(appRoot, args.report || defaultReportFile);
    const reviewFile = path.resolve(appRoot, args.review || defaultReviewFile);
    const maxCards = numberArg(args["max-cards"], 96);
    const maxChunksPerSource = numberArg(args["max-chunks-per-source"], 24);
    const chunksPerBatch = numberArg(args["chunks-per-batch"], 8);
    const batchChars = numberArg(args["batch-chars"], 18000);
    const reviewedCardsDir = args["reviewed-cards-dir"] ? path.resolve(appRoot, args["reviewed-cards-dir"]) : "";
    const chunksDir = args["chunks-dir"] ? path.resolve(appRoot, args["chunks-dir"]) : "";
    const useLlm = !args.local && Boolean(args.llm || process.env.KNOWLEDGE_LLM_API_KEY || process.env.OPENAI_API_KEY);
    const ingestMode = reviewedCardsDir ? "agent-reviewed" : useLlm ? "llm" : "local";
    const llmModel = reviewedCardsDir ? "agent-reviewed" : useLlm ? process.env.KNOWLEDGE_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini" : "local";
    const { db, file: dbFile } = openCreativeLibraryDb(args.db);

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.mkdir(path.dirname(reportFile), { recursive: true });

    const manifest = await readManifest(manifestFile);
    const sourceSpecs = await collectSourceSpecs({ inputDir, manifest, manifestFile });
    if (!sourceSpecs.length) {
        await writeGeneratedPack(outputFile, { cards: [], sources: [], mode: "empty" });
        await writeReport(reportFile, { sources: [], cards: [], warnings: [`没有找到可摄取文件。请把文件放到 ${inputDir}，或编辑 ${manifestFile}`] });
        console.log("没有找到可摄取文件，这不是报错。");
        console.log(`请先把 txt/md/srt/vtt/html/epub/mobi/azw3/pdf 放到：${inputDir}`);
        console.log("然后重新运行：npm run ingest-knowledge");
        console.log("想直接打开文件夹可以运行：npm run open-knowledge-folder");
        console.log(`SQLite: ${path.relative(appRoot, dbFile)} ${JSON.stringify(databaseSummary(db))}`);
        db.close();
        return;
    }

    const warnings = [];
    const documents = [];
    for (const spec of sourceSpecs) {
        const sourceKey = sourceSpecKey(spec);
        const jobId = startIngestJob(db, { jobType: "knowledge", sourceKey, sourcePath: spec.path || "" });
        try {
            const doc = chunksDir ? await loadChunkDocument(spec, chunksDir) : await loadSource(spec);
            const reviewedCardsText = reviewedCardsDir ? await readReviewedCardsText(reviewedCardsDir, doc.manifestId || doc.id) : "";
            if (doc.text.trim().length < 300) {
                warnings.push(`${doc.title}: 文本太短，已跳过`);
                finishIngestJob(db, jobId, { status: "failed", error: "文本少于 300 字" });
                continue;
            }
            documents.push({
                ...doc,
                contentHash: contentHash(
                    JSON.stringify({
                        pipelineVersion,
                        llmModel,
                        maxCards,
                        maxChunksPerSource,
                        chunksPerBatch,
                        batchChars,
                        title: doc.title,
                        category: doc.category,
                        note: doc.note,
                        layer: doc.layer,
                        scope: doc.scope,
                        workId: doc.workId,
                        language: doc.language,
                        authority: doc.authority,
                        reviewedCardsText,
                        text: cleanText(doc.text),
                    }),
                ),
                jobId,
                reviewedCardsText,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`${spec.title || spec.path || spec.url}: ${message}`);
            finishIngestJob(db, jobId, { status: "failed", error: message });
        }
    }

    const prepared = [];
    for (const doc of documents) {
        const chunks = doc.extractedChunks || selectKnowledgeChunks(cleanText(doc.text), maxChunksPerSource);
        if (!chunks.length) {
            warnings.push(`${doc.title}: 没有提取到足够相关的知识段落，已保留为失败任务等待资料调整`);
            finishIngestJob(db, doc.jobId, { status: "failed", error: "没有提取到足够相关的知识段落" });
            continue;
        }
        prepared.push({ ...doc, chunks });
    }
    const review = await readReviewFile(reviewFile);
    const sourceIdByManifestId = new Map(prepared.map((doc) => [doc.manifestId, doc.id]).filter(([id]) => id));
    const rawCards = [];
    let cachedSourceCount = 0;
    for (const doc of prepared) {
        try {
            const cached = readCachedSource(db, { id: doc.id, libraryType: "knowledge", hash: doc.contentHash, ingestMode });
            let sourceCards;
            if (cached) {
                sourceCards = readKnowledgeCardsForSource(db, doc.id).filter(Boolean);
                cachedSourceCount += 1;
            } else {
                const warningCount = warnings.length;
                const distilled = reviewedCardsDir ? parseReviewedCards(doc, sourceIdByManifestId) : useLlm ? await distillWithLlm([doc], { maxCards, warnings, chunksPerBatch, batchChars }) : localDistill([doc], maxCards);
                sourceCards = auditCards(distilled, { documents: [doc], review });
                const failed = warnings.slice(warningCount).some((warning) => warning.startsWith(`${doc.title}:`) && /失败/.test(warning));
                upsertLibrarySource(db, doc, {
                    libraryType: "knowledge",
                    hash: doc.contentHash,
                    ingestMode,
                    status: failed ? "failed" : "completed",
                    error: failed ? warnings.at(-1) : "",
                    metadata: { scope: doc.scope, workId: doc.workId, language: doc.language, epubRange: doc.epubRange },
                });
                replaceKnowledgeCardsForSource(db, doc.id, sourceCards);
                finishIngestJob(db, doc.jobId, { status: failed ? "failed" : "completed", error: failed ? warnings.at(-1) : "" });
            }
            const reviewedCards = auditCards(sourceCards, { documents: [doc], review });
            if (cached) {
                replaceKnowledgeCardsForSource(db, doc.id, reviewedCards);
                finishIngestJob(db, doc.jobId, { status: "completed" });
            }
            rawCards.push(...reviewedCards);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`${doc.title}: SQLite 写入或蒸馏失败。${message}`);
            finishIngestJob(db, doc.jobId, { status: "failed", error: message });
        }
    }
    const cards = limitCardsBySource(auditCards(rawCards, { documents: prepared, review }), prepared, maxCards);
    const sources = prepared.map((doc) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        kind: doc.kind,
        source: doc.source,
        layer: doc.layer,
        scope: doc.scope,
        workId: doc.workId,
        language: doc.language,
        authority: doc.authority,
        verified: doc.verified,
        chars: doc.text.length,
        chunks: doc.chunks.length,
    }));

    const mode = reviewedCardsDir ? "agent-reviewed" : useLlm ? (warnings.some((warning) => warning.includes("LLM 蒸馏失败")) ? "mixed" : "llm-distilled") : "local-indexed";
    await writeGeneratedPack(outputFile, { cards, sources, mode });
    const readableReports = await writeReport(reportFile, { sources, cards, warnings });

    console.log(`Creative knowledge ingest complete.`);
    console.log(`Sources: ${sources.length}`);
    console.log(`Cards: ${cards.length}`);
    console.log(`Generated: ${path.relative(appRoot, outputFile)}`);
    console.log(`Report: ${path.relative(appRoot, reportFile)}`);
    console.log(`Readable report: ${path.relative(appRoot, readableReports.htmlFile)}`);
    console.log(`Cache hits: ${cachedSourceCount}/${prepared.length}`);
    console.log(`SQLite: ${path.relative(appRoot, dbFile)} ${JSON.stringify(databaseSummary(db))}`);
    if (!useLlm) {
        console.log(`Tip: set KNOWLEDGE_LLM_API_KEY and run with --llm for higher quality paraphrased cards.`);
    }
    db.close();
    if (warnings.length) process.exitCode = 2;
}

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i];
        if (!item.startsWith("--")) continue;
        const key = item.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith("--")) {
            result[key] = true;
        } else {
            result[key] = next;
            i += 1;
        }
    }
    return result;
}

function numberArg(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function pathExists(file) {
    try {
        await fs.access(file);
        return true;
    } catch {
        return false;
    }
}

async function readManifest(manifestFile) {
    if (!(await pathExists(manifestFile))) return {};
    const text = await fs.readFile(manifestFile, "utf8");
    return JSON.parse(text);
}

async function readReviewFile(reviewFile) {
    if (!(await pathExists(reviewFile))) return { approved: [], rejected: [] };
    try {
        const value = JSON.parse(await fs.readFile(reviewFile, "utf8"));
        return {
            approved: Array.isArray(value.approved) ? value.approved.map(String) : [],
            rejected: Array.isArray(value.rejected) ? value.rejected.map(String) : [],
        };
    } catch {
        return { approved: [], rejected: [] };
    }
}

async function collectSourceSpecs({ inputDir, manifest, manifestFile }) {
    const specs = [];
    if (Array.isArray(manifest.files)) {
        for (const entry of manifest.files) {
            if (!entry?.path) continue;
            specs.push({
                type: "file",
                manifestId: cleanField(entry.id),
                path: path.resolve(path.dirname(manifestFile), entry.path),
                title: entry.title,
                category: entry.category,
                note: entry.note,
                scope: normalizeKnowledgeScope(entry.scope),
                workId: cleanField(entry.workId),
                language: cleanField(entry.language),
                epubRange: normalizeEpubRange(entry.epubRange),
                pdfOcrMaxPages: optionalPositiveInt(entry.pdfOcrMaxPages),
                layer: normalizeLayer(entry.layer),
                authority: normalizeScore(entry.authority, 0.7),
                verified: entry.verified === true,
            });
        }
    }
    if (Array.isArray(manifest.urls)) {
        for (const entry of manifest.urls) {
            if (!entry?.url) continue;
            specs.push({
                type: "url",
                manifestId: cleanField(entry.id),
                url: entry.url,
                title: entry.title,
                category: entry.category,
                note: entry.note,
                scope: normalizeKnowledgeScope(entry.scope),
                workId: cleanField(entry.workId),
                language: cleanField(entry.language),
                layer: normalizeLayer(entry.layer || "public"),
                authority: normalizeScore(entry.authority, 0.65),
                verified: entry.verified === true,
            });
        }
    }
    if (!specs.length && (await pathExists(inputDir))) {
        const files = await walkFiles(inputDir);
        for (const file of files) {
            if (allowedExts.has(path.extname(file).toLowerCase())) specs.push({ type: "file", path: file, layer: "private", scope: "specialist", authority: 0.7, verified: false });
        }
    }
    assertUniqueSourceSpecs(specs);
    return specs;
}

function optionalPositiveInt(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

async function readReviewedCardsText(dir, sourceId) {
    const file = path.join(dir, `${sourceId}.json`);
    if (!(await pathExists(file))) throw new Error(`缺少已审核知识卡文件：${file}`);
    return fs.readFile(file, "utf8");
}

async function loadChunkDocument(spec, chunksDir) {
    const manifestId = cleanField(spec.manifestId);
    if (!manifestId) throw new Error("复用代表分块时，来源必须配置稳定 id");
    const file = path.join(chunksDir, `${manifestId}.json`);
    if (!(await pathExists(file))) throw new Error(`缺少代表分块文件：${file}`);
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    if (payload.sourceId !== manifestId) throw new Error(`代表分块 sourceId 不匹配：${manifestId}`);
    const chunks = Array.isArray(payload.chunks) ? payload.chunks.map(cleanField).filter(Boolean) : [];
    if (!chunks.length) throw new Error(`${manifestId}: 代表分块为空`);
    const ext = spec.path ? path.extname(spec.path).toLowerCase() : "";
    return {
        id: stableId(sourceSpecKey(spec)),
        manifestId,
        title: spec.title || payload.title || manifestId,
        category: spec.category || payload.category || categoryFallback,
        kind: ext === ".epub" && spec.epubRange ? "epub-section" : ext.slice(1) || "file",
        source: spec.path ? sourceDisplayPath(spec.path, spec.epubRange) : spec.url,
        layer: normalizeLayer(spec.layer),
        scope: normalizeKnowledgeScope(spec.scope),
        workId: cleanField(spec.workId),
        language: cleanField(spec.language),
        authority: normalizeScore(spec.authority, 0.7),
        verified: spec.verified === true,
        note: cleanField(spec.note),
        epubRange: normalizeEpubRange(spec.epubRange),
        text: chunks.join("\n\n"),
        extractedChunks: chunks,
    };
}

function parseReviewedCards(doc, sourceIdByManifestId) {
    const payload = JSON.parse(doc.reviewedCardsText || "{}");
    if (payload.sourceId !== doc.manifestId) throw new Error(`${doc.title}: 已审核知识卡 sourceId 不匹配`);
    if (payload.audited !== true) throw new Error(`${doc.title}: 知识卡尚未完成独立审核`);
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    return cards.map((card, index) => {
        if (typeof card.keep !== "boolean") throw new Error(`${doc.title}: 第 ${index + 1} 张卡缺少 keep 审核结论`);
        if (!cleanField(card.auditReason) || !containsHan(card.auditReason)) throw new Error(`${doc.title}: 第 ${index + 1} 张卡缺少中文审核理由`);
        if (card.keep && (!cleanField(card.evidenceSummary) || !containsHan(card.evidenceSummary))) throw new Error(`${doc.title}: 第 ${index + 1} 张保留卡缺少中文证据摘要`);
        const supportingManifestIds = Array.isArray(card.supportingSourceIds) ? card.supportingSourceIds.map(String) : [];
        const unknownSupportingId = supportingManifestIds.find((id) => !sourceIdByManifestId.has(id));
        if (unknownSupportingId) throw new Error(`${doc.title}: 第 ${index + 1} 张卡引用未知校核来源 ${unknownSupportingId}`);
        const supportingIds = supportingManifestIds.map((id) => sourceIdByManifestId.get(id));
        const confidence = normalizeScore(card.confidence, 0.5);
        return {
            ...card,
            sourceIds: [...new Set([doc.id, ...supportingIds])],
            layer: doc.layer,
            scope: doc.scope,
            status: card.keep === false ? "rejected" : confidence >= 0.78 && doc.authority >= 0.6 ? "auto_verified" : "candidate",
            confidence,
            authority: doc.authority,
        };
    });
}

function assertUniqueSourceSpecs(specs) {
    const seen = new Set();
    for (const spec of specs) {
        const key = sourceSpecKey(spec);
        if (seen.has(key)) throw new Error(`来源清单存在重复逻辑来源：${key}`);
        seen.add(key);
    }
}

async function walkFiles(dir) {
    const out = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walkFiles(full)));
        else out.push(full);
    }
    return out;
}

async function loadSource(spec) {
    if (spec.type === "url") return loadUrl(spec);
    return loadFile(spec);
}

async function loadUrl(spec) {
    const response = await fetch(spec.url, { headers: { "user-agent": "InfiniteCanvasKnowledgeIngest/1.0" } });
    if (!response.ok) throw new Error(`URL 读取失败 HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    const title = spec.title || titleFromHtml(raw) || spec.url;
    const text = contentType.includes("html") ? stripHtml(raw) : raw;
    return {
        id: stableId(sourceSpecKey(spec)),
        title,
        category: spec.category || inferCategory(`${title}\n${text}`),
        kind: "url",
        source: spec.url,
        manifestId: cleanField(spec.manifestId),
        layer: normalizeLayer(spec.layer || "public"),
        scope: normalizeKnowledgeScope(spec.scope),
        workId: cleanField(spec.workId),
        language: cleanField(spec.language),
        authority: normalizeScore(spec.authority, 0.65),
        verified: spec.verified === true,
        note: cleanField(spec.note),
        text,
    };
}

async function loadFile(spec) {
    const file = spec.path;
    const ext = path.extname(file).toLowerCase();
    const title = spec.title || path.basename(file, ext);
    let text = "";
    if ([".txt", ".md", ".markdown", ".srt", ".vtt"].includes(ext)) text = await fs.readFile(file, "utf8");
    else if ([".html", ".htm"].includes(ext)) text = stripHtml(await fs.readFile(file, "utf8"));
    else if (ext === ".epub") text = await extractEpub(file, spec.epubRange);
    else if ([".mobi", ".azw", ".azw3"].includes(ext)) text = await convertWithCalibre(file);
    else if (ext === ".pdf") text = await extractPdf(file, { maxOcrPages: spec.pdfOcrMaxPages });
    else throw new Error(`不支持的文件类型：${ext}`);
    return {
        id: stableId(sourceSpecKey(spec)),
        title,
        category: spec.category || inferCategory(`${title}\n${text}`),
        kind: ext === ".epub" && spec.epubRange ? "epub-section" : ext.slice(1) || "file",
        source: sourceDisplayPath(file, spec.epubRange),
        manifestId: cleanField(spec.manifestId),
        layer: normalizeLayer(spec.layer),
        scope: normalizeKnowledgeScope(spec.scope),
        workId: cleanField(spec.workId),
        language: cleanField(spec.language),
        authority: normalizeScore(spec.authority, 0.7),
        verified: spec.verified === true,
        note: cleanField(spec.note),
        epubRange: normalizeEpubRange(spec.epubRange),
        text,
    };
}

async function extractEpub(file, epubRange) {
    const bytes = new Uint8Array(await fs.readFile(file));
    const zip = unzipSync(bytes);
    const readEntry = (name) => (zip[name] ? strFromU8(zip[name]) : "");
    const container = readEntry("META-INF/container.xml");
    const opfPath = matchAttr(container, "full-path");
    const htmlPaths = [];
    if (opfPath && zip[opfPath]) {
        const opf = readEntry(opfPath);
        const base = path.posix.dirname(opfPath);
        const manifest = new Map();
        for (const item of opf.matchAll(/<item\b[^>]*>/gi)) {
            const tag = item[0];
            const id = matchAttr(tag, "id");
            const href = matchAttr(tag, "href");
            const mediaType = matchAttr(tag, "media-type");
            if (id && href && /xhtml|html/i.test(mediaType || href)) manifest.set(id, path.posix.normalize(path.posix.join(base, href)));
        }
        for (const ref of opf.matchAll(/<itemref\b[^>]*>/gi)) {
            const idref = matchAttr(ref[0], "idref");
            const href = idref ? manifest.get(idref) : "";
            if (href && zip[href]) htmlPaths.push(href);
        }
    }
    if (!htmlPaths.length) {
        for (const key of Object.keys(zip).sort()) {
            if (/\.(xhtml|html|htm)$/i.test(key)) htmlPaths.push(key);
        }
    }
    const selectedPaths = selectEpubPaths(htmlPaths, epubRange);
    return selectedPaths.map((entry) => stripHtml(readEntry(entry))).join("\n\n");
}

function selectEpubPaths(htmlPaths, epubRange) {
    const range = normalizeEpubRange(epubRange);
    if (!range) return htmlPaths;
    const startIndex = range.start ? htmlPaths.indexOf(range.start) : 0;
    const endIndex = range.end ? htmlPaths.indexOf(range.end) : htmlPaths.length - 1;
    if (startIndex < 0) throw new Error(`EPUB 分段起点不存在：${range.start}`);
    if (endIndex < 0) throw new Error(`EPUB 分段终点不存在：${range.end}`);
    if (endIndex < startIndex) throw new Error(`EPUB 分段终点早于起点：${range.start} -> ${range.end}`);
    return htmlPaths.slice(startIndex, endIndex + 1);
}

function normalizeEpubRange(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const start = String(value.start || "")
        .trim()
        .replaceAll("\\", "/");
    const end = String(value.end || "")
        .trim()
        .replaceAll("\\", "/");
    return start || end ? { start, end } : null;
}

function sourceSpecKey(spec) {
    if (spec.manifestId) return `manifest:${spec.manifestId}`;
    const base = spec.path ? path.resolve(spec.path) : spec.url || "";
    const range = normalizeEpubRange(spec.epubRange);
    return range ? `${base}#epub:${range.start || ""}..${range.end || ""}` : base;
}

function sourceDisplayPath(file, epubRange) {
    const relative = path.relative(appRoot, file).replaceAll("\\", "/");
    const range = normalizeEpubRange(epubRange);
    return range ? `${relative}#${range.start || "start"}..${range.end || "end"}` : relative;
}

function matchAttr(tag, attr) {
    const re = new RegExp(`${attr}=["']([^"']+)["']`, "i");
    return tag.match(re)?.[1] || "";
}

async function extractPdf(file, { maxOcrPages = 72 } = {}) {
    const pdftotext = resolveCommand("pdftotext");
    const pages = pdfPageCount(file);
    if (pdftotext) {
        const result = spawnSync(pdftotext, ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
        const text = normalizePdfText(result.stdout || "");
        if (result.status === 0 && isUsablePdfText(text, pages)) return text;
    }
    try {
        const ocrText = await ocrPdf(file, { maxPages: maxOcrPages, pages });
        if (isUsablePdfText(ocrText)) return normalizePdfText(ocrText);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
            return await convertWithCalibre(file);
        } catch (calibreError) {
            throw new Error(`PDF 文本层不可用，OCR 也失败：${message}；Calibre 回退失败：${calibreError instanceof Error ? calibreError.message : String(calibreError)}`);
        }
    }
    return convertWithCalibre(file);
}

function pdfPageCount(file) {
    const pdfinfo = resolveCommand("pdfinfo");
    if (!pdfinfo) return 0;
    const info = spawnSync(pdfinfo, [file], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/im)?.[1]);
    return info.status === 0 && Number.isFinite(pages) ? pages : 0;
}

async function ocrPdf(file, { maxPages = 72, pages: knownPages = 0 } = {}) {
    const pdftoppm = resolveCommand("pdftoppm");
    const pdfinfo = resolveCommand("pdfinfo");
    const tesseract = resolveCommand("tesseract");
    if (!pdftoppm || !pdfinfo || !tesseract) throw new Error("缺少 pdftoppm、pdfinfo 或 Tesseract");
    const pages = knownPages || pdfPageCount(file);
    if (!Number.isFinite(pages) || pages < 1) throw new Error("无法读取 PDF 页数");
    const pageNumbers = selectPdfPageNumbers(pages, maxPages);
    const tessdataDir = path.join(appRoot, "data", "tessdata");
    const hasChinese = fsSync.existsSync(path.join(tessdataDir, "chi_sim.traineddata"));
    const hasEnglish = fsSync.existsSync(path.join(tessdataDir, "eng.traineddata"));
    const language = [hasChinese ? "chi_sim" : "", hasEnglish ? "eng" : ""].filter(Boolean).join("+") || "eng";
    const tmpDir = path.join(appRoot, "knowledge", "creative", ".tmp", `pdf-ocr-${process.pid}-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const output = [];
    try {
        for (const pageNumber of pageNumbers) {
            const prefix = path.join(tmpDir, `page-${String(pageNumber).padStart(5, "0")}`);
            const image = `${prefix}.png`;
            const render = spawnSync(pdftoppm, ["-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-r", "200", "-png", file, prefix], {
                encoding: "utf8",
                maxBuffer: 20 * 1024 * 1024,
            });
            if (render.status !== 0 || !fsSync.existsSync(image)) throw new Error(render.stderr || `第 ${pageNumber} 页渲染失败`);
            const args = [image, "stdout", "-l", language, "--psm", "6"];
            if (fsSync.existsSync(tessdataDir)) args.push("--tessdata-dir", tessdataDir);
            const recognized = spawnSync(tesseract, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
            if (recognized.status !== 0) throw new Error(recognized.stderr || `第 ${pageNumber} 页 OCR 失败`);
            output.push(`PDF 第 ${pageNumber} 页\n${recognized.stdout}`);
            await fs.rm(image, { force: true });
        }
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
    return output.join("\n\n");
}

function selectPdfPageNumbers(totalPages, maxPages) {
    const total = Math.max(0, Math.floor(Number(totalPages)));
    const limit = Math.max(1, Math.floor(Number(maxPages) || 1));
    if (total <= limit) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = new Set([1, total]);
    for (let index = 0; index < limit; index += 1) {
        pages.add(Math.round(1 + (index * (total - 1)) / Math.max(1, limit - 1)));
    }
    return [...pages].sort((a, b) => a - b).slice(0, limit);
}

function isUsablePdfText(text, pages = 0) {
    const compact = String(text || "").replace(/\s/g, "");
    const minimumLength = pages > 0 ? Math.min(5000, Math.max(100, pages * 30)) : 100;
    if (compact.length < minimumLength) return false;
    const meaningful = (compact.match(/[\p{L}\p{N}\p{Script=Han}]/gu) || []).length;
    const replacement = (compact.match(/�/g) || []).length;
    return meaningful / compact.length >= 0.55 && replacement / compact.length < 0.01;
}

function normalizePdfText(text) {
    return String(text || "")
        .replace(/\f/g, "\n\n")
        .replace(/([\u3400-\u9fff，、；：])\n(?=[\u3400-\u9fff])/g, "$1")
        .replace(/([A-Za-z0-9,;:])\n(?=[A-Za-z0-9])/g, "$1 ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function convertWithCalibre(file) {
    const ebookConvert = resolveCommand("ebook-convert");
    if (!ebookConvert) {
        throw new Error("需要安装 Calibre，并确保 ebook-convert 在 PATH 中，才能读取 mobi/azw3/pdf");
    }
    const tmpDir = path.join(appRoot, "knowledge", "creative", ".tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const out = path.join(tmpDir, `${path.basename(file)}.txt`);
    const result = spawnSync(ebookConvert, [file, out], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || "ebook-convert 转换失败");
    const text = await fs.readFile(out, "utf8");
    if (!text.trim()) throw new Error("ebook-convert 没有提取到文本");
    return text;
}

function resolveCommand(command) {
    if (process.platform === "win32") {
        const names = new Set([`${command}.exe`, command].map((item) => item.toLowerCase()));
        const fixed = [
            command === "ebook-convert" ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Calibre2", "ebook-convert.exe") : "",
            command === "python" ? path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe") : "",
            command === "tesseract" ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Tesseract-OCR", "tesseract.exe") : "",
        ].filter(Boolean);
        for (const candidate of fixed) if (fsSync.existsSync(candidate)) return candidate;
        const packages = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
        const prefixes = ["pdftotext", "pdftoppm", "pdfinfo"].includes(command) ? ["oschwartz10612.Poppler_"] : command === "ffmpeg" || command === "ffprobe" ? ["Gyan.FFmpeg_"] : [];
        if (prefixes.length && fsSync.existsSync(packages)) {
            for (const entry of fsSync.readdirSync(packages, { withFileTypes: true })) {
                if (!entry.isDirectory() || !prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
                const match = findExecutable(path.join(packages, entry.name), names, 5);
                if (match) return match;
            }
        }
    }
    const probe = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(probe, [command], { encoding: "utf8" });
    return result.status === 0
        ? result.stdout
              .split(/\r?\n/)
              .map((item) => item.trim())
              .find(Boolean) || command
        : "";
}

function findExecutable(dir, names, depth) {
    if (depth < 0) return "";
    let entries;
    try {
        entries = fsSync.readdirSync(dir, { withFileTypes: true });
    } catch {
        return "";
    }
    for (const entry of entries) if (entry.isFile() && names.has(entry.name.toLowerCase())) return path.join(dir, entry.name);
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const match = findExecutable(path.join(dir, entry.name), names, depth - 1);
        if (match) return match;
    }
    return "";
}

function titleFromHtml(html) {
    return stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
}

function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|section|article|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');
}

function cleanText(text) {
    return String(text || "")
        .replace(/\r/g, "\n")
        .replace(/^\s*(WEBVTT|Kind: captions|Language:.*)\s*$/gim, "")
        .replace(/^\s*\d+\s*$/gm, "")
        .replace(/\d{1,2}:\d{2}:\d{2}[,.]\d{2,3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{2,3}.*$/gm, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function splitParagraphs(text) {
    const units = text
        .split(/\n{2,}|(?<=[。！？.!?])\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 20);
    const out = [];
    let current = "";
    for (const unit of units) {
        if (unit.length > 2200) {
            if (current) out.push(current);
            current = "";
            for (let index = 0; index < unit.length; index += 1800) out.push(unit.slice(index, index + 1800));
            continue;
        }
        if (current && current.length + unit.length + 1 > 1800) {
            out.push(current);
            current = "";
        }
        current += `${current ? " " : ""}${unit}`;
        if (current.length >= 240) {
            out.push(current);
            current = "";
        }
    }
    if (current.length >= 80) out.push(current);
    return out;
}

function selectKnowledgeChunks(text, limit) {
    const paras = splitParagraphs(text);
    const candidates = paras
        .map((text, index) => ({ text, index, score: scoreChunk(text) }))
        .filter((item) => item.score > 1)
        .sort((a, b) => b.score - a.score || a.index - b.index);
    if (candidates.length <= limit) return candidates.sort((a, b) => a.index - b.index).map((item) => item.text);

    const selected = new Map();
    const bucketCount = Math.min(limit, Math.max(1, Math.ceil(limit / 2)));
    const bucketWidth = Math.max(1, paras.length / bucketCount);
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
        const start = bucket * bucketWidth;
        const end = (bucket + 1) * bucketWidth;
        const best = candidates.find((item) => item.index >= start && item.index < end && !selected.has(item.index));
        if (best) selected.set(best.index, best);
    }
    for (const item of candidates) {
        if (selected.size >= limit) break;
        selected.set(item.index, item);
    }
    return [...selected.values()].sort((a, b) => a.index - b.index).map((item) => item.text);
}

function scoreChunk(text) {
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of qualityTerms) if (lower.includes(term.toLowerCase())) score += 1;
    if (/[。；:：]\s*(要|不要|必须|应该|需要|避免|优先|核心|关键)/.test(text)) score += 2;
    if (/because|therefore|must|should|avoid|principle|structure|conflict/i.test(text)) score += 1;
    if (lowQualityTerms.some((term) => text.includes(term))) score -= 5;
    if (/目录|版权|ISBN|出版社|购买|扫码|关注公众号/.test(text)) score -= 3;
    return score;
}

function inferCategory(text) {
    const lower = text.toLowerCase();
    if (/ai|video generation|sora|veo|runway|prompt|图生视频|文生视频|视频生成/.test(lower)) return "AI视频生成";
    if (/台词|对白|对话|潜台词|声口|口语|金句|dialogue|subtext/.test(lower)) return "台词与对白";
    if (/镜头|分镜|摄影|构图|色彩|光线|cinematography|shot|camera|color/.test(lower)) return "视听与分镜";
    if (/导演|表演|调度|actor|directing|performance/.test(lower)) return "导演与表演";
    if (/剪辑|声音|音效|音乐|editing|sound|audio/.test(lower)) return "剪辑与声音";
    if (/人物|角色|心理|欲望|character|psychology/.test(lower)) return "人物与心理";
    if (/剧本|故事|结构|冲突|悬念|screenplay|story|plot|structure/.test(lower)) return "故事与剧本";
    if (/短剧|网文|爽点|情绪|钩子|留存/.test(lower)) return "短剧与网感";
    return categoryFallback;
}

function localDistill(docs, maxCards) {
    const cards = [];
    for (const doc of docs) {
        const terms = topTerms(doc.chunks.join("\n"));
        cards.push({
            title: `${doc.title}：核心问题清单`,
            category: doc.category,
            principle: `从该来源建立关于${terms.slice(0, 5).join("、") || doc.category}的创作检查框架；本地模式只做索引，建议用 --llm 生成更具体的原创总结。`,
            appliesTo: ["创作前判断", "改稿质检", "提示词重写"],
            checks: terms.slice(0, 6).map((term) => `当前方案是否已经具体处理「${term}」？`),
            avoid: ["只摘录原文而不转化为可执行创作判断", "把单一来源当作万能公式"],
            sourceIds: [doc.id],
            layer: doc.layer,
            scope: doc.scope,
            status: "candidate",
            confidence: 0.45,
            authority: doc.authority,
            triggers: terms,
            evidenceSummary: "本地模式只完成索引，尚未经过独立模型审核。",
            conflicts: [],
        });
        if (cards.length >= maxCards) break;
    }
    return cards;
}

function topTerms(text) {
    const terms = qualityTerms.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
    return [...new Set(terms)].slice(0, 10);
}

async function distillWithLlm(docs, { maxCards, warnings, chunksPerBatch = 8, batchChars = 18000 }) {
    const apiKey = process.env.KNOWLEDGE_LLM_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.KNOWLEDGE_LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.KNOWLEDGE_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    if (!apiKey) return localDistill(docs, maxCards);

    const cards = [];
    for (const doc of docs) {
        if (cards.length >= maxCards) break;
        const batches = buildDistillationBatches(doc.chunks, { chunksPerBatch, batchChars });
        for (let batchIndex = 0; batchIndex < batches.length && cards.length < maxCards; batchIndex += 1) {
            const excerpt = batches[batchIndex].join("\n\n---\n\n");
            try {
                const result = await callChatJson({
                    apiKey,
                    baseUrl,
                    model,
                    messages: [
                        {
                            role: "system",
                            content:
                                "你是影视、短剧与 AI 视频生成的版权安全知识蒸馏器。所有知识卡字段必须使用简体中文，只有作品名、人名和无法准确翻译的专有名词可附带原文。只输出原创总结，不要复述原文，不要长引用。只保留权威、可执行、可质检的创作原则。低质量、玄学、标题党内容必须丢弃。",
                        },
                        {
                            role: "user",
                            content: `来源 ID：${doc.id}
来源标题：${doc.title}
来源类别：${doc.category}
来源说明：${doc.note || "无"}
当前批次：${batchIndex + 1}/${batches.length}（来自全书不同位置的代表性章节）

请从下面材料中蒸馏 0-5 条创作知识卡，输出 JSON。没有得到材料充分支持的可执行原则时返回空数组，不要凑数；完整专业书的每批通常可保留 2-5 条。每张卡只解决一个创作判断问题，避免和其他卡重复：
{
  "cards": [
    {
      "title": "短标题",
      "category": "优先沿用来源类别，也可细分为故事与剧本、台词与对白、人物与心理、世界观与设定、导演与表演、视听与分镜、色彩与视觉叙事、声音设计、剪辑与叙事节奏、服装与角色视觉、文化语境与传播（扩展）等中文类别",
                      "principle": "原创总结的一条可执行原则，禁止长引用",
                      "appliesTo": ["适用节点或阶段"],
                      "checks": ["质检问题1", "质检问题2", "质检问题3"],
                      "avoid": ["禁忌1", "禁忌2"],
                      "triggers": ["什么任务或问题出现时应该调用这张卡"],
                      "evidenceSummary": "材料中支持该原则的依据摘要，不引用长原文",
                      "conflicts": ["可能与哪些方法冲突，以及适用边界"]
                    }
                  ]
                }

材料：
${excerpt}`,
                        },
                    ],
                });
                const nextCards = Array.isArray(result.cards) ? result.cards : [];
                const candidates = nextCards.map((card) => ({
                    ...card,
                    sourceIds: [doc.id],
                    layer: doc.layer,
                    scope: doc.scope,
                    status: "candidate",
                    confidence: 0.6,
                    authority: doc.authority,
                }));
                cards.push(...(await independentlyAuditCards(doc, excerpt, candidates, { apiKey, baseUrl, model, warnings })));
            } catch (error) {
                warnings.push(`${doc.title}: 第 ${batchIndex + 1}/${batches.length} 批 LLM 蒸馏失败，保留本地候选索引。${error instanceof Error ? error.message : String(error)}`);
                cards.push(...localDistill([{ ...doc, title: `${doc.title}（第${batchIndex + 1}批）`, chunks: batches[batchIndex] }], 1));
            }
        }
    }
    return cards.slice(0, maxCards);
}

function buildDistillationBatches(chunks, { chunksPerBatch = 8, batchChars = 18000 } = {}) {
    const batches = [];
    let current = [];
    let chars = 0;
    for (const chunk of chunks) {
        const nextLength = String(chunk || "").length;
        if (current.length && (current.length >= chunksPerBatch || chars + nextLength > batchChars)) {
            batches.push(current);
            current = [];
            chars = 0;
        }
        current.push(chunk);
        chars += nextLength;
    }
    if (current.length) batches.push(current);
    return batches;
}

async function independentlyAuditCards(doc, excerpt, candidates, { apiKey, baseUrl, model, warnings }) {
    if (!candidates.length) return [];
    try {
        const result = await callChatJson({
            apiKey,
            baseUrl,
            model,
            messages: [
                {
                    role: "system",
                    content:
                        "你是独立知识审计员，不参与第一轮蒸馏。所有输出字段必须使用简体中文，只有作品名、人名和无法准确翻译的专有名词可附带原文。不要因为来源标题、作者名或候选卡写得像专业术语就放行。只检查材料是否真正支持原则、原则是否可执行、是否过度泛化、是否说明适用边界。",
                },
                {
                    role: "user",
                    content: `来源：${doc.title}
来源可靠度先验：${doc.authority}

请对候选卡逐条审核，输出 JSON：
{
  "assessments": [
    {
      "index": 0,
      "keep": true,
      "confidence": 0.0,
      "evidenceSummary": "材料如何支持该原则的简短原创摘要",
      "conflicts": ["适用边界或冲突"],
      "reason": "放行或拒绝原因"
    }
  ]
}

候选卡：
${JSON.stringify(candidates, null, 2)}

材料：
${excerpt.slice(0, 18000)}`,
                },
            ],
        });
        const assessments = Array.isArray(result.assessments) ? result.assessments : [];
        const byIndex = new Map(assessments.map((item) => [Number(item.index), item]));
        return candidates.map((card, index) => {
            const assessment = byIndex.get(index) || {};
            const confidence = normalizeScore(assessment.confidence, 0.5);
            const keep = assessment.keep === true;
            return {
                ...card,
                status: !keep ? "rejected" : doc.verified ? "verified" : confidence >= 0.78 && doc.authority >= 0.6 ? "auto_verified" : "candidate",
                confidence,
                evidenceSummary: cleanField(assessment.evidenceSummary) || cleanField(card.evidenceSummary),
                conflicts: cleanList(assessment.conflicts).length ? cleanList(assessment.conflicts) : cleanList(card.conflicts),
                auditReason: cleanField(assessment.reason),
            };
        });
    } catch (error) {
        warnings.push(`${doc.title}: 独立知识审核失败，候选卡不会自动进入正式库。${error instanceof Error ? error.message : String(error)}`);
        return candidates;
    }
}

async function callChatJson({ apiKey, baseUrl, model, messages }) {
    let response;
    try {
        response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ model, messages, temperature: 0.2 }),
        });
    } catch (error) {
        const cause = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause ? ` (${error.cause.code})` : "";
        throw new Error(`LLM 请求失败：${error instanceof Error ? error.message : String(error)}${cause}`);
    }
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "";
    return parseJsonFromText(content);
}

function parseJsonFromText(text) {
    const trimmed = String(text || "").trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const raw = fenced || trimmed;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("LLM 没有返回 JSON");
    return JSON.parse(raw.slice(start, end + 1));
}

function auditCards(cards, { documents = [], review = { approved: [], rejected: [] } } = {}) {
    const seen = new Set();
    const out = [];
    const sourceMap = new Map(documents.map((doc) => [doc.id, doc]));
    const approved = new Set(review.approved || []);
    const rejected = new Set(review.rejected || []);
    for (const card of cards) {
        const title = cleanField(card.title).slice(0, 60);
        const principle = cleanField(card.principle).slice(0, 360);
        const category = cleanField(card.category) || categoryFallback;
        if (!title || principle.length < 20 || !containsHan(title) || !containsHan(principle) || !containsHan(category)) continue;
        if (lowQualityTerms.some((term) => title.includes(term) || principle.includes(term))) continue;
        const sourceIds = cleanList(card.sourceIds).slice(0, 5);
        const key = `${sourceIds.join("|")}|${title}|${principle.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sources = sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
        const id = stableId(`${title}|${principle}|${sourceIds.join("|")}`);
        let status = normalizeStatus(card.status);
        if (sources.some((source) => source.verified)) status = "verified";
        if (approved.has(id)) status = "verified";
        if (rejected.has(id)) status = "rejected";
        if (status === "rejected") continue;
        out.push({
            id,
            title,
            category,
            principle,
            appliesTo: cleanList(card.appliesTo).slice(0, 5),
            checks: cleanList(card.checks).slice(0, 5),
            avoid: cleanList(card.avoid).slice(0, 4),
            sourceIds,
            layer: normalizeLayer(card.layer || sources[0]?.layer),
            scope: normalizeKnowledgeScope(card.scope || sources[0]?.scope),
            status,
            confidence: normalizeScore(card.confidence, status === "candidate" ? 0.5 : 0.78),
            authority: normalizeScore(card.authority, sources.length ? sources.reduce((sum, source) => sum + source.authority, 0) / sources.length : 0.65),
            triggers: cleanList(card.triggers).slice(0, 8),
            evidenceSummary: cleanField(card.evidenceSummary).slice(0, 280),
            conflicts: cleanList(card.conflicts).slice(0, 5),
            auditReason: cleanField(card.auditReason).slice(0, 240),
        });
    }
    return out;
}

function containsHan(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
}

function limitCardsBySource(cards, documents, limit) {
    if (cards.length <= limit) return cards;
    const groups = new Map(documents.map((document) => [document.id, []]));
    for (const card of cards) {
        const sourceId = card.sourceIds[0] || "other";
        if (!groups.has(sourceId)) groups.set(sourceId, []);
        groups.get(sourceId).push(card);
    }
    const output = [];
    while (output.length < limit && [...groups.values()].some((group) => group.length)) {
        for (const group of groups.values()) {
            if (output.length >= limit) break;
            const card = group.shift();
            if (card) output.push(card);
        }
    }
    return output;
}

function cleanField(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .replace(/[“”"「」]/g, "")
        .trim();
}

function cleanList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(cleanField).filter(Boolean);
}

function normalizeLayer(value) {
    return value === "project" || value === "public" || value === "model" ? value : "private";
}

function normalizeKnowledgeScope(value) {
    return value === "core" || value === "extension" || value === "corroboration" ? value : "specialist";
}

function normalizeStatus(value) {
    return value === "verified" || value === "auto_verified" || value === "rejected" ? value : "candidate";
}

function normalizeScore(value, fallback) {
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : fallback;
}

async function writeGeneratedPack(outputFile, { cards, sources, mode }) {
    const activeCards = cards.filter((card) => card.status === "verified");
    const context = renderKnowledgeContext(activeCards, sources);
    const meta = {
        generatedAt: new Date().toISOString(),
        sourceCount: sources.length,
        cardCount: cards.length,
        activeCardCount: cards.filter((card) => card.status === "verified").length,
        independentlyReviewedCardCount: cards.filter((card) => card.status === "auto_verified").length,
        candidateCardCount: cards.filter((card) => card.status === "candidate" || card.status === "auto_verified").length,
        mode,
        sources: sources.map((source) => ({
            id: source.id,
            title: source.title,
            category: source.category,
            kind: source.kind,
            layer: source.layer,
            scope: source.scope,
            workId: source.workId,
            language: source.language,
            authority: source.authority,
            verified: source.verified,
        })),
    };
    const content = `// Generated by scripts/ingest-creative-knowledge.mjs. Do not edit manually.
export const CREATIVE_IMPORTED_KNOWLEDGE_CONTEXT = ${JSON.stringify(context, null, 4)};

export const CREATIVE_IMPORTED_KNOWLEDGE_CARDS = ${JSON.stringify(cards, null, 4)} as const;

export const CREATIVE_IMPORTED_KNOWLEDGE_META = ${JSON.stringify(meta, null, 4)} as const;
`;
    await fs.writeFile(outputFile, content, "utf8");
}

function renderKnowledgeContext(cards, sources) {
    if (!cards.length) return "";
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const sourceLines = sources.map((source, index) => `${index + 1}. ${source.title}（${source.category}，${source.kind}）`).join("\n");
    const cardLines = cards
        .map((card, index) => {
            const sourceTitles = card.sourceIds
                .map((id) => sourceMap.get(id)?.title)
                .filter(Boolean)
                .join("；");
            return `${index + 1}. ${card.title}｜${card.category}
- 原则：${card.principle}
- 适用：${card.appliesTo.join("；") || "创作与质检"}
- 检查：${card.checks.join("；") || "是否可执行、可拍、可生成、可传播"}
- 禁忌：${card.avoid.join("；") || "空泛、照搬、不可执行"}
- 来源：${sourceTitles || card.sourceIds.join("；")}`;
        })
        .join("\n\n");
    return `使用规则：
- 这是用户导入资料蒸馏出的创作知识包，只能作为内部创作判断和质检依据。
- 不要声称拥有完整原书/字幕，不要输出长段原文；需要引用时只概述原则和来源标题。
- 优先用于故事、剧本、导演、分镜、色彩、声音、AI视频生成和上线质检。

来源概览：
${sourceLines}

知识卡：
${cardLines}`;
}

async function writeReport(reportFile, data) {
    await fs.writeFile(reportFile, JSON.stringify(data, null, 2), "utf8");
    return writeReadableKnowledgeReports(reportFile, data);
}

function stableId(value) {
    let hash = 2166136261;
    for (const ch of value) {
        hash ^= ch.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `src_${(hash >>> 0).toString(16)}`;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });
}

export {
    allowedExts,
    appRoot,
    callChatJson,
    cleanField,
    cleanList,
    cleanText,
    collectSourceSpecs,
    buildDistillationBatches,
    extractEpub,
    inferCategory,
    loadSource,
    normalizeLayer,
    normalizeKnowledgeScope,
    normalizeEpubRange,
    normalizeScore,
    normalizeStatus,
    parseArgs,
    parseReviewedCards,
    pathExists,
    resolveCommand,
    selectPdfPageNumbers,
    selectEpubPaths,
    selectKnowledgeChunks,
    sourceSpecKey,
    stableId,
    walkFiles,
    writeGeneratedPack,
};
