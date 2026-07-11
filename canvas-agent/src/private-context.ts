import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type KnowledgeCard = {
    id: string;
    title: string;
    category: string;
    principle: string;
    appliesTo: string[];
    checks: string[];
    avoid: string[];
    triggers: string[];
    sourceIds: string[];
    status: string;
    scope: string;
    layer: string;
    confidence: number;
    authority: number;
};

type KnowledgeReport = { sources: Array<{ id: string; title: string }>; cards: KnowledgeCard[] };
type PrivateContextOptions = { instructionsFile?: string; reportFile?: string; autoDiscover?: boolean; maxCards?: number };
type CachedFile<T> = { file: string; mtimeMs: number; value: T };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultInstructionsFile = path.join(repoRoot, "web", "knowledge", "creative", "agent-context.md");
const defaultReportFile = path.join(repoRoot, "web", "knowledge", "creative", "creative-knowledge-report.json");
let textCache: CachedFile<string> | undefined;
let reportCache: CachedFile<KnowledgeReport> | undefined;

export function privateCanvasContextStatus(options: PrivateContextOptions = {}) {
    const files = resolvePrivateFiles(options);
    const instructions = readText(files.instructionsFile);
    const report = readReport(files.reportFile);
    const activeCards = report?.cards.filter((card) => card.status === "verified") || [];
    return {
        enabled: Boolean(instructions || report),
        instructionsLoaded: Boolean(instructions),
        knowledgeLoaded: Boolean(report),
        sourceCount: report?.sources.length || 0,
        activeCardCount: activeCards.length,
    };
}

export function inspectPrivateCanvasContext(prompt: string, options: PrivateContextOptions = {}) {
    const query = prompt.trim();
    const files = resolvePrivateFiles(options);
    const instructions = parseInstructions(readText(files.instructionsFile));
    const report = readReport(files.reportFile);
    const status = privateCanvasContextStatus(options);
    if (!query || !status.enabled) return { ...status, relevant: false, hits: [], text: "" };
    if (instructions.excludes && safePattern(instructions.excludes).test(query)) return { ...status, relevant: false, hits: [], text: "" };

    const hits = report ? retrieveCards(query, report, privateCardLimit(query, instructions, options.maxCards)) : [];
    const includeInstructions = Boolean(instructions.text && matchesInstructionScope(query, instructions));
    if (!includeInstructions && !hits.length) return { ...status, relevant: false, hits: [], text: "" };
    const sourceTitles = new Map((report?.sources || []).map((source) => [source.id, source.title]));
    const hitDetails = hits.map(({ card, matchedTerms, rankScore }, index) => ({
        rank: index + 1,
        id: card.id,
        title: card.title,
        category: card.category,
        score: Number(rankScore.toFixed(2)),
        confidence: card.confidence,
        matchedTerms,
        sources: card.sourceIds.map((id) => sourceTitles.get(id) || id),
    }));
    const sections = [
        includeInstructions ? `本机私有 Agent 扩展：\n${instructions.text}` : "",
        report
            ? `本机私有知识检索：正式来源 ${report.sources.length} 个，用户已确认卡 ${status.activeCardCount} 张；本轮命中 ${hits.length} 张（最多 5 张，不为凑数打满）。${hits.length ? `\n\n${hits.map(({ card }, index) => renderCard(card, index, sourceTitles)).join("\n\n")}` : "\n本轮没有足够相关的正式卡，请使用项目事实与基础能力，不得伪装命中。"}`
            : "",
    ].filter(Boolean);
    return { ...status, relevant: true, hits: hitDetails, text: sections.join("\n\n") };
}

export function buildPrivateCanvasContext(prompt: string, options: PrivateContextOptions = {}) {
    return inspectPrivateCanvasContext(prompt, options).text;
}

function resolvePrivateFiles(options: PrivateContextOptions) {
    const disabled = /^(?:0|false|off|disabled)$/i.test(String(process.env.CANVAS_AGENT_PRIVATE_CONTEXT || ""));
    if (disabled) return { instructionsFile: "", reportFile: "" };
    const autoDiscover = options.autoDiscover !== false;
    return {
        instructionsFile: configuredPath(options.instructionsFile, process.env.CANVAS_AGENT_PRIVATE_INSTRUCTIONS, autoDiscover ? defaultInstructionsFile : ""),
        reportFile: configuredPath(options.reportFile, process.env.CANVAS_AGENT_PRIVATE_KNOWLEDGE_REPORT, autoDiscover ? defaultReportFile : ""),
    };
}

