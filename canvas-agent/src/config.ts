import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 17371;
export const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const VERSION = readPackageVersion();
export const AGENT_PROMPT = `You are helping the user operate an Infinite Canvas workspace.

Use the configured infinite-canvas MCP tools whenever the request requires reading or changing the canvas. Start by calling canvas_get_state so decisions are based on the current canvas. Use the smallest suitable tool for the requested change, use canvas_apply_ops only for complex batches, and use delete_connections when removing connections.

Only use node IDs and state returned by tools. Do not fabricate tool results, simulate mouse clicks, or ask the user to copy JSON manually. Respect the user's requested order and do not impose an industry workflow, creative methodology, knowledge base, or business preset unless a relevant optional local extension has been configured. Ask for clarification when the requested outcome is materially ambiguous. Follow the interface's confirmation rules for generation, deletion, and other consequential operations.`;

export type CanvasWorkspaceConfig = { workspacePath: string; activeThreadId?: string; pinnedThreadIds?: string[]; model?: string; effort?: string };
export type CanvasAgentConfig = { url: string; token: string; origins?: string[]; canvases?: Record<string, CanvasWorkspaceConfig> };

export function loadConfig(create = false): CanvasAgentConfig {
    try {
        const config = normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig);
        if (create) saveConfig(config);
        return config;
    } catch {
        const config = normalizeConfig({ url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") });
        if (create) saveConfig(config);
        return config;
    }
}

export function saveConfig(config: CanvasAgentConfig) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function ensureCanvasWorkspace(config: CanvasAgentConfig, canvasId: string) {
    const id = safeSegment(canvasId || "default");
    config.canvases ||= {};
    const current = config.canvases[id];
    if (current?.workspacePath) {
        fs.mkdirSync(resolveWorkspacePath(current.workspacePath), { recursive: true });
        return { canvasId: id, ...current, workspacePath: resolveWorkspacePath(current.workspacePath) };
    }
    const defaultWorkspace = process.env.CODEX_REMOTE_WORKSPACE || process.env.CANVAS_AGENT_WORKSPACE || "";
    const workspacePath = id === "default" && defaultWorkspace ? resolveWorkspacePath(defaultWorkspace) : path.join(CONFIG_DIR, "codex-workspaces", id);
    config.canvases[id] = { workspacePath };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config);
    return { canvasId: id, workspacePath };
}

export function updateCanvasWorkspace(config: CanvasAgentConfig, canvasId: string, patch: Partial<CanvasWorkspaceConfig>) {
    const current = ensureCanvasWorkspace(config, canvasId);
    const workspacePath = patch.workspacePath ? resolveWorkspacePath(patch.workspacePath) : current.workspacePath;
    const next = { ...current, ...patch, workspacePath };
    config.canvases ||= {};
    config.canvases[current.canvasId] = { workspacePath: next.workspacePath, activeThreadId: next.activeThreadId, pinnedThreadIds: next.pinnedThreadIds, model: next.model, effort: next.effort };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config);
    return { canvasId: current.canvasId, ...config.canvases[current.canvasId] };
}

function resolveWorkspacePath(value: string) {
    if (value === "~") return os.homedir();
    if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
}

function normalizeConfig(config: CanvasAgentConfig) {
    const token = String(process.env.CODEX_REMOTE_TOKEN || process.env.CANVAS_AGENT_TOKEN || "").trim();
    const publicUrl = String(process.env.CODEX_REMOTE_PUBLIC_URL || process.env.CODEX_REMOTE_URL || process.env.CANVAS_AGENT_PUBLIC_URL || process.env.CANVAS_AGENT_URL || "").trim();
    if (!config.token) config.token = crypto.randomBytes(18).toString("hex");
    if (token) config.token = token;
    if (!config.url) config.url = `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`;
    if (publicUrl) config.url = publicUrl.replace(/\/+$/, "");
    return config;
}

function safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "default";
}

function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
