#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import {
    contentHash,
    databaseSummary,
    finishIngestJob,
    openCreativeLibraryDb,
    readCachedSource,
    readKnowledgeCardsForSource,
    replaceKnowledgeCardsForSource,
    startIngestJob,
    upsertLibrarySource,
} from "./creative-library-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const defaultInputDir = path.join(appRoot, "knowledge", "creative", "raw");
const defaultManifest = path.join(appRoot, "knowledge", "creative", "sources.json");
const defaultOutputFile = path.join(appRoot, "src", "app", "(user)", "canvas", "utils", "creative-knowledge-pack.generated.ts");
const defaultReportFile = path.join(appRoot, "knowledge", "creative", "creative-knowledge-report.json");
const defaultReviewFile = path.join(appRoot, "knowledge", "creative", "review.json");

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
    const maxChunksPerSource = numberArg(args["max-chunks-per-source"], 16);
    const useLlm = !args.local && Boolean(args.llm || process.env.KNOWLEDGE_LLM_API_KEY || process.env.OPENAI_API_KEY);
    const ingestMode = useLlm ? "llm" : "local";
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
        const sourceKey = spec.path || spec.url;
        const jobId = startIngestJob(db, { jobType: "knowledge", sourceKey, sourcePath: spec.path || "" });
        try {
            const doc = await loadSource(spec);
            if (doc.text.trim().length < 300) {
                warnings.push(`${doc.title}: 文本太短，已跳过`);
                finishIngestJob(db, jobId, { status: "failed", error: "文本少于 300 字" });
                continue;
            }
            documents.push({ ...doc, contentHash: contentHash(cleanText(doc.text)), jobId });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`${spec.title || spec.path || spec.url}: ${message}`);
            finishIngestJob(db, jobId, { status: "failed", error: message });
        }
    }

    const prepared = [];
    for (const doc of documents) {
        const chunks = selectKnowledgeChunks(cleanText(doc.text), maxChunksPerSource);
        if (!chunks.length) {
            warnings.push(`${doc.title}: 没有提取到足够相关的知识段落，已保留为失败任务等待资料调整`);
            finishIngestJob(db, doc.jobId, { status: "failed", error: "没有提取到足够相关的知识段落" });
            continue;
        }
        prepared.push({ ...doc, chunks });
    }
    const review = await readReviewFile(reviewFile);
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
                const distilled = useLlm ? await distillWithLlm([doc], { maxCards, warnings }) : localDistill([doc], maxCards);
                sourceCards = auditCards(distilled, { documents: [doc], review });
                const failed = warnings.slice(warningCount).some((warning) => warning.startsWith(`${doc.title}:`) && /失败/.test(warning));
                upsertLibrarySource(db, doc, { libraryType: "knowledge", hash: doc.contentHash, ingestMode, status: failed ? "failed" : "completed", error: failed ? warnings.at(-1) : "" });
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
    const cards = auditCards(rawCards, { documents: prepared, review }).slice(0, maxCards);
    const sources = prepared.map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, kind: doc.kind, source: doc.source, layer: doc.layer, authority: doc.authority, verified: doc.verified, chars: doc.text.length, chunks: doc.chunks.length }));

    const mode = useLlm ? (warnings.some((warning) => warning.includes("LLM 蒸馏失败")) ? "mixed" : "llm-distilled") : "local-indexed";
    await writeGeneratedPack(outputFile, { cards, sources, mode });
    await writeReport(reportFile, { sources, cards, warnings });

    console.log(`Creative knowledge ingest complete.`);
    console.log(`Sources: ${sources.length}`);
    console.log(`Cards: ${cards.length}`);
    console.log(`Generated: ${path.relative(appRoot, outputFile)}`);
    console.log(`Report: ${path.relative(appRoot, reportFile)}`);
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
                path: path.resolve(path.dirname(manifestFile), entry.path),
                title: entry.title,
                category: entry.category,
                note: entry.note,
                layer: normalizeLayer(entry.layer),
                authority: normalizeScore(entry.authority, 0.7),
                verified: entry.verified === true,
            });
        }
    }
    if (Array.isArray(manifest.urls)) {
        for (const entry of manifest.urls) {
            if (!entry?.url) continue;
            specs.push({ type: "url", url: entry.url, title: entry.title, category: entry.category, note: entry.note, layer: normalizeLayer(entry.layer || "public"), authority: normalizeScore(entry.authority, 0.65), verified: entry.verified === true });
        }
    }
    if (!specs.length && (await pathExists(inputDir))) {
        const files = await walkFiles(inputDir);
        for (const file of files) {
            if (allowedExts.has(path.extname(file).toLowerCase())) specs.push({ type: "file", path: file, layer: "private", authority: 0.7, verified: false });
        }
    }
    return specs;
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
        id: stableId(spec.url),
        title,
        category: spec.category || inferCategory(`${title}\n${text}`),
        kind: "url",
        source: spec.url,
        layer: normalizeLayer(spec.layer || "public"),
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
    else if (ext === ".epub") text = await extractEpub(file);
    else if ([".mobi", ".azw", ".azw3"].includes(ext)) text = await convertWithCalibre(file);
    else if (ext === ".pdf") text = await extractPdf(file);
    else throw new Error(`不支持的文件类型：${ext}`);
    return {
        id: stableId(path.resolve(file)),
        title,
        category: spec.category || inferCategory(`${title}\n${text}`),
        kind: ext.slice(1) || "file",
        source: path.relative(appRoot, file).replaceAll("\\", "/"),
        layer: normalizeLayer(spec.layer),
        authority: normalizeScore(spec.authority, 0.7),
        verified: spec.verified === true,
        note: cleanField(spec.note),
        text,
    };
}