function configuredPath(explicit: string | undefined, environment: string | undefined, fallback: string) {
    const value = explicit !== undefined ? explicit : environment || fallback;
    return value ? path.resolve(value) : "";
}

function parseInstructions(value: string) {
    const frontmatter = value.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!frontmatter) return { text: value, triggers: "", excludes: "", budgetGroups: "" };
    const field = (name: string) => frontmatter[1].match(new RegExp(`^${name}:\\s*(.+)$`, "im"))?.[1]?.trim() || "";
    return { text: value.slice(frontmatter[0].length).trim(), triggers: field("triggers"), excludes: field("excludes"), budgetGroups: field("budget-groups") };
}

function matchesInstructionScope(query: string, instructions: { triggers: string }) {
    return Boolean(instructions.triggers && safePattern(instructions.triggers).test(query));
}

function privateCardLimit(query: string, instructions: { budgetGroups: string }, requestedMax = 5) {
    const maximum = Math.max(1, Math.min(5, Math.floor(requestedMax)));
    if (!instructions.budgetGroups) return maximum;
    const domains = instructions.budgetGroups.split(";").map((pattern) => pattern.trim()).filter(Boolean).filter((pattern) => safePattern(pattern).test(query)).length;
    const budget = domains <= 1 ? 2 : domains === 2 ? 3 : domains === 3 ? 4 : 5;
    return Math.min(maximum, budget);
}

function safePattern(value: string) {
    try {
        return new RegExp(value, "i");
    } catch {
        return /$a/;
    }
}

function readText(file: string) {
    if (!file || !fs.existsSync(file)) return "";
    const stat = fs.statSync(file);
    if (textCache?.file === file && textCache.mtimeMs === stat.mtimeMs) return textCache.value;
    const value = fs.readFileSync(file, "utf8").trim().slice(0, 24000);
    textCache = { file, mtimeMs: stat.mtimeMs, value };
    return value;
}

function readReport(file: string): KnowledgeReport | undefined {
    if (!file || !fs.existsSync(file)) return undefined;
    const stat = fs.statSync(file);
    if (reportCache?.file === file && reportCache.mtimeMs === stat.mtimeMs) return reportCache.value;
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
        const sources = array(raw.sources).flatMap((value) => {
            const item = record(value);
            const id = text(item.id);
            const title = text(item.title);
            return id && title ? [{ id, title }] : [];
        });
        const cards = array(raw.cards).flatMap(normalizeCard);
        const value = { sources, cards };
        reportCache = { file, mtimeMs: stat.mtimeMs, value };
        return value;
    } catch {
        return undefined;
    }
}

function normalizeCard(value: unknown): KnowledgeCard[] {
    const item = record(value);
    const title = text(item.title);
    const principle = text(item.principle);
    if (!title || !principle) return [];
    return [{
        id: text(item.id) || title,
        title,
        category: text(item.category) || "未分类",
        principle,
        appliesTo: textList(item.appliesTo),
        checks: textList(item.checks),
        avoid: textList(item.avoid),
        triggers: textList(item.triggers),
        sourceIds: textList(item.sourceIds),
        status: text(item.status),
        scope: text(item.scope) || "specialist",
        layer: text(item.layer) || "private",
        confidence: score(item.confidence, 0.5),
        authority: score(item.authority, 0.5),
    }];
}

