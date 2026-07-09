import express, { type NextFunction, type Request, type Response } from "express";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os, { type NetworkInterfaceInfo } from "node:os";
import path from "node:path";

import { DEFAULT_PORT, ensureCanvasWorkspace, loadConfig, saveConfig, updateCanvasWorkspace, type CanvasAgentConfig } from "./config.js";
import { CanvasSession } from "./canvas-session.js";
import { archiveCodexThread, listCodexThreads, readCodexThread, resumeCodexThread, runClaudeTurn, runCodexTurn, startCodexThread, summarizeCodexThread, verifyCodexThreadWorkspace, withAgentPrompt } from "./agents.js";
import type { AgentAttachment } from "./types.js";

type GitRemoteInfo = { name: string; url: string };
type GitRepoInfo = {
    repoPath: string;
    branch: string;
    defaultRemote: string;
    defaultBranch: string;
    remotes: GitRemoteInfo[];
    dirty: boolean;
    statusShort: string[];
    warnings: string[];
    pushBlocked: boolean;
};
type CodexWorkspaceProject = {
    id: string;
    label: string;
    canvasId: string;
    workspacePath: string;
    threadId: string;
    threadCount: number;
    updatedAt: number;
    source: "saved" | "discovered";
};

export function startHttpServer() {
    const config = loadConfig(true);
    const port = Number(process.env.PORT) || Number(new URL(config.url).port) || DEFAULT_PORT;
    const listenHost = process.env.CANVAS_AGENT_HOST || process.env.HOST || "127.0.0.1";
    const publicHost = process.env.CANVAS_AGENT_PUBLIC_HOST || (listenHost === "0.0.0.0" ? "127.0.0.1" : listenHost);
    config.url = `http://${publicHost}:${port}`;
    saveConfig(config);

    const session = new CanvasSession();
    const emit = (type: string, payload: unknown) => session.emitAll(type, payload);
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "30mb" }));
    app.use((req, res, next) => {
        const url = requestUrl(req, config);
        if (!setCors(req, res, url, config)) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        if (req.method === "OPTIONS") return void res.json({});
        next();
    });
    app.get("/health", (_req, res) => res.json(session.health()));
    app.get("/config", (_req, res) => res.json({ ok: true, url: config.url, listenHost, lanUrls: lanUrls(port), hasToken: true }));
    app.use((req, res, next) => {
        if (validToken(req, requestUrl(req, config), config.token)) return next();
        res.status(401).json({ ok: false, error: "invalid token" });
    });
    app.get("/events", (req, res) => session.openEvents(requestUrl(req, config), res));
    app.post("/canvas/state", (req, res) => {
        session.updateState(req.body, String(req.query.clientId || "") || undefined);
        res.json({ ok: true });
    });
    app.post("/canvas/result", (req, res) => {
        session.resolveResult(req.body);
        res.json({ ok: true });
    });
    app.post("/api/tools", route(async (req, res) => res.json({ ok: true, result: await session.callTool(req.body?.name, req.body?.input || {}) })));
    app.get("/agent/codex/workspace", (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.query.canvasId || ""));
        res.json({ ok: true, workspace });
    });
    app.post("/agent/codex/workspace", (req, res) => {
        const workspace = updateCanvasWorkspace(config, String(req.body?.canvasId || ""), { workspacePath: String(req.body?.workspacePath || "") || undefined });
        res.json({ ok: true, workspace });
    });
    app.get("/agent/codex/threads", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.query.canvasId || ""));
        const result = await listCodexThreads(emit, { cwd: workspace.workspacePath, searchTerm: String(req.query.searchTerm || "") });
        res.json({ ok: true, workspace, ...result });
    }));
    app.get("/agent/codex/workspaces", route(async (req, res) => {
        const result = await listCodexThreads(emit, { searchTerm: String(req.query.searchTerm || ""), limit: Number(req.query.limit || 160) || 160 });
        const projects = codexWorkspaceProjects(config, result.data);
        res.json({ ok: true, projects, data: result.data, nextCursor: result.nextCursor, backwardsCursor: result.backwardsCursor });
    }));
    app.post("/agent/codex/threads/new", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.body?.canvasId || ""));
        const thread = await startCodexThread(emit, workspace.workspacePath);
        const activeThreadId = String((thread as Record<string, unknown>).id || "");
        updateCanvasWorkspace(config, workspace.canvasId, { activeThreadId });
        res.json({ ok: true, workspace: { ...workspace, activeThreadId }, thread: summarizeCodexThread(thread), messages: [] });
    }));
    app.get("/agent/codex/threads/:threadId", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.query.canvasId || ""));
        const threadId = routeParam(req.params.threadId);
        res.json({ ok: true, workspace, ...(await readCodexThread(emit, threadId, workspace.workspacePath)) });
    }));
    app.post("/agent/codex/threads/:threadId/resume", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.body?.canvasId || ""));
        const threadId = routeParam(req.params.threadId);
        const result = await resumeCodexThread(emit, threadId, workspace.workspacePath);
        updateCanvasWorkspace(config, workspace.canvasId, { activeThreadId: threadId });
        res.json({ ok: true, workspace: { ...workspace, activeThreadId: threadId }, ...result });
    }));
    app.post("/agent/codex/threads/:threadId/delete", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.body?.canvasId || ""));
        const threadId = routeParam(req.params.threadId);
        await archiveCodexThread(emit, threadId, workspace.workspacePath);
        if (workspace.activeThreadId === threadId) updateCanvasWorkspace(config, workspace.canvasId, { activeThreadId: undefined });
        res.json({ ok: true });
    }));
    app.post("/agent/codex/turn", route(async (req, res) => {
        const attachments = Array.isArray(req.body?.attachments) ? (req.body.attachments as AgentAttachment[]) : [];
        const workspace = ensureCanvasWorkspace(config, String(req.body?.canvasId || ""));
        let threadId = String(req.body?.threadId || workspace.activeThreadId || "");
        if (!threadId) {
            const thread = await startCodexThread(emit, workspace.workspacePath);
            threadId = String((thread as Record<string, unknown>).id || "");
            updateCanvasWorkspace(config, workspace.canvasId, { activeThreadId: threadId });
        } else if (threadId !== workspace.activeThreadId) {
            await verifyCodexThreadWorkspace(emit, threadId, workspace.workspacePath);
            updateCanvasWorkspace(config, workspace.canvasId, { activeThreadId: threadId });
        }
        void runCodexTurn(withAgentPrompt(String(req.body?.prompt || "")), emit, attachments, { threadId, cwd: workspace.workspacePath });
        res.json({ ok: true, threadId });
    }));
    app.get("/agent/git/repos", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.query.canvasId || ""));
        res.json({ ok: true, workspace, repos: discoverGitRepos(workspace.workspacePath) });
    }));
    app.post("/agent/git/push", route(async (req, res) => {
        const workspace = ensureCanvasWorkspace(config, String(req.body?.canvasId || ""));
        const repos = discoverGitRepos(workspace.workspacePath);
        const requestedRepoPath = String(req.body?.repoPath || "").trim();
        const defaultRepoPath = resolveGitWorkspace(workspace.workspacePath);
        const repo = requestedRepoPath ? findRepoByPath(repos, requestedRepoPath) : findRepoByPath(repos, defaultRepoPath) || repos[0];
        if (!repo) throw new Error("No Git repository was found on this computer.");
        if (repo.pushBlocked && !req.body?.allowBlocked) throw new Error(`Refusing to push ${repo.repoPath}: ${repo.warnings.join(" ")}`);
        const remote = safeGitRef(String(req.body?.remote || repo.defaultRemote || "origin"), "origin");
        const branch = safeGitRef(String(req.body?.branch || repo.defaultBranch || "main"), "main");
        const result = await runGitPush(repo.repoPath, remote, branch);
        res.json({ ok: true, workspace, repo, remote, branch, ...result });
    }));
    app.post("/agent/claude/turn", (req, res) => {
        runClaudeTurn(withAgentPrompt(String(req.body?.prompt || "")), emit);
        res.json({ ok: true });
    });
    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ ok: false, error: error.message }));

    app.listen(port, listenHost, () => {
        console.log("Infinite Canvas Agent");
        console.log(`Local URL: ${config.url}`);
        if (listenHost === "0.0.0.0") lanUrls(port).forEach((url) => console.log(`LAN URL: ${url}`));
        console.log(`Connect token: ${config.token}`);
        console.log("Codex MCP: codex mcp add infinite-canvas -- npx -y @basketikun/canvas-agent mcp");
    });
}