async function extractEpub(file) {
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
    return htmlPaths.map((entry) => stripHtml(readEntry(entry))).join("\n\n");
}

function matchAttr(tag, attr) {
    const re = new RegExp(`${attr}=["']([^"']+)["']`, "i");
    return tag.match(re)?.[1] || "";
}

async function extractPdf(file) {
    const pdftotext = resolveCommand("pdftotext");
    if (pdftotext) {
        const result = spawnSync(pdftotext, ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
        const text = normalizePdfText(result.stdout || "");
        if (result.status === 0 && isUsablePdfText(text)) return text;
    }
    try {
        const ocrText = await ocrPdf(file);
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

async function ocrPdf(file) {
    const pdftoppm = resolveCommand("pdftoppm");
    const pdfinfo = resolveCommand("pdfinfo");
    const tesseract = resolveCommand("tesseract");
    if (!pdftoppm || !pdfinfo || !tesseract) throw new Error("缺少 pdftoppm、pdfinfo 或 Tesseract");
    const info = spawnSync(pdfinfo, [file], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/im)?.[1]);
    if (info.status !== 0 || !Number.isFinite(pages) || pages < 1) throw new Error(info.stderr || "无法读取 PDF 页数");
    const tessdataDir = path.join(appRoot, "data", "tessdata");
    const hasChinese = fsSync.existsSync(path.join(tessdataDir, "chi_sim.traineddata"));
    const hasEnglish = fsSync.existsSync(path.join(tessdataDir, "eng.traineddata"));
    const language = [hasChinese ? "chi_sim" : "", hasEnglish ? "eng" : ""].filter(Boolean).join("+") || "eng";
    const tmpDir = path.join(appRoot, "knowledge", "creative", ".tmp", `pdf-ocr-${process.pid}-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const output = [];
    try {
        for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
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
            output.push(recognized.stdout);
            await fs.rm(image, { force: true });
        }
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
    return output.join("\n\n");
}

function isUsablePdfText(text) {
    const compact = String(text || "").replace(/\s/g, "");
    if (compact.length < 100) return false;
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
    return result.status === 0 ? result.stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean) || command : "";
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
    return paras
        .map((text, index) => ({ text, index, score: scoreChunk(text) }))
        .filter((item) => item.score > 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .sort((a, b) => a.index - b.index)
        .map((item) => item.text);
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

async function distillWithLlm(docs, { maxCards, warnings }) {
    const apiKey = process.env.KNOWLEDGE_LLM_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.KNOWLEDGE_LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.KNOWLEDGE_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    if (!apiKey) return localDistill(docs, maxCards);

    const cards = [];
    for (const doc of docs) {
        if (cards.length >= maxCards) break;
        const excerpt = doc.chunks.join("\n\n---\n\n").slice(0, 24000);
        try {
            const result = await callChatJson({
                apiKey,
                baseUrl,
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            "你是影视、短剧与 AI 视频生成的版权安全知识蒸馏器。只输出原创总结，不要复述原文，不要长引用。只保留权威、可执行、可质检的创作原则。低质量、玄学、标题党内容必须丢弃。",
                    },
                    {
                        role: "user",
                        content: `来源 ID：${doc.id}
来源标题：${doc.title}
来源类别：${doc.category}

请从下面材料中蒸馏 3-8 条创作知识卡，输出 JSON：
{
  "cards": [
    {
      "title": "短标题",
      "category": "故事与剧本/台词与对白/人物与心理/导演与表演/视听与分镜/剪辑与声音/AI视频生成/短剧与网感/综合创作",
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
                status: "candidate",
                confidence: 0.6,
                authority: doc.authority,
            }));
            cards.push(...(await independentlyAuditCards(doc, excerpt, candidates, { apiKey, baseUrl, model, warnings })));
        } catch (error) {
            warnings.push(`${doc.title}: LLM 蒸馏失败，使用本地索引。${error instanceof Error ? error.message : String(error)}`);
            cards.push(...localDistill([doc], 4));
        }
    }
    return cards.slice(0, maxCards);
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
                        "你是独立知识审计员，不参与第一轮蒸馏。不要因为来源标题、作者名或候选卡写得像专业术语就放行。只检查材料是否真正支持原则、原则是否可执行、是否过度泛化、是否说明适用边界。",
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
        if (!title || principle.length < 20) continue;
        if (lowQualityTerms.some((term) => title.includes(term) || principle.includes(term))) continue;
        const key = `${title}|${principle.slice(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sourceIds = cleanList(card.sourceIds).slice(0, 5);
        const sources = sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
        const id = cleanField(card.id) || stableId(`${title}|${principle}|${sourceIds.join("|")}`);
        let status = normalizeStatus(card.status);
        if (sources.some((source) => source.verified)) status = "verified";
        if (approved.has(id)) status = "verified";
        if (rejected.has(id)) status = "rejected";
        if (status === "rejected") continue;
        out.push({
            id,
            title,
            category: cleanField(card.category) || categoryFallback,
            principle,
            appliesTo: cleanList(card.appliesTo).slice(0, 5),
            checks: cleanList(card.checks).slice(0, 5),
            avoid: cleanList(card.avoid).slice(0, 4),
            sourceIds,
            layer: normalizeLayer(card.layer || sources[0]?.layer),
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

function normalizeStatus(value) {
    return value === "verified" || value === "auto_verified" || value === "rejected" ? value : "candidate";
}

function normalizeScore(value, fallback) {
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : fallback;
}

async function writeGeneratedPack(outputFile, { cards, sources, mode }) {
    const context = renderKnowledgeContext(cards, sources);
    const meta = {
        generatedAt: new Date().toISOString(),
        sourceCount: sources.length,
        cardCount: cards.length,
        activeCardCount: cards.filter((card) => card.status === "verified" || card.status === "auto_verified").length,
        candidateCardCount: cards.filter((card) => card.status === "candidate").length,
        mode,
        sources: sources.map((source) => ({ id: source.id, title: source.title, category: source.category, kind: source.kind, layer: source.layer, authority: source.authority, verified: source.verified })),
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
            const sourceTitles = card.sourceIds.map((id) => sourceMap.get(id)?.title).filter(Boolean).join("；");
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
    inferCategory,
    loadSource,
    normalizeLayer,
    normalizeScore,
    normalizeStatus,
    parseArgs,
    pathExists,
    resolveCommand,
    stableId,
    walkFiles,
};
