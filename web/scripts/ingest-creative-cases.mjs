#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    appRoot,
    callChatJson,
    cleanField,
    cleanList,
    cleanText,
    collectSourceSpecs,
    loadSource,
    normalizeScore,
    parseArgs,
    pathExists,
    stableId,
} from "./ingest-creative-knowledge.mjs";
import {
    contentHash,
    databaseSummary,
    finishIngestJob,
    openCreativeLibraryDb,
    readCachedSource,
    readStoryCaseForSource,
    startIngestJob,
    upsertLibrarySource,
    upsertStoryCase,
} from "./creative-library-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.join(appRoot, "knowledge", "creative", "cases");
const defaultInputDir = path.join(defaultRoot, "raw");
const defaultManifest = path.join(defaultRoot, "sources.json");
const defaultOutputFile = path.join(appRoot, "src", "app", "(user)", "canvas", "utils", "creative-case-library.generated.ts");
const defaultReportFile = path.join(defaultRoot, "case-library-report.json");

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputDir = path.resolve(appRoot, args.input || defaultInputDir);
    const manifestFile = path.resolve(appRoot, args.manifest || defaultManifest);
    const outputFile = path.resolve(appRoot, args.output || defaultOutputFile);
    const reportFile = path.resolve(appRoot, args.report || defaultReportFile);
    const useLlm = !args.local && Boolean(args.llm || process.env.KNOWLEDGE_LLM_API_KEY || process.env.OPENAI_API_KEY);
    const ingestMode = useLlm ? "llm" : "local";
    const maxCaseChunks = numberArg(args["max-case-chunks"], 18);
    const { db, file: dbFile } = openCreativeLibraryDb(args.db);

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    const manifest = (await pathExists(manifestFile)) ? JSON.parse(await fs.readFile(manifestFile, "utf8")) : {};
    const sourceSpecs = await collectSourceSpecs({ inputDir, manifest, manifestFile });
    const warnings = [];
    const cases = [];
    let cacheHits = 0;

    for (const spec of sourceSpecs) {
        const sourceKey = spec.path || spec.url;
        const jobId = startIngestJob(db, { jobType: "case", sourceKey, sourcePath: spec.path || "" });
        try {
            const doc = await loadSource(spec);
            const text = cleanText(doc.text);
            if (text.length < 500) throw new Error("案例正文少于 500 字，无法建立可靠结构索引");
            const hash = contentHash(text);
            const cached = readCachedSource(db, { id: doc.id, libraryType: "case", hash, ingestMode });
            let storyCase = cached ? readStoryCaseForSource(db, doc.id) : null;
            let processingError = "";
            if (storyCase) {
                cacheHits += 1;
            } else {
                if (useLlm) {
                    try {
                        storyCase = await distillCaseWithLlm(doc, text, maxCaseChunks);
                    } catch (error) {
                        processingError = error instanceof Error ? error.message : String(error);
                        warnings.push(`${doc.title}: 模型案例蒸馏失败，已保留候选索引并等待重试。${processingError}`);
                        storyCase = localCaseIndex(doc, text);
                    }
                } else {
                    storyCase = localCaseIndex(doc, text);
                }
                upsertLibrarySource(db, { ...doc, chars: text.length, chunks: storyCase.segmentCount || 0 }, { libraryType: "case", hash, ingestMode, status: processingError ? "failed" : "completed", error: processingError });
                upsertStoryCase(db, doc.id, storyCase);
            }
            if (!storyCase) throw new Error("案例索引为空");
            cases.push(storyCase);
            finishIngestJob(db, jobId, { status: processingError ? "failed" : "completed", error: processingError });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`${spec.title || spec.path || spec.url}: ${message}`);
            finishIngestJob(db, jobId, { status: "failed", error: message });
        }
    }

    await writeGeneratedCases(outputFile, cases, { mode: sourceSpecs.length ? `${ingestMode}-indexed` : "empty" });
    await fs.writeFile(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), cases, warnings }, null, 2), "utf8");
    console.log(`Story case ingest complete. Sources: ${sourceSpecs.length}; cases: ${cases.length}; cache hits: ${cacheHits}.`);
    console.log(`Generated: ${path.relative(appRoot, outputFile)}`);
    console.log(`Report: ${path.relative(appRoot, reportFile)}`);
    console.log(`SQLite: ${path.relative(appRoot, dbFile)} ${JSON.stringify(databaseSummary(db))}`);
    if (!useLlm && sourceSpecs.length) console.log("本地模式只建立候选索引；配置 KNOWLEDGE_LLM_API_KEY 后运行 --llm 才会生成可检索案例摘要。");
    db.close();
    if (warnings.length) process.exitCode = 2;
}