function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

function requestUrl(req: Request, config: CanvasAgentConfig) {
    return new URL(req.originalUrl || req.url || "/", config.url);
}

function setCors(req: Request, res: Response, url: URL, config: CanvasAgentConfig) {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type,x-canvas-agent-token");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (!origin || req.method === "OPTIONS" || url.pathname === "/health" || url.pathname === "/config") return true;
    config.origins ||= [];
    if (validToken(req, url, config.token) && !config.origins.includes(origin)) {
        config.origins.push(origin);
        saveConfig(config);
    }
    res.setHeader("Vary", "Origin");
    return config.origins.includes(origin);
}

function validToken(req: Request, url: URL, token: string) {
    const header = req.headers["x-canvas-agent-token"];
    return url.searchParams.get("token") === token || header === token || (Array.isArray(header) && header.includes(token));
}

function lanUrls(port: number) {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((item): item is NetworkInterfaceInfo => Boolean(item && item.family === "IPv4" && !item.internal))
        .map((item) => `http://${item.address}:${port}`);
}

function codexWorkspaceProjects(config: CanvasAgentConfig, threads: unknown[]) {
    const projects = new Map<string, CodexWorkspaceProject>();
    Object.entries(config.canvases || {}).forEach(([canvasId, workspace]) => {
        if (!workspace.workspacePath) return;
        const workspacePath = path.resolve(workspace.workspacePath);
        const key = repoKey(workspacePath);
        projects.set(key, {
            id: canvasId,
            label: workspaceLabel(canvasId, workspacePath),
            canvasId,
            workspacePath,
            threadId: workspace.activeThreadId || "",
            threadCount: 0,
            updatedAt: 0,
            source: "saved",
        });
    });
    threads.forEach((thread) => {
        const cwd = String(recordField(thread, "cwd") || "");
        if (!cwd) return;
        const workspacePath = path.resolve(cwd);
        const key = repoKey(workspacePath);
        const updatedAt = Number(recordField(thread, "updatedAt") || recordField(thread, "createdAt") || 0);
        const threadId = String(recordField(thread, "id") || "");
        const existing = projects.get(key);
        if (existing) {
            existing.threadCount += 1;
            if (updatedAt > existing.updatedAt) {
                existing.updatedAt = updatedAt;
                if (!existing.threadId || existing.source === "discovered") existing.threadId = threadId;
            }
            return;
        }
        const canvasId = workspaceCanvasId(workspacePath);
        projects.set(key, {
            id: canvasId,
            label: workspaceLabel("", workspacePath),
            canvasId,
            workspacePath,
            threadId,
            threadCount: 1,
            updatedAt,
            source: "discovered",
        });
    });
    return [...projects.values()].sort((a, b) => {
        if (a.source !== b.source) return a.source === "saved" ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0) || a.label.localeCompare(b.label);
    });
}

