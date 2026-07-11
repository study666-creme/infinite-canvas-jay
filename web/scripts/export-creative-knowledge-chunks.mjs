#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRoot, cleanText, collectSourceSpecs, loadSource, parseArgs, pathExists, selectKnowledgeChunks } from "./ingest-creative-knowledge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestFile = path.resolve(appRoot, args.manifest || path.join("knowledge", "creative", "sources.json"));
    const inputDir = path.resolve(appRoot, args.input || path.join("knowledge", "creative", "raw"));
    const outputDir = path.resolve(appRoot, args.output || path.join("data", "creative-knowledge-chunks"));
    const maxChunks = Math.max(1, Number(args["max-chunks"] || 24));
    const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    const specs = await collectSourceSpecs({ inputDir, manifest, manifestFile });
    await fs.mkdir(outputDir, { recursive: true });

    for (let index = 0; index < specs.length; index += 1) {
        const spec = specs[index];
        const outputId = spec.manifestId || `source-${index + 1}`;
        const outputFile = path.join(outputDir, `${outputId}.json`);
        if (!args.force && (await pathExists(outputFile))) {
            console.log(`[${index + 1}/${specs.length}] 复用 ${outputId}`);
            continue;
        }
        console.log(`[${index + 1}/${specs.length}] 提取 ${spec.title || path.basename(spec.path || spec.url)}`);
        const document = await loadSource(spec);
        const extension = spec.path ? path.extname(spec.path).toLowerCase() : "";
        const timestampedSubtitle = extension === ".srt" || extension === ".vtt";
        const chunks = timestampedSubtitle
            ? selectSubtitleKnowledgeChunks(document.text, maxChunks)
            : selectKnowledgeChunks(cleanText(document.text), maxChunks);
        await fs.writeFile(
            outputFile,
            JSON.stringify(
                {
                    sourceId: outputId,
                    title: document.title,
                    category: document.category,
                    note: document.note,
                    layer: document.layer,
                    scope: document.scope,
                    workId: document.workId,
                    language: document.language,
                    authority: document.authority,
                    chunkFormat: timestampedSubtitle ? "timestamped-subtitle" : "plain-text",
                    chunks,
                },
                null,
                2,
            ),
            "utf8",
        );
        console.log(`[${index + 1}/${specs.length}] 完成 ${outputId}：${chunks.length} 个代表分块`);
    }
}

function selectSubtitleKnowledgeChunks(text, limit) {
    const cues = parseSubtitleCues(text);
    if (!cues.length) return selectKnowledgeChunks(cleanText(text), limit);

    const groups = [];
    let current = null;
    for (const cue of cues) {
        if (!current) current = { startMs: cue.startMs, endMs: cue.endMs, parts: [] };
        const nextLength = current.parts.join(" ").length + cue.text.length + 1;
        const nextDuration = cue.endMs - current.startMs;
        if (current.parts.length && (nextLength > 1600 || nextDuration > 120_000)) {
            groups.push(current);
            current = { startMs: cue.startMs, endMs: cue.endMs, parts: [] };
        }
        current.parts.push(cue.text);
        current.endMs = cue.endMs;
    }
    if (current?.parts.length) groups.push(current);

    const selected = evenlySelect(groups, Math.max(1, limit));
    return selected.map(
        (group) =>
            `[${formatSubtitleTime(group.startMs)}-${formatSubtitleTime(group.endMs)}] ${cleanText(group.parts.join(" "))}`,
    );
}

function parseSubtitleCues(text) {
    const blocks = String(text || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
        const lines = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        const timingIndex = lines.findIndex((line) => line.includes("-->"));
        if (timingIndex < 0) continue;
        const [rawStart, rawEnd] = lines[timingIndex].split("-->").map((value) => value.trim().split(/\s+/)[0]);
        const startMs = parseSubtitleTime(rawStart);
        const endMs = parseSubtitleTime(rawEnd);
        const cueText = cleanText(
            lines
                .slice(timingIndex + 1)
                .join(" ")
                .replace(/<[^>]+>/g, " "),
        );
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !cueText) continue;
        cues.push({ startMs, endMs, text: cueText });
    }
    return cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function parseSubtitleTime(value) {
    const match = String(value || "").match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
    if (!match) return Number.NaN;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const milliseconds = Number(String(match[4]).padEnd(3, "0"));
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
}

function formatSubtitleTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function evenlySelect(items, limit) {
    if (items.length <= limit) return items;
    if (limit === 1) return [items[Math.floor(items.length / 2)]];
    const indexes = new Set();
    for (let index = 0; index < limit; index += 1) {
        indexes.add(Math.round((index * (items.length - 1)) / (limit - 1)));
    }
    return [...indexes].sort((a, b) => a - b).map((index) => items[index]);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun)
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });

export { parseSubtitleCues, selectSubtitleKnowledgeChunks };
