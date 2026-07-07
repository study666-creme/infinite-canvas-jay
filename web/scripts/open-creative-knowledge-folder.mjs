#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const rawDir = path.join(appRoot, "knowledge", "creative", "raw");

await fs.mkdir(rawDir, { recursive: true });

const command = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
const child = spawn(command, [rawDir], { detached: true, stdio: "ignore", windowsHide: false });
child.unref();

console.log(`Opened creative knowledge folder: ${rawDir}`);
