import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CREATIVE_IMPORTED_KNOWLEDGE_META } from "../src/app/(user)/canvas/utils/creative-knowledge-pack.generated";
import { buildCreativeAgentKnowledgeContext, explainCreativeKnowledgeRetrieval, retrieveCreativeKnowledgeCards } from "../src/app/(user)/canvas/utils/short-drama-agent-prompt";

const scenarios = [
    {
        name: "人物视角衔接",
        mode: "short_drama" as const,
        prompt: "检查第一人称或第三人称限知叙事里的感知与反应链，避免人物知道不该知道的信息。",
    },
    {
        name: "世界观规则",
        mode: "short_drama" as const,
        prompt: "为仙侠短剧建立可执行的世界规则、资源限制和跨集冲突，不要只堆设定名词。",
    },
    {
        name: "声音叙事",
        mode: "general" as const,
        prompt: "设计一部无对白短片的声音桥、主观听点、环境声和音乐进入时机。",
    },
    {
        name: "演员调度",
        mode: "general" as const,
        prompt: "检查双人对话场景的演员调度、走位、空间关系、对白重叠和即时反应。",
    },
    {
        name: "服装与色彩",
        mode: "short_drama" as const,
        prompt: "按角色弧光设计服装轮廓、色彩、材质和表面处理，并控制制作预算。",
    },
];

assert.equal(CREATIVE_IMPORTED_KNOWLEDGE_META.cardCount, 173);
assert.equal(CREATIVE_IMPORTED_KNOWLEDGE_META.activeCardCount, 173);
const auditScenarios = [];

for (const scenario of scenarios) {
    const cards = retrieveCreativeKnowledgeCards(scenario.prompt, scenario.mode, 5);
    const imported = cards.filter((card) => !card.sourceIds.includes("built-in-core"));
    assert.ok(cards.length > 0 && cards.length <= 5, `${scenario.name} 没有按 1-5 张预算召回`);
    assert.equal(new Set(cards.map((card) => card.id)).size, cards.length, `${scenario.name} 召回了重复卡`);
    assert.ok(
        cards.every((card) => card.status === "verified"),
        `${scenario.name} 召回了未确认卡`,
    );
    assert.ok(imported.length > 0, `${scenario.name} 没有命中本次导入知识`);

    const context = buildCreativeAgentKnowledgeContext(scenario.prompt, scenario.mode, 5);
    assert.match(context, new RegExp(imported[0].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const explanation = explainCreativeKnowledgeRetrieval(scenario.prompt, scenario.mode, 5);
    assert.equal(explanation.length, cards.length);
    assert.ok(
        explanation.every((hit) => hit.matchedTerms.length > 0 && hit.sources.length > 0),
        `${scenario.name} 缺少可解释命中信息`,
    );
    auditScenarios.push({ ...scenario, hits: explanation });
    console.log(`${scenario.name}: ${cards.map((card) => card.title).join(" | ")}`);
}

const reportFile = path.join(process.cwd(), "knowledge", "creative", ".tmp", "creative-knowledge-retrieval-audit.json");
await fs.mkdir(path.dirname(reportFile), { recursive: true });
await fs.writeFile(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), activeImportedCards: CREATIVE_IMPORTED_KNOWLEDGE_META.activeCardCount, scenarios: auditScenarios }, null, 2), "utf8");
console.log(`Knowledge smoke passed: ${scenarios.length} scenarios, ${CREATIVE_IMPORTED_KNOWLEDGE_META.activeCardCount} active imported cards.`);
console.log(`Audit report: ${reportFile}`);
