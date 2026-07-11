#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const defaultReportFile = path.join(appRoot, "knowledge", "creative", "creative-knowledge-report.json");

function list(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function statusLabel(status) {
    return (
        {
            candidate: "候选卡（尚未激活）",
            verified: "人工确认",
            auto_verified: "独立审核通过（待你确认）",
            rejected: "已拒绝",
        }[status] ||
        status ||
        "未标记"
    );
}

function formatScore(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "未评分";
}

function markdownBullets(items, fallback = "无") {
    return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function markdownChecks(items) {
    return items.length ? items.map((item) => `- [ ] ${item}`).join("\n") : "- 无额外检查项";
}

function sourceTitles(card, sourceMap) {
    return list(card.sourceIds).map((id) => sourceMap.get(id)?.title || id);
}

function groupCards(cards) {
    const groups = new Map();
    for (const card of cards) {
        const category = card.category?.trim() || "未分类";
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(card);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
}

function normalizeReport(data) {
    return {
        cards: Array.isArray(data?.cards) ? data.cards : [],
        sources: Array.isArray(data?.sources) ? data.sources : [],
        warnings: list(data?.warnings),
    };
}

function renderKnowledgeMarkdown(data, options = {}) {
    const { cards, sources, warnings } = normalizeReport(data);
    const title = options.title || "创作知识卡可读版";
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const groups = groupCards(cards);
    const activeCount = cards.filter((card) => card.status === "verified").length;
    const independentlyReviewedCount = cards.filter((card) => card.status === "auto_verified").length;
    const candidateCount = cards.filter((card) => card.status === "candidate").length;
    let cardIndex = 0;

    const sections = groups
        .map(([category, categoryCards]) => {
            const renderedCards = categoryCards
                .map((card) => {
                    cardIndex += 1;
                    const sourcesForCard = sourceTitles(card, sourceMap);
                    return `### ${cardIndex}. ${card.title || "未命名知识卡"}

**核心知识**

${card.principle || "未填写"}

**什么时候调用**

${markdownBullets(list(card.triggers), "遇到与本卡原则相符的创作问题时")}

**适用场景**

${markdownBullets(list(card.appliesTo))}

**检查清单**

${markdownChecks(list(card.checks))}

**不要这样做**

${markdownBullets(list(card.avoid))}

**证据与边界**

${card.evidenceSummary || "未填写证据摘要"}

${markdownBullets(list(card.conflicts), "无额外边界说明")}

**审核信息**

- 状态：${statusLabel(card.status)}
- 置信度：${formatScore(card.confidence)}
- 来源权威度：${formatScore(card.authority)}
- 来源：${sourcesForCard.join("；") || "未关联来源"}
- 终审说明：${card.auditReason || "未填写"}`;
                })
                .join("\n\n---\n\n");
            return `## ${category}（${categoryCards.length} 张）\n\n${renderedCards}`;
        })
        .join("\n\n---\n\n");

    const warningSection = warnings.length ? `\n\n## 处理警告\n\n${markdownBullets(warnings)}` : "";
    return `# ${title}

> 共 ${cards.length} 张知识卡，${independentlyReviewedCount} 张已通过独立审核但待你确认，${candidateCount} 张普通候选卡，${activeCount} 张已由你确认；来源 ${sources.length} 个。

这份文件展示的是蒸馏后的知识正文。独立审核通过不等于应用，只有你确认后的卡才会参与 Agent 检索。

## 分类目录

${groups.map(([category, categoryCards]) => `- ${category}：${categoryCards.length} 张`).join("\n") || "- 暂无知识卡"}

---

${sections || "当前报告没有知识卡。"}${warningSection}
`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function htmlList(items, className = "") {
    if (!items.length) return '<p class="empty">无</p>';
    return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderKnowledgeHtml(data, options = {}) {
    const { cards, sources, warnings } = normalizeReport(data);
    const title = options.title || "创作知识卡可读版";
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const groups = groupCards(cards);
    const activeCount = cards.filter((card) => card.status === "verified").length;
    const independentlyReviewedCount = cards.filter((card) => card.status === "auto_verified").length;
    const candidateCount = cards.filter((card) => card.status === "candidate").length;
    let cardIndex = 0;
    const categoryOptions = groups.map(([category]) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
    const sourceOptions = sources.map((source) => `<option value="${escapeHtml(source.id)}">${escapeHtml(source.title || source.id)}</option>`).join("");
    const cardHtml = groups
        .flatMap(([category, categoryCards]) =>
            categoryCards.map((card) => {
                cardIndex += 1;
                const sourcesForCard = sourceTitles(card, sourceMap);
                const searchable = [card.title, category, card.principle, ...sourcesForCard, ...list(card.triggers), ...list(card.appliesTo), ...list(card.checks), ...list(card.avoid)].join(" ");
                const displayStatus = card.status || "candidate";
                const statusClass = card.status === "verified" ? "active" : card.status === "auto_verified" ? "reviewed" : card.status === "rejected" ? "rejected" : "candidate";
                return `<article class="knowledge-card" data-category="${escapeHtml(category)}" data-source-ids="${escapeHtml(list(card.sourceIds).join(" "))}" data-status="${escapeHtml(displayStatus)}" data-search="${escapeHtml(searchable.toLocaleLowerCase("zh-CN"))}">
    <header>
        <div class="index">${cardIndex}</div>
        <div>
            <p class="category">${escapeHtml(category)}</p>
            <h2>${escapeHtml(card.title || "未命名知识卡")}</h2>
        </div>
        <span class="status ${statusClass}">${escapeHtml(statusLabel(card.status))}</span>
    </header>
    <section class="principle">
        <h3>核心知识</h3>
        <p>${escapeHtml(card.principle || "未填写")}</p>
    </section>
    <details>
        <summary>展开方法、证据与审核信息</summary>
        <div class="detail-grid">
            <section><h3>什么时候调用</h3>${htmlList(list(card.triggers))}</section>
            <section><h3>适用场景</h3>${htmlList(list(card.appliesTo), "tags")}</section>
            <section><h3>检查清单</h3>${htmlList(list(card.checks), "checks")}</section>
            <section><h3>不要这样做</h3>${htmlList(list(card.avoid), "avoid")}</section>
        </div>
        <section class="evidence"><h3>证据摘要</h3><p>${escapeHtml(card.evidenceSummary || "未填写")}</p></section>
        <section><h3>适用边界与冲突</h3>${htmlList(list(card.conflicts))}</section>
        <section class="audit"><h3>终审说明</h3><p>${escapeHtml(card.auditReason || "未填写")}</p></section>
        <footer>置信度 ${escapeHtml(formatScore(card.confidence))} · 来源权威度 ${escapeHtml(formatScore(card.authority))} · 来源：${escapeHtml(sourcesForCard.join("；") || "未关联来源")}</footer>
    </details>
</article>`;
            }),
        )
        .join("\n");

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; --bg: #f5f6f7; --surface: #ffffff; --text: #171a1d; --muted: #626970; --line: #d9dde1; --accent: #146b4a; --accent-soft: #e7f3ed; --warn: #8a4b12; --warn-soft: #fff1df; --danger: #a33b31; }
* { box-sizing: border-box; }
body { margin: 0; overflow-x: hidden; background: var(--bg); color: var(--text); font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; line-height: 1.65; }
.page-header { background: #202428; color: #fff; padding: 30px max(20px, calc((100vw - 1120px) / 2)); }
.page-header h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
.page-header p { margin: 0; color: #d8dde1; }
.stats { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 20px; }
.stat strong { display: block; font-size: 22px; }
.stat span { color: #bfc6cc; font-size: 13px; }
.toolbar { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: minmax(220px, 1fr) 160px 220px 150px auto auto; gap: 10px; padding: 12px max(20px, calc((100vw - 1120px) / 2)); background: rgba(255,255,255,.96); border-bottom: 1px solid var(--line); }
input, select, button { min-width: 0; min-height: 42px; border: 1px solid #bfc5ca; border-radius: 5px; background: #fff; color: var(--text); font: inherit; }
input, select { padding: 8px 12px; }
button { padding: 8px 14px; cursor: pointer; }
button:hover { border-color: var(--accent); color: var(--accent); }
main { width: min(1120px, calc(100% - 40px)); margin: 24px auto 56px; }
.notice { margin-bottom: 18px; padding: 14px 16px; border-left: 4px solid var(--warn); background: var(--warn-soft); }
.result-count { color: var(--muted); margin: 0 0 12px; }
.knowledge-card { margin-bottom: 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); overflow: hidden; }
.knowledge-card > header { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 18px 20px 12px; }
.index { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 4px; background: #eceff1; color: #4c545b; font-weight: 700; }
.category { margin: 0 0 3px; color: var(--accent); font-size: 13px; font-weight: 700; }
h2 { margin: 0; font-size: 19px; letter-spacing: 0; }
h3 { margin: 0 0 7px; font-size: 14px; letter-spacing: 0; }
.status { align-self: center; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
.status.candidate { color: var(--warn); background: var(--warn-soft); }
.status.reviewed { color: #225a7a; background: #e7f1f7; }
.status.active { color: var(--accent); background: var(--accent-soft); }
.status.rejected { color: var(--danger); background: #faeae8; }
.principle { padding: 0 20px 17px 70px; }
.principle p, .evidence p, .audit p { margin: 0; overflow-wrap: anywhere; }
details { border-top: 1px solid var(--line); }
summary { padding: 11px 20px; cursor: pointer; color: var(--accent); font-weight: 700; }
details[open] summary { border-bottom: 1px solid var(--line); }
details > section, details > footer, .detail-grid { margin: 16px 20px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.detail-grid section, .evidence, .audit { padding: 14px; background: #f7f8f9; border-radius: 5px; }
ul { margin: 0; padding-left: 21px; }
li + li { margin-top: 6px; }
.checks li::marker { color: var(--accent); }
.avoid li::marker { color: var(--danger); }
.empty, footer { color: var(--muted); }
footer { padding-top: 13px; border-top: 1px solid var(--line); font-size: 13px; }
.hidden { display: none; }
.warnings { margin-top: 22px; padding: 16px; border: 1px solid #e5c29d; background: var(--warn-soft); }
@media (max-width: 760px) {
  .page-header { padding-top: 22px; padding-bottom: 22px; }
  .page-header h1 { font-size: 23px; }
  .toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar input, .toolbar select { grid-column: 1 / -1; width: 100%; }
  .toolbar button { width: 100%; }
  main { width: min(calc(100% - 24px), 1120px); margin-top: 14px; }
  .knowledge-card > header { grid-template-columns: 34px minmax(0, 1fr); padding: 15px 14px 10px; }
  .status { grid-column: 2; justify-self: start; }
  .principle { padding: 0 14px 15px; }
  .detail-grid { grid-template-columns: 1fr; }
  details > section, details > footer, .detail-grid { margin: 12px 14px; }
}
</style>
</head>
<body>
<header class="page-header">
  <h1>${escapeHtml(title)}</h1>
  <p>这里展示蒸馏后的知识正文，不是原始字幕目录。</p>
  <div class="stats">
    <div class="stat"><strong>${cards.length}</strong><span>知识卡</span></div>
    <div class="stat"><strong>${candidateCount}</strong><span>普通候选卡</span></div>
    <div class="stat"><strong>${independentlyReviewedCount}</strong><span>独立审核通过，待你确认</span></div>
    <div class="stat"><strong>${activeCount}</strong><span>你已确认</span></div>
    <div class="stat"><strong>${sources.length}</strong><span>资料来源</span></div>
  </div>
</header>
<div class="toolbar">
  <input id="search" type="search" placeholder="搜索标题、原则、检查项……" aria-label="搜索知识卡">
  <select id="category" aria-label="按分类筛选"><option value="">全部分类</option>${categoryOptions}</select>
  <select id="source" aria-label="按来源筛选"><option value="">全部资料来源</option>${sourceOptions}</select>
  <select id="status" aria-label="按状态筛选"><option value="">全部状态</option><option value="auto_verified">仅独立审核通过</option><option value="candidate">仅普通候选卡</option><option value="verified">仅你已确认</option><option value="rejected">仅已拒绝卡</option></select>
  <button id="expand" type="button">展开全部</button>
  <button id="collapse" type="button">收起全部</button>
</div>
<main>
  <div class="notice">独立审核通过不等于应用。只有你确认后的卡才会参与 Agent 检索。</div>
  <p id="result-count" class="result-count">显示 ${cards.length} / ${cards.length} 张</p>
  <section id="cards">${cardHtml || "<p>当前报告没有知识卡。</p>"}</section>
  ${warnings.length ? `<section class="warnings"><h2>处理警告</h2>${htmlList(warnings)}</section>` : ""}
</main>
<script>
const cards = [...document.querySelectorAll('.knowledge-card')];
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const source = document.querySelector('#source');
const status = document.querySelector('#status');
const count = document.querySelector('#result-count');
function filterCards() {
  const query = search.value.trim().toLocaleLowerCase('zh-CN');
  const selectedCategory = category.value;
  const selectedSource = source.value;
  const selectedStatus = status.value;
  let visible = 0;
  for (const card of cards) {
    const sourceIds = card.dataset.sourceIds.split(' ');
    const matches = (!query || card.dataset.search.includes(query)) && (!selectedCategory || card.dataset.category === selectedCategory) && (!selectedSource || sourceIds.includes(selectedSource)) && (!selectedStatus || card.dataset.status === selectedStatus);
    card.classList.toggle('hidden', !matches);
    if (matches) visible += 1;
  }
  count.textContent = '显示 ' + visible + ' / ' + cards.length + ' 张';
}
search.addEventListener('input', filterCards);
category.addEventListener('change', filterCards);
source.addEventListener('change', filterCards);
status.addEventListener('change', filterCards);
document.querySelector('#expand').addEventListener('click', () => document.querySelectorAll('.knowledge-card:not(.hidden) details').forEach((item) => { item.open = true; }));
document.querySelector('#collapse').addEventListener('click', () => document.querySelectorAll('details').forEach((item) => { item.open = false; }));
</script>
</body>
</html>`;
}

function readableReportPaths(reportFile, options = {}) {
    const parsed = path.parse(reportFile);
    const base = path.join(parsed.dir, parsed.name);
    return {
        markdownFile: options.markdownFile || `${base}.readable.md`,
        htmlFile: options.htmlFile || `${base}.readable.html`,
    };
}

async function writeReadableKnowledgeReports(reportFile, data, options = {}) {
    const paths = readableReportPaths(reportFile, options);
    await fs.mkdir(path.dirname(paths.markdownFile), { recursive: true });
    await fs.mkdir(path.dirname(paths.htmlFile), { recursive: true });
    await Promise.all([fs.writeFile(paths.markdownFile, renderKnowledgeMarkdown(data, options), "utf8"), fs.writeFile(paths.htmlFile, renderKnowledgeHtml(data, options), "utf8")]);
    return paths;
}

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const item = argv[index];
        if (!item.startsWith("--")) continue;
        const key = item.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) result[key] = true;
        else {
            result[key] = value;
            index += 1;
        }
    }
    return result;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const reportFile = path.resolve(appRoot, args.report || defaultReportFile);
    const data = JSON.parse(await fs.readFile(reportFile, "utf8"));
    const paths = await writeReadableKnowledgeReports(reportFile, data, {
        title: typeof args.title === "string" ? args.title : undefined,
        markdownFile: typeof args.markdown === "string" ? path.resolve(appRoot, args.markdown) : undefined,
        htmlFile: typeof args.html === "string" ? path.resolve(appRoot, args.html) : undefined,
    });
    console.log(`Markdown: ${paths.markdownFile}`);
    console.log(`HTML: ${paths.htmlFile}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    });
}

export { readableReportPaths, renderKnowledgeHtml, renderKnowledgeMarkdown, writeReadableKnowledgeReports };
