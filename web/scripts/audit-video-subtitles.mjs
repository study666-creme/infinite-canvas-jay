#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSubtitleCues } from "./export-creative-knowledge-chunks.mjs";
import { appRoot, parseArgs } from "./ingest-creative-knowledge.mjs";

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputDir = path.resolve(appRoot, args.input || path.join("knowledge", "creative", "raw"));
    const outputFile = path.resolve(appRoot, args.output || path.join("knowledge", "creative", ".tmp", "subtitle-quality-report.json"));
    const expected = Number(args.expected || 0) || 0;
    const entries = await fs.readdir(inputDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".srt")).map((entry) => entry.name).sort();
    const items = [];
    for (const filename of files) {
        const text = await fs.readFile(path.join(inputDir, filename), "utf8");
        items.push(analyzeSubtitle({ filename, text }));
    }
    const statusCounts = Object.fromEntries([...new Set(items.map((item) => item.status))].sort().map((status) => [status, items.filter((item) => item.status === status).length]));
    const report = {
        generatedAt: new Date().toISOString(),
        inputDir,
        expectedCount: expected || null,
        completeFileCount: items.length,
        countMatchesExpectation: expected ? items.length === expected : null,
        statusCounts,
        items,
    };
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`字幕质检完成：${items.length} 份。${Object.entries(statusCounts).map(([status, count]) => `${status}=${count}`).join("，")}`);
    console.log(`报告：${outputFile}`);
    if (expected && items.length !== expected) process.exitCode = 2;
}

function analyzeSubtitle({ filename, text }) {
    const cues = parseSubtitleCues(text);
    const characters = cues.reduce((sum, cue) => sum + cue.text.replace(/\s/g, "").length, 0);
    const firstStartSeconds = cues.length ? roundSeconds(cues[0].startMs) : null;
    const lastEndSeconds = cues.length ? roundSeconds(cues.at(-1).endMs) : null;
    let maxGapMs = 0;
    let maxCueDurationMs = 0;
    const visualDependencies = [];
    for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        maxCueDurationMs = Math.max(maxCueDurationMs, cue.endMs - cue.startMs);
        if (index > 0) maxGapMs = Math.max(maxGapMs, cue.startMs - cues[index - 1].endMs);
        if (/看(?:图|图片|视频|画面)|如下(?:图|视频|画面)|几张图片|播放一段/.test(cue.text)) {
            visualDependencies.push({ start: formatTime(cue.startMs), end: formatTime(cue.endMs), text: cue.text.slice(0, 120) });
        }
    }
    const durationMinutes = lastEndSeconds ? lastEndSeconds / 60 : 0;
    const charactersPerMinute = durationMinutes ? Math.round(characters / durationMinutes) : 0;
    const flags = [];
    if (!cues.length) flags.push("empty_or_invalid_srt");
    if (cues.length < 3 || characters < 200) flags.push("too_little_text");
    if (firstStartSeconds !== null && firstStartSeconds > 30) flags.push("late_first_cue");
    if (maxGapMs > 90_000) flags.push("large_silent_or_visual_gap");
    if (maxCueDurationMs > 30_000) flags.push("very_long_cue");
    if (durationMinutes >= 2 && charactersPerMinute < 25) flags.push("low_text_density");
    if (visualDependencies.length) flags.push("visual_dependency");
    const quarantined = flags.includes("empty_or_invalid_srt") || flags.includes("too_little_text");
    const status = quarantined ? "quarantined" : flags.length ? "needs_review" : "candidate_ready";
    return {
        filename,
        videoId: filename.match(/\[(BV[0-9A-Za-z]+)\]/i)?.[1] || "",
        status,
        flags,
        cueCount: cues.length,
        characters,
        charactersPerMinute,
        firstStartSeconds,
        lastEndSeconds,
        maxGapSeconds: roundSeconds(maxGapMs),
        maxCueDurationSeconds: roundSeconds(maxCueDurationMs),
        visualDependencies,
        coverageNote: "未读取原视频总时长；lastEndSeconds 只能表示字幕末端，不能单独证明完整覆盖。",
    };
}

function roundSeconds(milliseconds) {
    return Math.round((milliseconds / 1000) * 100) / 100;
}

function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun)
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });

export { analyzeSubtitle };
