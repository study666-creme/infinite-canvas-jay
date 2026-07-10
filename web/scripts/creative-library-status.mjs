#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseSummary, openCreativeLibraryDb } from "./creative-library-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const { db, file } = openCreativeLibraryDb();
const summary = databaseSummary(db);
const recentFailures = db
    .prepare(`
        SELECT job_type, source_key, error_message, finished_at
        FROM ingest_jobs
        WHERE status = 'failed'
        ORDER BY id DESC
        LIMIT 10
    `)
    .all();

console.log(`SQLite: ${path.relative(appRoot, file)}`);
console.table({
    "知识来源": summary.knowledgeSources,
    "正式知识卡": summary.activeCards,
    "候选/全部知识卡": summary.cards,
    "故事案例来源": summary.caseSources,
    "正式故事案例": summary.activeCases,
    "候选/全部故事案例": summary.cases,
    "进行中任务": summary.queuedJobs,
    "失败任务": summary.failedJobs,
});
if (recentFailures.length) {
    console.log("最近失败任务：");
    console.table(recentFailures);
}
db.close();
