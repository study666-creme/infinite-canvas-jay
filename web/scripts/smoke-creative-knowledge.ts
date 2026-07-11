import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { inspectPrivateCanvasContext, privateCanvasContextStatus } from "../../canvas-agent/src/private-context.js";

type SmokeScenario = { name: string; prompt: string; minHits?: number; maxHits?: number; expectedTitles?: string[] };
type SmokeConfig = { expectedActiveCardCount?: number; scenarios?: SmokeScenario[] };

const configFile = path.resolve(process.env.CANVAS_AGENT_PRIVATE_SMOKE_SCENARIOS || path.join(process.cwd(), "knowledge", "creative", "retrieval-smoke-scenarios.json"));
let config: SmokeConfig;
try {
    config = JSON.parse(await fs.readFile(configFile, "utf8")) as SmokeConfig;
} catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log(`Private knowledge smoke skipped: no local scenario file at ${configFile}`);
        process.exit(0);
    }
    throw error;
}

const scenarios = Array.isArray(config.scenarios) ? config.scenarios : [];
assert.ok(scenarios.length > 0, "私有检索场景文件没有有效场景");
const status = privateCanvasContextStatus();
assert.equal(status.enabled, true, "本机私有扩展未启用");
assert.equal(status.knowledgeLoaded, true, "本机私有知识报告未加载");
if (config.expectedActiveCardCount !== undefined) assert.equal(status.activeCardCount, config.expectedActiveCardCount);

const auditScenarios = [];
for (const scenario of scenarios) {
    const result = inspectPrivateCanvasContext(scenario.prompt);
    const minHits = Math.max(0, scenario.minHits ?? 1);
    const maxHits = Math.max(minHits, Math.min(5, scenario.maxHits ?? 5));
    assert.equal(result.relevant, true, `${scenario.name} 没有启用相关私有上下文`);
    assert.ok(result.hits.length >= minHits && result.hits.length <= maxHits, `${scenario.name} 应召回 ${minHits}-${maxHits} 张，实际 ${result.hits.length} 张`);
    assert.equal(new Set(result.hits.map((hit) => hit.id)).size, result.hits.length, `${scenario.name} 召回了重复卡`);
    assert.ok(result.hits.every((hit) => hit.matchedTerms.length > 0 && hit.sources.length > 0), `${scenario.name} 缺少可解释命中信息`);
    for (const title of scenario.expectedTitles || []) assert.ok(result.hits.some((hit) => hit.title === title), `${scenario.name} 未命中预期卡：${title}`);
    auditScenarios.push({ name: scenario.name, prompt: scenario.prompt, hits: result.hits });
    console.log(`${scenario.name}: ${result.hits.map((hit) => hit.title).join(" | ")}`);
}

const reportFile = path.join(process.cwd(), "knowledge", "creative", ".tmp", "creative-knowledge-retrieval-audit.json");
await fs.mkdir(path.dirname(reportFile), { recursive: true });
await fs.writeFile(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), privateExtension: status, scenarios: auditScenarios }, null, 2), "utf8");
console.log(`Private knowledge smoke passed: ${scenarios.length} scenarios, ${status.activeCardCount} active cards.`);
console.log(`Audit report: ${reportFile}`);