function numberArg(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function localCaseIndex(doc, text) {
    const tags = inferTags(`${doc.title}\n${text.slice(0, 12000)}`);
    return normalizeCase(
        {
            id: stableId(`case|${doc.id}`),
            sourceId: doc.id,
            title: doc.title,
            category: doc.category,
            format: inferFormat(text),
            genres: tags.slice(0, 3),
            narrativePerspective: "待提取",
            setting: tags.filter((item) => ["都市", "仙侠", "玄幻", "古装", "科幻", "校园", "职场"].includes(item)).join("、") || "待提取",
            tone: "待提取",
            audiencePromise: "待模型从完整材料中审核",
            logline: "本地模式已保留来源和结构位置，尚未生成可用于创作的案例摘要。",
            protagonist: { identity: "待提取", desire: "待提取", obstacle: "待提取", stakes: "待提取", change: "待提取" },
            relationships: [],
            storyEngine: "待模型提取",
            coreConflict: "待模型提取",
            firstThreeEpisodeHooks: [],
            sceneFunctions: [],
            pacingCurve: [],
            reusablePatterns: [],
            adaptationNotes: [],
            marketEvidence: doc.note || "未提供市场验证说明",
            doNotCopy: ["不得照搬原作人物、专有设定、关键桥段和原文表达"],
            tags,
            segmentCount: splitCaseText(text, 12000, 18).length,
            status: "candidate",
            confidence: 0.35,
        },
        doc,
    );
}

async function distillCaseWithLlm(doc, text, maxCaseChunks) {
    const api = llmConfig();
    const segments = splitCaseText(text, 12000, maxCaseChunks);
    const observations = [];
    for (let index = 0; index < segments.length; index += 1) {
        const result = await callChatJson({
            ...api,
            messages: [
                {
                    role: "system",
                    content:
                        "你是故事案例结构分析员。只记录材料明确支持的结构事实和原创摘要，不复制长句，不评价作者名气，不把单个作品总结成万能写作规律。",
                },
                {
                    role: "user",
                    content: `作品：${doc.title}\n这是按原文顺序抽样的第 ${index + 1}/${segments.length} 段。输出 JSON：\n{\n  "characters": ["本段出现的人物身份与目标"],\n  "events": ["关键事件及其因果"],\n  "relationshipChanges": ["人物关系或权力变化"],\n  "hooks": ["悬念、反转或兑现"],\n  "sceneFunctions": ["场景承担的戏剧功能"],\n  "pacing": "本段节奏和情绪变化",\n  "unresolved": ["仍未回答的问题"]\n}\n\n材料：\n${segments[index]}`,
                },
            ],
        });
        observations.push({ segment: index + 1, ...result });
    }

    const synthesis = await callChatJson({
        ...api,
        messages: [
            {
                role: "system",
                content:
                    "你是影视与网文案例库编辑。根据分段观察建立可检索结构档案，只写材料支持的原创摘要。案例用于启发结构选择，不得诱导照搬人物、专有设定、桥段排列或原文。",
            },
            {
                role: "user",
                content: `来源：${doc.title}\n类别先验：${doc.category}\n用户来源备注：${doc.note || "未提供"}\n\n请输出 JSON：\n{\n  "category": "中文分类",\n  "format": "网文/短剧剧本/电影剧本/故事/其他",\n  "genres": ["题材标签"],\n  "narrativePerspective": "第一人称/第三人称限知/全知/多视角/剧本客观视角等",\n  "setting": "都市、仙侠、古装、科幻等时代与世界设定",\n  "tone": "叙事语气与情绪质地",\n  "audiencePromise": "作品向受众承诺的核心体验",\n  "logline": "一句话故事，原创转述",\n  "protagonist": {"identity":"身份","desire":"核心欲望","obstacle":"主要阻碍","stakes":"失败代价","change":"人物变化"},\n  "relationships": [{"parties":"关系双方","tension":"关系张力来源","change":"主要变化"}],\n  "storyEngine": "能持续产出剧情的机制",\n  "coreConflict": "核心冲突",\n  "firstThreeEpisodeHooks": [{"episode":1,"opening":"开场钩子","escalation":"升级","payoff":"本集兑现","cliffhanger":"集尾问题"}],\n  "sceneFunctions": ["反复有效的场景功能"],\n  "pacingCurve": ["按阶段描述节奏/情绪曲线"],\n  "reusablePatterns": ["可抽象借鉴但不能照搬的结构模式"],\n  "adaptationNotes": ["把该媒介改成 1-3 分钟 AI 短剧时应保留、改写或舍弃什么"],\n  "doNotCopy": ["专属于原作、不得照搬的内容类型"],\n  "tags": ["检索关键词"]\n}\n\n只有原作本身存在明确分集时才填写 firstThreeEpisodeHooks；电影、单篇故事等非分集作品应返回空数组，不得伪造集界。marketEvidence 只能来自用户来源备注，不能自行声称市场验证。\n\n分段观察：\n${JSON.stringify(observations).slice(0, 50000)}`,
            },
        ],
    });

    const candidate = normalizeCase(
        {
            ...synthesis,
            id: stableId(`case|${doc.id}`),
            sourceId: doc.id,
            title: doc.title,
            segmentCount: segments.length,
            status: "candidate",
            confidence: 0.6,
        },
        doc,
    );
    return auditCaseWithLlm(doc, candidate, observations, api);
}

async function auditCaseWithLlm(doc, candidate, observations, api) {
    const result = await callChatJson({
        ...api,
        messages: [
            {
                role: "system",
                content:
                    "你是独立案例审计员，不参与前面的提取。检查档案是否被材料支持、是否混入臆测、是否足够具体可检索、是否把原作误写成通用公式，并强化禁止照搬边界。",
            },
            {
                role: "user",
                content: `候选案例档案：\n${JSON.stringify(candidate)}\n\n分段证据摘要：\n${JSON.stringify(observations).slice(0, 42000)}\n\n输出 JSON：\n{\n  "keep": true,\n  "confidence": 0.0,\n  "issues": ["问题"],\n  "corrections": {"仅填写需要替换的候选字段": "修正值"}\n}`,
            },
        ],
    });
    const confidence = normalizeScore(result.confidence, 0.5);
    const corrected = normalizeCase({ ...candidate, ...(isRecord(result.corrections) ? result.corrections : {}) }, doc);
    return {
        ...corrected,
        status: result.keep !== true ? "rejected" : doc.verified ? "verified" : confidence >= 0.78 && doc.authority >= 0.6 ? "auto_verified" : "candidate",
        confidence,
        auditIssues: cleanList(result.issues).slice(0, 8),
    };
}

function splitCaseText(text, chunkSize, maxChunks) {
    const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const chunks = [];
    let current = "";
    for (const paragraph of paragraphs) {
        if (current && current.length + paragraph.length + 2 > chunkSize) {
            chunks.push(current);
            current = "";
        }
        if (paragraph.length > chunkSize) {
            if (current) chunks.push(current);
            current = "";
            for (let index = 0; index < paragraph.length; index += chunkSize) chunks.push(paragraph.slice(index, index + chunkSize));
        } else {
            current += `${current ? "\n\n" : ""}${paragraph}`;
        }
    }
    if (current) chunks.push(current);
    if (chunks.length <= maxChunks) return chunks;
    const selected = [];
    const used = new Set();
    for (let index = 0; index < maxChunks; index += 1) {
        const position = Math.round((index * (chunks.length - 1)) / Math.max(1, maxChunks - 1));
        if (!used.has(position)) {
            used.add(position);
            selected.push(chunks[position]);
        }
    }
    return selected;
}

function normalizeCase(value, doc) {
    const protagonist = isRecord(value.protagonist) ? value.protagonist : {};
    return {
        id: cleanField(value.id) || stableId(`case|${doc.id}`),
        sourceId: doc.id,
        title: cleanField(value.title) || doc.title,
        category: cleanField(value.category) || doc.category || "故事案例",
        format: cleanField(value.format) || "其他",
        genres: cleanList(value.genres).slice(0, 8),
        narrativePerspective: cleanField(value.narrativePerspective).slice(0, 120),
        setting: cleanField(value.setting).slice(0, 180),
        tone: cleanField(value.tone).slice(0, 180),
        audiencePromise: cleanField(value.audiencePromise).slice(0, 300),
        logline: cleanField(value.logline).slice(0, 400),
        protagonist: {
            identity: cleanField(protagonist.identity).slice(0, 180),
            desire: cleanField(protagonist.desire).slice(0, 180),
            obstacle: cleanField(protagonist.obstacle).slice(0, 180),
            stakes: cleanField(protagonist.stakes).slice(0, 180),
            change: cleanField(protagonist.change).slice(0, 180),
        },
        relationships: normalizeObjectList(value.relationships, ["parties", "tension", "change"], 10),
        storyEngine: cleanField(value.storyEngine).slice(0, 500),
        coreConflict: cleanField(value.coreConflict).slice(0, 400),
        firstThreeEpisodeHooks: normalizeObjectList(value.firstThreeEpisodeHooks, ["episode", "opening", "escalation", "payoff", "cliffhanger"], 3),
        sceneFunctions: cleanList(value.sceneFunctions).slice(0, 12),
        pacingCurve: cleanList(value.pacingCurve).slice(0, 12),
        reusablePatterns: cleanList(value.reusablePatterns).slice(0, 10),
        adaptationNotes: cleanList(value.adaptationNotes).slice(0, 10),
        marketEvidence: cleanField(value.marketEvidence || doc.note || "未提供市场验证说明").slice(0, 300),
        doNotCopy: [...new Set([...cleanList(value.doNotCopy), "不得照搬原作人物、专有设定、关键桥段排列和原文表达"])].slice(0, 10),
        tags: cleanList(value.tags).slice(0, 16),
        segmentCount: Number(value.segmentCount) || 0,
        status: normalizeCaseStatus(value.status),
        confidence: normalizeScore(value.confidence, 0.5),
        auditIssues: cleanList(value.auditIssues).slice(0, 8),
        source: { id: doc.id, title: doc.title, kind: doc.kind, path: doc.source, layer: doc.layer, authority: doc.authority },
    };
}

function normalizeObjectList(value, keys, max) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, max).flatMap((item) => {
        if (!isRecord(item)) return [];
        return [Object.fromEntries(keys.map((key) => [key, key === "episode" ? Number(item[key]) || 0 : cleanField(item[key]).slice(0, 240)]))];
    });
}