function workspaceCanvasId(workspacePath: string) {
    const basename = path.basename(workspacePath).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 32) || "workspace";
    const hash = Buffer.from(path.resolve(workspacePath).toLowerCase()).toString("base64url").slice(0, 18);
    return `${basename}-${hash}`;
}

function workspaceLabel(canvasId: string, workspacePath: string) {
    const name = path.basename(workspacePath) || workspacePath;
    if (canvasId && !canvasId.startsWith("workspace-") && canvasId !== "default") return canvasId;
    return name;
}

function recordField(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function safeGitRef(value: string, fallback: string) {
    const ref = value.trim() || fallback;
    if (!/^[a-zA-Z0-9._/-]+$/.test(ref) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) throw new Error("Unsafe git push argument.");
    return ref;
}

function runGitPush(repoPath: string, remote: string, branch: string) {
    const topLevel = gitTopLevel(repoPath);
    if (!topLevel || !samePath(topLevel, repoPath)) throw new Error("Selected path is not a valid Git repository.");
    return new Promise<{ repoPath: string; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn("git", ["push", remote, `HEAD:${branch}`], { cwd: repoPath, windowsHide: true });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
        child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) return resolve({ repoPath, stdout: stdout.trim(), stderr: stderr.trim() });
            reject(new Error(`git push failed (${code ?? "unknown"}): ${(stderr || stdout || "no output").trim()}`));
        });
    });
}

function discoverGitRepos(workspacePath: string) {
    const repos = new Map<string, GitRepoInfo>();
    repoDiscoveryRoots(workspacePath).forEach((root) => collectGitRepos(root, repos, 0, 2));
    return [...repos.values()].sort((a, b) => a.repoPath.localeCompare(b.repoPath));
}

function repoDiscoveryRoots(workspacePath: string) {
    const roots = new Set<string>();
    const add = (value: string | undefined) => {
        if (!value) return;
        const resolved = path.resolve(value);
        if (fs.existsSync(resolved)) roots.add(resolved);
    };
    const workspace = path.resolve(workspacePath);
    const workspaceParent = path.dirname(workspace);
    add(workspace);
    if (workspaceParent !== workspace && workspaceParent !== path.parse(workspace).root) add(workspaceParent);
    add(process.cwd());
    add(path.dirname(process.cwd()));
    add(path.join(os.homedir(), "Documents"));
    if (process.env.CANVAS_AGENT_REPO_ROOTS) process.env.CANVAS_AGENT_REPO_ROOTS.split(path.delimiter).forEach(add);
    if (process.platform === "win32") {
        add("D:\\canvas");
        add("D:\\new-api");
        add("D:\\prompt-stack-package");
    }
    return [...roots].sort((a, b) => a.length - b.length);
}

