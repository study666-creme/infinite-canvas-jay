import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const roots = [
    "README.md",
    "CONTRIBUTING.md",
    "DEPLOY.md",
    "CANVAS-AGENT.md",
    "OPEN-SOURCE.md",
    "SECURITY.md",
    "docs",
    "canvas-agent/README.md",
    "plugins/infinite-canvas/README.md",
    "web/knowledge/creative/README.md",
];

const files = roots.flatMap((entry) => collect(path.join(root, entry))).filter((file) => /\.(md|mdx)$/i.test(file));
const errors = [];

for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const links = [...content.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1].trim().replace(/^<|>$/g, ""));
    for (const link of links) {
        if (!link || /^(https?:|mailto:|#)/i.test(link)) continue;
        const clean = decodeURIComponent(link.split("#")[0].split("?")[0]);
        if (!clean) continue;
        const target = clean.startsWith("/docs/") ? docsRouteToFile(clean) : path.resolve(path.dirname(file), clean);
        if (target && !fs.existsSync(target)) errors.push(`${path.relative(root, file)} -> ${link}`);
    }
}

if (errors.length) {
    console.error(`Broken documentation links (${errors.length}):\n${errors.map((item) => `- ${item}`).join("\n")}`);
    process.exit(1);
}

console.log(`Checked ${files.length} documentation files: no broken local links.`);

function collect(target) {
    if (!fs.existsSync(target)) return [];
    const stat = fs.statSync(target);
    if (stat.isFile()) return [target];
    if (new Set([".git", ".next", ".source", "node_modules", "out"]).has(path.basename(target))) return [];
    return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => collect(path.join(target, entry.name)));
}

function docsRouteToFile(route) {
    if (route === "/docs" || route === "/docs/") return path.join(root, "docs/index.md");
    if (route === "/docs/progress/changelog") return path.join(root, "CHANGELOG.md");
    const slug = route.replace(/^\/docs\//, "").replace(/\/$/, "");
    return path.join(root, "docs/content/docs", `${slug}.mdx`);
}