function normalizeCaseStatus(value) {
    return value === "verified" || value === "auto_verified" || value === "rejected" ? value : "candidate";
}

function inferTags(text) {
    const candidates = ["都市", "仙侠", "玄幻", "悬疑", "犯罪", "家庭", "爱情", "职场", "校园", "古装", "科幻", "喜剧", "女性成长", "复仇", "逆袭", "重生", "穿越", "系统", "短剧", "网文"];
    return candidates.filter((tag) => text.includes(tag));
}

function inferFormat(text) {
    if (/第\s*[一二三四五六七八九十\d]+\s*[集幕]/.test(text) || /场景[：:]|内景|外景/.test(text)) return "短剧剧本";
    if (/第\s*[一二三四五六七八九十百千\d]+\s*章/.test(text)) return "网文";
    return "故事";
}

function llmConfig() {
    const apiKey = process.env.KNOWLEDGE_LLM_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.KNOWLEDGE_LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.KNOWLEDGE_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    if (!apiKey) throw new Error("缺少 KNOWLEDGE_LLM_API_KEY");
    return { apiKey, baseUrl, model };
}

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function writeGeneratedCases(outputFile, cases, { mode }) {
    const meta = buildCaseLibraryMeta(cases, { mode });
    const content = `// Generated by scripts/ingest-creative-cases.mjs. Do not edit manually.\nexport const CREATIVE_STORY_CASES = ${JSON.stringify(cases, null, 4)} as const;\n\nexport const CREATIVE_STORY_CASE_META = ${JSON.stringify(meta, null, 4)} as const;\n`;
    await fs.writeFile(outputFile, content, "utf8");
}

function buildCaseLibraryMeta(cases, { mode, generatedAt = new Date().toISOString() }) {
    return {
        generatedAt,
        caseCount: cases.length,
        activeCaseCount: cases.filter((item) => item.status === "verified").length,
        independentlyReviewedCaseCount: cases.filter((item) => item.status === "auto_verified").length,
        candidateCaseCount: cases.filter((item) => item.status === "candidate" || item.status === "auto_verified").length,
        mode,
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });
}

export { buildCaseLibraryMeta, writeGeneratedCases };
