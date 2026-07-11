#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseSummary, defaultCreativeLibraryDbFile, openCreativeLibraryDb, replaceKnowledgeSnapshot } from "./creative-library-db.mjs";
import { appRoot, parseArgs, writeGeneratedPack } from "./ingest-creative-knowledge.mjs";
import { writeReadableKnowledgeReports } from "./render-creative-knowledge-report.mjs";

const defaultReportFile = path.join(appRoot, "knowledge", "creative", "creative-knowledge-report.json");
const defaultReviewFile = path.join(appRoot, "knowledge", "creative", "review.json");
const defaultOutputFile = path.join(appRoot, "src", "app", "(user)", "canvas", "utils", "creative-knowledge-pack.generated.ts");
const defaultReadableMarkdown = path.join(appRoot, "knowledge", "creative", "知识卡-正式库可读版.md");
const defaultReadableHtml = path.join(appRoot, "knowledge", "creative", "知识卡-正式库可读版.html");

function uniqueById(items, label) {
    const output = new Map();
    for (const item of items) {
        if (!item?.id) throw new Error(`${label}缺少 id`);
        const existing = output.get(item.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(item)) throw new Error(`${label} ID 冲突：${item.id}`);
        output.set(item.id, item);
    }
    return [...output.values()];
}

function assertNoExactCardDuplicates(cards) {
    for (const field of ["title", "principle"]) {
        const seen = new Map();
        for (const card of cards) {
            const value = String(card[field] || "").trim();
            const existing = seen.get(value);
            if (value && existing && existing !== card.id) throw new Error(`知识卡${field === "title" ? "标题" : "原则"}重复：${value}`);
            if (value) seen.set(value, card.id);
        }
    }
}

function sameSet(left, right) {
    return left.size === right.size && [...left].every((value) => right.has(value));
}

async function readJson(file, fallback = undefined) {
    try {
        return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
        if (fallback !== undefined && error?.code === "ENOENT") return fallback;
        throw error;
    }
}

async function copyIfExists(source, destination) {
    try {
        await fs.copyFile(source, destination);
        return true;
    } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args["confirmed-by-user"]) throw new Error("正式入库必须显式传入 --confirmed-by-user");
    if (!args["add-report"]) throw new Error("缺少 --add-report 待合并审核报告");

    const reportFile = path.resolve(appRoot, args.report || defaultReportFile);
    const addReportFile = path.resolve(appRoot, args["add-report"]);
    const reviewFile = path.resolve(appRoot, args.review || defaultReviewFile);
    const outputFile = path.resolve(appRoot, args.output || defaultOutputFile);
    const dbFile = path.resolve(args.db || defaultCreativeLibraryDbFile);
    const readableMarkdown = path.resolve(appRoot, args.markdown || defaultReadableMarkdown);
    const readableHtml = path.resolve(appRoot, args.html || defaultReadableHtml);
    const base = await readJson(reportFile);
    const addition = await readJson(addReportFile);

    const sources = uniqueById([...(base.sources || []), ...(addition.sources || [])], "知识来源");
    const cards = uniqueById(
        [...(base.cards || []), ...(addition.cards || [])].filter((card) => card.status !== "rejected").map((card) => ({ ...card, status: "verified" })),
        "知识卡",
    );
    assertNoExactCardDuplicates(cards);
    const sourceIds = new Set(sources.map((source) => source.id));
    for (const card of cards) {
        const missingSource = (card.sourceIds || []).find((sourceId) => !sourceIds.has(sourceId));
        if (missingSource) throw new Error(`知识卡 ${card.id} 引用了不存在的来源 ${missingSource}`);
    }

    const opened = openCreativeLibraryDb(dbFile);
    const existingSourceIds = new Set(
        opened.db
            .prepare("SELECT id FROM library_sources WHERE library_type = 'knowledge'")
            .all()
            .map((row) => row.id),
    );
    const existingCardIds = new Set(
        opened.db
            .prepare("SELECT id FROM knowledge_cards")
            .all()
            .map((row) => row.id),
    );
    const baseSourceIds = new Set((base.sources || []).map((source) => source.id));
    const baseCardIds = new Set((base.cards || []).map((card) => card.id));
    if (!sameSet(existingSourceIds, baseSourceIds) || !sameSet(existingCardIds, baseCardIds)) {
        opened.db.close();
        throw new Error("主 SQLite 与基础报告内容不一致，已停止入库以避免覆盖未知知识");
    }
    opened.db.exec("PRAGMA wal_checkpoint(FULL)");
    opened.db.close();

    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const backupRoot = path.join(process.env.LOCALAPPDATA || appRoot, "InfiniteCanvas", "knowledge-review", "promotions", stamp);
    await fs.mkdir(backupRoot, { recursive: true });
    await copyIfExists(dbFile, path.join(backupRoot, "creative-library.sqlite"));
    await copyIfExists(reportFile, path.join(backupRoot, "creative-knowledge-report.json"));
    await copyIfExists(reviewFile, path.join(backupRoot, "review.json"));
    await copyIfExists(outputFile, path.join(backupRoot, "creative-knowledge-pack.generated.ts"));

    const promoted = openCreativeLibraryDb(dbFile);
    replaceKnowledgeSnapshot(promoted.db, { sources, cards });
    const summary = databaseSummary(promoted.db);
    promoted.db.close();

    const existingReview = await readJson(reviewFile, { approved: [], rejected: [] });
    const approved = cards.map((card) => card.id);
    const rejected = [...new Set((existingReview.rejected || []).filter((id) => !approved.includes(id)))];
    const report = { sources, cards, warnings: [...new Set([...(base.warnings || []), ...(addition.warnings || [])])] };
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
    await fs.writeFile(reviewFile, JSON.stringify({ approved, rejected, confirmedAt: new Date().toISOString(), confirmation: "user-confirmed-all" }, null, 2), "utf8");
    await writeGeneratedPack(outputFile, { cards, sources, mode: "user-confirmed" });
    await writeReadableKnowledgeReports(reportFile, report, {
        title: `正式创作知识库：${cards.length} 张已确认知识卡`,
        markdownFile: readableMarkdown,
        htmlFile: readableHtml,
    });

    await fs.writeFile(path.join(backupRoot, "promotion-result.json"), JSON.stringify({ sources: sources.length, cards: cards.length, summary, reportFile, addReportFile, dbFile, outputFile }, null, 2), "utf8");
    console.log(`Sources: ${sources.length}`);
    console.log(`Cards: ${cards.length}`);
    console.log(`Active: ${summary.activeCards}`);
    console.log(`Backup: ${backupRoot}`);
    console.log(`Report: ${reportFile}`);
    console.log(`Readable: ${readableHtml}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });
}
