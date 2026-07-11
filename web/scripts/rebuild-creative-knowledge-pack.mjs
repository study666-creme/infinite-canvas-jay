#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRoot, parseArgs, writeGeneratedPack } from "./ingest-creative-knowledge.mjs";

const defaultReportFile = path.join(appRoot, "knowledge", "creative", "creative-knowledge-report.json");
const defaultOutputFile = path.join(appRoot, "src", "app", "(user)", "canvas", "utils", "creative-knowledge-pack.generated.ts");

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const reportFile = path.resolve(appRoot, args.report || defaultReportFile);
    const outputFile = path.resolve(appRoot, args.output || defaultOutputFile);
    const report = JSON.parse(await fs.readFile(reportFile, "utf8"));
    const cards = Array.isArray(report.cards) ? report.cards : [];
    const sources = Array.isArray(report.sources) ? report.sources : [];

    await writeGeneratedPack(outputFile, { cards, sources, mode: "user-confirmation-gated" });
    console.log(`Sources: ${sources.length}`);
    console.log(`Cards: ${cards.length}`);
    console.log(`User-confirmed: ${cards.filter((card) => card.status === "verified").length}`);
    console.log(`Generated: ${outputFile}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });
}