function collectGitRepos(root: string, repos: Map<string, GitRepoInfo>, depth: number, maxDepth: number) {
    if (repos.size >= 80 || !fs.existsSync(root)) return;
    const topLevel = gitTopLevel(root);
    if (topLevel) {
        const repoPath = path.resolve(topLevel);
        const key = repoKey(repoPath);
        if (!repos.has(key)) repos.set(key, inspectGitRepo(repoPath));
        if (samePath(repoPath, root)) return;
    }
    if (depth >= maxDepth) return;
    let children: fs.Dirent[];
    try {
        children = fs.readdirSync(root, { withFileTypes: true });
    } catch {
        return;
    }
    for (const item of children) {
        if (!item.isDirectory() || ignoredGitSearchDir(item.name)) continue;
        collectGitRepos(path.join(root, item.name), repos, depth + 1, maxDepth);
        if (repos.size >= 80) return;
    }
}

function inspectGitRepo(repoPath: string): GitRepoInfo {
    const branch = gitOutput(repoPath, ["branch", "--show-current"]) || gitOutput(repoPath, ["rev-parse", "--short", "HEAD"]) || "detached";
    const remotes = parseGitRemotes(gitOutput(repoPath, ["remote", "-v"]));
    const defaultRemote = remotes.find((item) => item.name === "origin")?.name || remotes[0]?.name || "";
    const defaultBranch = (defaultRemote && remoteDefaultBranch(repoPath, defaultRemote)) || (branch === "detached" ? "main" : branch) || "main";
    const statusShort = gitOutput(repoPath, ["status", "--short"])
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .slice(0, 80);
    const warnings: string[] = [];
    const upstreamRemote = remotes.find((remote) => remoteLooksLikeUpstream(remote.url));
    if (!remotes.length) warnings.push("No git remote is configured.");
    if (statusShort.length) warnings.push("There are uncommitted changes; phone push sends committed HEAD only.");
    if (upstreamRemote) warnings.push(`Remote ${upstreamRemote.name} looks like an upstream/source repository. Set a personal fork before pushing.`);
    return {
        repoPath,
        branch,
        defaultRemote,
        defaultBranch,
        remotes,
        dirty: statusShort.length > 0,
        statusShort,
        warnings,
        pushBlocked: !remotes.length || Boolean(upstreamRemote),
    };
}

function parseGitRemotes(value: string): GitRemoteInfo[] {
    const remotes = new Map<string, string>();
    value.split(/\r?\n/).forEach((line) => {
        const match = line.match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/);
        if (!match) return;
        const [, name, url, kind] = match;
        if (kind === "fetch" || !remotes.has(name)) remotes.set(name, url);
    });
    return [...remotes.entries()].map(([name, url]) => ({ name, url }));
}

function remoteDefaultBranch(repoPath: string, remote: string) {
    const ref = gitOutput(repoPath, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`]);
    return ref.replace(`${remote}/`, "");
}

function findRepoByPath(repos: GitRepoInfo[], repoPath: string) {
    return repos.find((repo) => samePath(repo.repoPath, repoPath));
}

function ignoredGitSearchDir(name: string) {
    return new Set([".git", ".next", ".turbo", ".vercel", "node_modules", "dist", "build", "coverage", ".cache"]).has(name);
}

function remoteLooksLikeUpstream(url: string) {
    const normalized = url.toLowerCase().replace(/\\/g, "/").replace(/:/g, "/").replace(/\.git$/, "");
    return normalized.includes("github.com/quantumnous/new-api") || normalized.includes("github.com/zhizinan1997/jimeng-free-api-all");
}

function gitOutput(cwd: string, args: string[]) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    return result.status === 0 ? result.stdout.trim() : "";
}

function resolveGitWorkspace(cwd: string) {
    const current = gitTopLevel(cwd);
    if (current) return current;
    try {
        const children = fs.readdirSync(cwd, { withFileTypes: true });
        for (const item of children) {
            if (!item.isDirectory()) continue;
            const repo = gitTopLevel(path.join(cwd, item.name));
            if (repo) return repo;
        }
    } catch {
        // Let the caller return the actionable error.
    }
    return cwd;
}

function gitTopLevel(cwd: string) {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", windowsHide: true });
    return result.status === 0 ? path.resolve(result.stdout.trim()) : "";
}

function samePath(a: string, b: string) {
    const left = path.resolve(a);
    const right = path.resolve(b);
    return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function repoKey(repoPath: string) {
    const resolved = path.resolve(repoPath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