function retrieveCards(query: string, report: KnowledgeReport, requestedMax = 5) {
    const limit = Math.max(1, Math.min(5, Math.floor(requestedMax)));
    const queryTokens = tokenize(query);
    const scored = report.cards
        .filter((card) => card.status === "verified" && card.scope !== "corroboration")
        .map((card) => {
            const titleTokens = tokenize(`${card.title} ${card.category} ${card.triggers.join(" ")}`);
            const bodyTokens = tokenize(`${card.principle} ${card.appliesTo.join(" ")} ${card.checks.join(" ")}`);
            const titleOverlap = overlap(queryTokens, titleTokens);
            const bodyOverlap = overlap(queryTokens, bodyTokens);
            if (!titleOverlap && !bodyOverlap) return { card, rankScore: Number.NEGATIVE_INFINITY, matchedTerms: [] as string[] };
            if (card.scope === "extension" && !titleOverlap) return { card, rankScore: Number.NEGATIVE_INFINITY, matchedTerms: [] as string[] };
            const titleMatchBonus = explainMatches(query, card.title).reduce((total, term) => total + Math.min(3, term.length - 1), 0);
            const noDialoguePenalty = /无对白/.test(query) && /对白|人声/.test(card.title) && !/无对白|静音|环境声/.test(card.title) ? 3 : 0;
            const rankScore = titleOverlap * 2.4 + bodyOverlap * 0.8 + titleMatchBonus + card.confidence * 1.4 + card.authority * 1.2 + (card.layer === "private" ? 1.4 : 0) + (card.scope === "core" ? 0.4 : 0) - noDialoguePenalty;
            return { card, rankScore, matchedTerms: explainMatches(query, `${card.title} ${card.category} ${card.principle} ${card.triggers.join(" ")} ${card.appliesTo.join(" ")} ${card.checks.join(" ")}`) };
        })
        .filter((item) => item.rankScore >= (query.length >= 8 ? 4 : 5))
        .sort((left, right) => right.rankScore - left.rankScore || right.card.confidence - left.card.confidence);
    const selected: typeof scored = [];
    const categories = new Map<string, number>();
    for (const item of scored) {
        if ((categories.get(item.card.category) || 0) >= 2) continue;
        selected.push(item);
        categories.set(item.card.category, (categories.get(item.card.category) || 0) + 1);
        if (selected.length >= limit) break;
    }
    return selected;
}

function renderCard(card: KnowledgeCard, index: number, sources: Map<string, string>) {
    const source = card.sourceIds.map((id) => sources.get(id) || id).join("、") || "未标注来源";
    return `${index + 1}. ${card.title}｜${card.category}\n- 原则：${card.principle}\n- 适用：${card.appliesTo.join("；") || "当前任务"}\n- 检查：${card.checks.join("；") || "是否满足当前目标"}\n- 禁忌：${card.avoid.join("；") || "脱离适用边界"}\n- 可信度：${card.confidence.toFixed(2)}；来源：${source}`;
}

function tokenize(value: string) {
    const tokens = new Set<string>();
    const normalized = value.toLowerCase();
    for (const word of normalized.match(/[a-z0-9]{2,}/g) || []) tokens.add(word);
    for (const segment of normalized.match(/[\u4e00-\u9fff]+/g) || []) {
        if (segment.length <= 4) tokens.add(segment);
        for (let index = 0; index < segment.length - 1; index += 1) tokens.add(segment.slice(index, index + 2));
    }
    return tokens;
}

function explainMatches(query: string, indexText: string) {
    const indexed = indexText.toLowerCase();
    const matches = new Set<string>();
    for (const segment of query.match(/[\u4e00-\u9fff]+/g) || []) {
        const occupied = Array.from({ length: segment.length }, () => false);
        for (let length = Math.min(24, segment.length); length >= 2; length -= 1) {
            for (let start = 0; start + length <= segment.length; start += 1) {
                if (occupied.slice(start, start + length).some(Boolean)) continue;
                const term = segment.slice(start, start + length);
                if (!indexed.includes(term) || (term.length <= 4 && (/^[的了着过和与或及把被将为是有也都而并于就]/.test(term) || /[的了着过和与或及把被将从为在是有也都而并于就]$/.test(term)))) continue;
                matches.add(term);
                for (let index = start; index < start + length; index += 1) occupied[index] = true;
            }
        }
    }
    for (const word of query.toLowerCase().match(/[a-z0-9]{2,}/g) || []) if (indexed.includes(word)) matches.add(word);
    return [...matches].sort((left, right) => right.length - left.length || left.localeCompare(right, "zh-CN")).slice(0, 10);
}

function overlap(left: Set<string>, right: Set<string>) {
    let count = 0;
    left.forEach((token) => {
        if (right.has(token)) count += 1;
    });
    return count;
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown) {
    return array(value).map(text).filter(Boolean);
}

function score(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

export type { PrivateContextOptions };
