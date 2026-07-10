#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const inboxes = {
    knowledge: {
        dir: path.join(appRoot, "knowledge", "creative", "raw"),
        script: path.join(__dirname, "ingest-creative-knowledge.mjs"),
        label: "知识资料",
        args: [],
    },
    cases: {
        dir: path.join(appRoot, "knowledge", "creative", "cases", "raw"),
        script: path.join(__dirname, "ingest-creative-cases.mjs"),
        label: "故事案例",
        args: [],
    },
    subtitles: {
        dir: path.join(appRoot, "knowledge", "creative", "videos"),
        script: path.join(__dirname, "extract-video-subtitles.mjs"),
        label: "视频字幕",
        args: ["--no-picker"],
    },
};
const debounceMs = 2200;
const retryDelays = [60_000, 300_000, 1_200_000];
const states = new Map(Object.keys(inboxes).map((key) => [key, { timer: null, running: false, rerun: false, retryCount: 0 }]));
const watchers = [];

for (const inbox of Object.values(inboxes)) await fsp.mkdir(inbox.dir, { recursive: true });

function schedule(key, reason, { delay = debounceMs, resetRetries = true } = {}) {
    const state = states.get(key);
    if (resetRetries) state.retryCount = 0;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        state.timer = null;
        void runTask(key, reason);
    }, delay);
}

async function runTask(key, reason) {
    const state = states.get(key);
    const inbox = inboxes[key];
    if (state.running) {
        state.rerun = true;
        return;
    }
    state.running = true;
    console.log(`\n[创作资料收件箱] ${inbox.label}检测到${reason}，开始处理...`);
    const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", inbox.script, ...inbox.args], { cwd: appRoot, stdio: "inherit", env: process.env });
    const exitCode = await new Promise((resolve) => child.once("exit", resolve));
    state.running = false;
    console.log(`[创作资料收件箱] ${inbox.label}处理结束（exit ${exitCode ?? "unknown"}）。\n`);
    if (state.rerun) {
        state.rerun = false;
        schedule(key, "处理期间新增的文件");
    } else if (exitCode && state.retryCount < retryDelays.length) {
        const delay = retryDelays[state.retryCount];
        state.retryCount += 1;
        console.log(`[创作资料收件箱] ${inbox.label}将在 ${Math.round(delay / 60_000)} 分钟后进行第 ${state.retryCount} 次自动重试。`);
        schedule(key, "上次处理失败", { delay, resetRetries: false });
    } else if (exitCode) {
        console.error(`[创作资料收件箱] ${inbox.label}已达到本次运行的自动重试上限；修复网络或资料后，修改文件或重启监听器即可继续。`);
    } else {
        state.retryCount = 0;
    }
}

for (const [key, inbox] of Object.entries(inboxes)) {
    const watcher = fs.watch(inbox.dir, { recursive: true }, (_eventType, filename) => schedule(key, filename ? `文件变化：${filename}` : "文件变化"));
    watcher.on("error", (error) => console.error(`[创作资料收件箱] ${inbox.label}监听失败：${error.message}`));
    watchers.push(watcher);
}

console.log("[创作资料收件箱] 已启动：");
for (const inbox of Object.values(inboxes)) console.log(`- ${inbox.label}：${inbox.dir}`);
console.log("按 Ctrl+C 停止。\n");

if (process.argv.includes("--check")) {
    closeAll();
    console.log("[创作资料收件箱] 三类目录自检通过。");
    process.exit(0);
}

for (const key of Object.keys(inboxes)) schedule(key, "启动扫描");

function closeAll() {
    for (const watcher of watchers) watcher.close();
    for (const state of states.values()) if (state.timer) clearTimeout(state.timer);
}

process.on("SIGINT", () => {
    closeAll();
    process.exit(0);
});
