#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRoot, resolveCommand, walkFiles } from "./ingest-creative-knowledge.mjs";
import { finishIngestJob, openCreativeLibraryDb, startIngestJob } from "./creative-library-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inboxDir = path.join(appRoot, "knowledge", "creative", "videos", "inbox");
const defaultUrlFile = path.join(appRoot, "knowledge", "creative", "videos", "urls.txt");
const defaultOutputDir = path.join(appRoot, "knowledge", "creative", "raw");
const transcribeScript = path.join(__dirname, "transcribe-video.py");
const videoExts = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".ts", ".mts", ".m2ts"]);
const browserNames = new Set(["edge", "chrome", "firefox"]);
const defaultMaxVideos = 200;
const defaultIntervalSeconds = 2.5;
const defaultItemRetries = 2;
const itemRetryDelayMs = 3_000;
const ytDlpTimeoutMs = Object.freeze({
    probe: 15_000,
    expand: 120_000,
    metadata: 90_000,
    subtitle: 180_000,
    audio: 15 * 60_000,
});
let detectedBrowsers;
let activeTask = null;
let terminating = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => terminateFromSignal(signal));
}

try {
    await main();
} catch (error) {
    console.error(`[字幕任务失败] ${safeErrorMessage(error)}`);
    process.exitCode = 1;
}

async function main() {
    const argv = process.argv.slice(2);
    if (argv.includes("--help") || argv.includes("-h")) {
        printHelp();
        return;
    }
    const args = parseArgs(argv);
    const options = await normalizeOptions(args);
    const outputDir = path.resolve(appRoot, args.output || defaultOutputDir);
    await fs.mkdir(inboxDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    const sources = await collectInputs(args);
    if (!sources.localInputs.length && !sources.remoteUrls.length && process.platform === "win32" && process.stdin.isTTY && !args["no-picker"] && !options.expandOnly) {
        sources.localInputs.push(...pickVideoFiles());
    }
    if (options.expandOnly && sources.localInputs.length) {
        throw new Error("--expand-only 仅接受远程 URL，不能与本地视频输入同时使用");
    }
    if (!sources.localInputs.length && !sources.remoteUrls.length) {
        console.log(`没有找到视频。可以把视频放到：${inboxDir}`);
        console.log(`也可以把视频 URL 每行一条写入：${defaultUrlFile}`);
        console.log("或运行：npm run knowledge:subtitle -- --url \"https://example.com/video\"");
        return;
    }

    const ffmpeg = resolveCommand("ffmpeg") || "";
    const ffprobe = sources.localInputs.length ? resolveCommand("ffprobe") : "";
    const needsFfmpeg = sources.localInputs.length > 0 || (sources.remoteUrls.length > 0 && !options.expandOnly);
    if ((needsFfmpeg && !ffmpeg) || (sources.localInputs.length && !ffprobe)) {
        throw new Error("未找到 FFmpeg/ffprobe。请安装 Gyan.FFmpeg 后重试。");
    }

    const { db } = openCreativeLibraryDb(args.db);
    const counters = { succeeded: 0, failed: 0, total: 0 };
    try {
        for (const input of sources.localInputs) {
            counters.total += 1;
            const status = await processLocalVideo({ input, outputDir, ffmpeg, ffprobe, args, db });
            if (status === "completed") counters.succeeded += 1;
            if (status === "failed") counters.failed += 1;
        }

        if (sources.remoteUrls.length) {
            const ytDlp = ensureYtDlp(args);
            const expanded = [];
            for (const sourceUrl of sources.remoteUrls) {
                try {
                    const result = expandRemoteUrl({ ytDlp, sourceUrl, ffmpeg, options });
                    expanded.push(...result.entries.map((entry) => ({ ...entry, preferredAuth: result.preferredAuth })));
                    console.log(
                        `[合集展开] ${remoteHost(sourceUrl)}：实际条目 ${result.entries.length}，唯一 ID ${countUniqueRemoteIds(result.entries)}，认证候选 ${describeAuth(result.preferredAuth)}`,
                    );
                } catch (error) {
                    counters.total += 1;
                    counters.failed += 1;
                    recordRemoteFailure(db, sourceUrl, error);
                }
            }

            console.log(`[合集展开汇总] 实际条目 ${expanded.length}，唯一 ID ${countUniqueRemoteIds(expanded)}`);
            const namedEntries = assignRemoteOutputStems(expanded);
            const availableEntries = namedEntries.slice(options.startIndex - 1);
            const availableUniqueIds = countUniqueRemoteIds(availableEntries);
            if (args["max-videos"] !== undefined && options.maxVideos === 60 && (availableEntries.length < 60 || availableUniqueIds < 60)) {
                throw new Error(
                    `--max-videos 60 要求从第 ${options.startIndex} 条起至少有 60 条唯一视频，但合集实际展开 ${expanded.length} 条、唯一 ID ${countUniqueRemoteIds(expanded)} 个；该起点后仅 ${availableEntries.length} 条、${availableUniqueIds} 个唯一 ID`,
                );
            }
            const selected = namedEntries.slice(options.startIndex - 1, options.startIndex - 1 + options.maxVideos);
            if (expanded.length && !selected.length) {
                console.log(`[URL 字幕] --start-index ${options.startIndex} 超出已展开的 ${expanded.length} 条视频，未处理远程条目。`);
            } else if (selected.length < Math.max(0, expanded.length - options.startIndex + 1)) {
                console.log(`[URL 字幕] 已按 --max-videos 限制为 ${selected.length} 条（共展开 ${expanded.length} 条）。`);
            }

            if (options.expandOnly) {
                console.log(`[合集展开完成] 将处理 ${selected.length} 条；--expand-only 未下载字幕、音频或视频。`);
                if (counters.failed) process.exitCode = 2;
                return;
            }

            for (let index = 0; index < selected.length; index += 1) {
                counters.total += 1;
                const status = await processRemoteVideoWithRetries({
                    item: selected[index],
                    itemPosition: index + 1,
                    itemTotal: selected.length,
                    outputDir,
                    ffmpeg,
                    ytDlp,
                    args,
                    options,
                    db,
                });
                if (status === "completed") counters.succeeded += 1;
                if (status === "failed") counters.failed += 1;
                if (index < selected.length - 1 && options.intervalSeconds > 0) await sleep(options.intervalSeconds * 1000);
            }
        }
    } finally {
        db.close();
    }

    console.log(`字幕任务完成：${counters.succeeded}/${counters.total}。输出目录：${outputDir}`);
    if (counters.failed) process.exitCode = 2;
}

function printHelp() {
    console.log(`用法：npm run knowledge:subtitle -- [选项] [视频文件或 URL...]

远程合集选项：
  --url <URL>             添加视频、播放列表或合集 URL，可重复
  --url-file <文件>       从文件读取 URL，每行一条
  --start-index <N>       从展开结果的第 N 条开始，默认 1
  --max-videos <N>        最多处理 N 条；指定 60 时，展开不足 60 条会失败
  --expand-only           只展开和校验条目数量，不下载任何媒体
  --item-retries <N>      每条失败后的外层重试次数，默认 ${defaultItemRetries}
  --interval <秒>         条目之间的等待时间，默认 ${defaultIntervalSeconds}

认证选项：
  --cookies <文件>        使用 cookies.txt，失败或超时后回退匿名访问
  --browser <名称>        使用 edge、chrome 或 firefox，之后回退匿名访问

输出选项：
  --output <目录>         SRT 输出目录
  --language <语言>       首选字幕或转写语言
  --model <名称>          faster-whisper 模型，默认 small
  --force                 重新生成已有字幕
  --embedded-only         没有文本字幕时不做语音转写
  --no-install            不自动安装 Python 依赖
  --no-picker             没有输入时不打开文件选择器
  -h, --help              显示帮助`);
}

function parseArgs(argv) {
    const result = { inputs: [], remoteSources: [] };
    const repeatableValueOptions = new Set(["input", "url", "url-file"]);
    const valueOptions = new Set([
        ...repeatableValueOptions,
        "output",
        "db",
        "language",
        "model",
        "cookies",
        "browser",
        "start-index",
        "max-videos",
        "interval",
        "item-retries",
    ]);
    const booleanOptions = new Set(["force", "embedded-only", "no-install", "no-picker", "expand-only"]);
    let positionalOnly = false;

    for (let index = 0; index < argv.length; index += 1) {
        const item = argv[index];
        if (positionalOnly || !item.startsWith("--")) {
            addPositionalSource(result, item);
            continue;
        }
        if (item === "--") {
            positionalOnly = true;
            continue;
        }

        const equalsIndex = item.indexOf("=");
        const key = item.slice(2, equalsIndex < 0 ? undefined : equalsIndex);
        const inlineValue = equalsIndex < 0 ? undefined : item.slice(equalsIndex + 1);
        if (booleanOptions.has(key)) {
            if (inlineValue !== undefined) throw new Error(`--${key} 不接受参数值`);
            result[key] = true;
            continue;
        }
        if (!valueOptions.has(key)) throw new Error(`未知参数：--${key}`);

        const value = inlineValue ?? argv[index + 1];
        if (!value || (inlineValue === undefined && value.startsWith("--"))) throw new Error(`--${key} 缺少参数值`);
        if (inlineValue === undefined) index += 1;
        if (key === "input") result.inputs.push(value);
        else if (key === "url" || key === "url-file") result.remoteSources.push({ type: key, value });
        else result[key] = value;
    }
    return result;
}

function addPositionalSource(result, value) {
    if (isRemoteUrl(value)) result.remoteSources.push({ type: "url", value });
    else result.inputs.push(value);
}

async function normalizeOptions(args) {
    const options = {
        startIndex: positiveIntegerArg(args["start-index"], 1, "--start-index"),
        maxVideos: positiveIntegerArg(args["max-videos"], defaultMaxVideos, "--max-videos"),
        intervalSeconds: nonNegativeNumberArg(args.interval, defaultIntervalSeconds, "--interval"),
        itemRetries: nonNegativeIntegerArg(args["item-retries"], defaultItemRetries, "--item-retries"),
        cookies: args.cookies ? path.resolve(String(args.cookies)) : "",
        browser: String(args.browser || "").toLowerCase(),
        expandOnly: Boolean(args["expand-only"]),
    };
    if (options.cookies && options.browser) throw new Error("--cookies 与 --browser 只能选择一种登录态来源");
    if (options.browser && !browserNames.has(options.browser)) throw new Error("--browser 仅支持 edge、chrome 或 firefox");
    if (options.cookies) {
        try {
            await fs.access(options.cookies);
        } catch {
            throw new Error(`找不到 --cookies 指定的文件：${options.cookies}`);
        }
    }
    return options;
}

function nonNegativeIntegerArg(value, fallback, name) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} 必须是大于等于 0 的整数`);
    return parsed;
}

function positiveIntegerArg(value, fallback, name) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} 必须是大于等于 1 的整数`);
    return parsed;
}

function nonNegativeNumberArg(value, fallback, name) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} 必须是大于等于 0 的数字`);
    return parsed;
}

async function collectInputs(args) {
    const hasExplicitSources = args.inputs.length > 0 || args.remoteSources.length > 0;
    const localInputs = args.inputs.map((item) => path.resolve(item));
    const remoteUrls = [];

    if (!hasExplicitSources) {
        localInputs.push(...(await walkFiles(inboxDir)).filter((file) => videoExts.has(path.extname(file).toLowerCase())));
        remoteUrls.push(...(await readUrlFile(defaultUrlFile, { optional: true })));
        return { localInputs, remoteUrls };
    }

    for (const source of args.remoteSources) {
        if (source.type === "url") {
            if (!isRemoteUrl(source.value)) throw new Error(`不是有效的 HTTP(S) 视频 URL：${source.value}`);
            remoteUrls.push(source.value.trim());
        } else {
            remoteUrls.push(...(await readUrlFile(path.resolve(source.value), { optional: false })));
        }
    }
    return { localInputs, remoteUrls };
}

async function readUrlFile(file, { optional }) {
    let content;
    try {
        content = await fs.readFile(file, "utf8");
    } catch (error) {
        if (optional && error?.code === "ENOENT") return [];
        throw new Error(`无法读取 URL 文件 ${file}：${safeErrorMessage(error)}`);
    }
    const urls = [];
    for (const [index, rawLine] of content.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        if (!isRemoteUrl(line)) throw new Error(`${file}:${index + 1} 不是有效的 HTTP(S) URL`);
        urls.push(line);
    }
    return urls;
}

function isRemoteUrl(value) {
    try {
        const parsed = new URL(String(value || "").trim());
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

async function processLocalVideo({ input, outputDir, ffmpeg, ffprobe, args, db }) {
    if (!videoExts.has(path.extname(input).toLowerCase())) {
        console.warn(`跳过非视频文件：${input}`);
        return "skipped";
    }
    const jobId = startIngestJob(db, { jobType: "subtitle", sourceKey: input, sourcePath: input });
    beginActiveTask({ db, jobId, label: path.basename(input) });
    let outputPart = "";
    try {
        await fs.access(input);
        await waitForStableFile(input);
        const streams = probeSubtitleStreams(ffprobe, input);
        const stream = chooseSubtitleStream(streams, args.language);
        const language = normalizeLanguage(stream?.tags?.language || args.language || "zh");
        const output = uniqueOutputPath(outputDir, input, language);
        if (!args.force && (await outputIsCurrent(input, output))) {
            finishIngestJob(db, jobId, { status: "completed" });
            markActiveTaskFinished(jobId);
            console.log(`[字幕跳过] 已是最新：${path.relative(appRoot, output)}`);
            return "completed";
        }

        outputPart = subtitlePartPath(output);
        registerActivePart(outputPart);
        await fs.rm(outputPart, { force: true });
        let method = "embedded";
        if (stream) {
            const result = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", input, "-map", `0:${stream.index}`, "-c:s", "srt", "-f", "srt", outputPart], {
                encoding: "utf8",
                maxBuffer: 20 * 1024 * 1024,
            });
            if (result.status !== 0) {
                if (args["embedded-only"]) throw new Error(result.stderr || "内嵌字幕轨无法转换为 SRT");
                method = "speech-to-text";
                await fs.rm(outputPart, { force: true });
                transcribe(input, outputPart, args);
            }
        } else {
            if (args["embedded-only"]) throw new Error("视频没有可提取的内嵌字幕轨");
            method = "speech-to-text";
            transcribe(input, outputPart, args);
        }
        await publishSubtitle(outputPart, output);
        finishIngestJob(db, jobId, { status: "completed" });
        markActiveTaskFinished(jobId);
        console.log(`[字幕完成] ${path.basename(input)} -> ${path.relative(appRoot, output)} (${method})`);
        return "completed";
    } catch (error) {
        const message = safeErrorMessage(error);
        finishIngestJob(db, jobId, { status: "failed", error: message });
        markActiveTaskFinished(jobId);
        console.error(`[字幕失败] ${path.basename(input)}: ${message}`);
        return "failed";
    } finally {
        if (outputPart) await fs.rm(outputPart, { force: true }).catch(() => {});
        endActiveTask(jobId);
    }
}

function ensureYtDlp(args) {
    const pythonCommands = findPythonCommands();
    for (const python of pythonCommands) {
        if (probeCommand(python, ["-m", "yt_dlp", "--version"])) return { command: python, prefix: ["-m", "yt_dlp"] };
    }

    if (pythonCommands.length && !args["no-install"]) {
        const python = pythonCommands[0];
        console.log("未找到 yt-dlp Python 模块，正在自动安装 yt-dlp...");
        const install = spawnSync(python, ["-m", "pip", "install", "--disable-pip-version-check", "yt-dlp"], { stdio: "inherit" });
        if (install.status === 0 && probeCommand(python, ["-m", "yt_dlp", "--version"])) {
            return { command: python, prefix: ["-m", "yt_dlp"] };
        }
    }

    const executable = resolveCommand("yt-dlp");
    if (executable && probeCommand(executable, ["--version"])) return { command: executable, prefix: [] };
    if (!pythonCommands.length) throw new Error("处理视频 URL 需要 Python 和 yt-dlp；当前未找到可用的 Python。");
    throw new Error(args["no-install"] ? "未安装 yt-dlp，且已设置 --no-install" : "yt-dlp 自动安装失败，请手工运行 python -m pip install yt-dlp");
}

function findPythonCommands() {
    const commands = ["python", "python3", "py"].map((name) => resolveCommand(name)).filter(Boolean);
    const unique = [...new Set(commands.map((command) => path.resolve(command)))];
    return unique.filter((command) => probeCommand(command, ["--version"]));
}

function probeCommand(command, commandArgs) {
    const result = spawnSync(command, commandArgs, {
        encoding: "utf8",
        windowsHide: true,
        timeout: ytDlpTimeoutMs.probe,
        killSignal: "SIGTERM",
    });
    return result.status === 0;
}

function expandRemoteUrl({ ytDlp, sourceUrl, ffmpeg, options }) {
    const candidates = authCandidates(sourceUrl, options);
    if (isBilibiliUrl(sourceUrl) && !options.cookies && !options.browser) {
        console.log(`[B站登录态] ${candidates.map(describeAuth).join(" -> ")}`);
    }
    const diagnostics = [];
    for (const [candidateIndex, candidate] of candidates.entries()) {
        const result = runYtDlp(ytDlp, [
            ...ytDlpBaseArgs(ffmpeg),
            ...authArgs(candidate),
            "--flat-playlist",
            "--dump-single-json",
            "--skip-download",
            "--ignore-errors",
            sourceUrl,
        ], {
            stage: "展开合集",
            timeoutMs: ytDlpTimeoutMs.expand,
            candidate,
            candidateIndex,
            candidateTotal: candidates.length,
        });
        if (result.status !== 0) {
            diagnostics.push(resultDiagnostic(result));
            continue;
        }
        try {
            const payload = JSON.parse(result.stdout || "{}");
            const entries = flattenRemoteEntries(payload, sourceUrl);
            if (entries.length) return { entries, preferredAuth: candidate };
            diagnostics.push("yt-dlp 没有展开出可处理的视频条目");
        } catch (error) {
            diagnostics.push(`yt-dlp 元数据不是有效 JSON：${safeErrorMessage(error)}`);
        }
    }
    throw new Error(formatRemoteFailure(sourceUrl, "展开 URL/合集", diagnostics));
}

function flattenRemoteEntries(payload, sourceUrl) {
    const output = [];
    const visit = (entry, fallbackIndex = 1) => {
        if (!entry || typeof entry !== "object") return;
        if (Array.isArray(entry.entries)) {
            entry.entries.forEach((child, index) => visit(child, Number(child?.playlist_index) || index + 1));
            return;
        }
        const playlistIndex = Number(entry.playlist_index) || fallbackIndex;
        const directUrl = remoteEntryUrl(entry, payload === entry ? "" : sourceUrl);
        const url = directUrl || sourceUrl;
        const id = String(entry.id || shortUrlId(url));
        const title = String(entry.title || entry.fulltitle || entry.track || id || "remote-video");
        output.push({
            url,
            sourceUrl,
            title,
            id,
            playlistIndex,
            useSourcePlaylist: !directUrl && url === sourceUrl && payload !== entry,
            isBilibili: isBilibiliUrl(sourceUrl) || isBilibiliUrl(url),
        });
    };
    visit(payload, 1);
    return output;
}

function remoteEntryUrl(entry, parentUrl) {
    for (const value of [entry.webpage_url, entry.url, entry.original_url]) {
        if (isRemoteUrl(value) && String(value) !== parentUrl) return String(value);
    }
    const extractor = String(entry.ie_key || entry.extractor_key || entry.extractor || "").toLowerCase();
    const id = String(entry.id || entry.url || "");
    if (extractor.includes("youtube") && id) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    if (extractor.includes("bili") && /^(?:BV[\w]+|av\d+)$/i.test(id)) return `https://www.bilibili.com/video/${id}`;
    return "";
}

function extractBvid(...values) {
    for (const value of values) {
        const match = String(value || "").match(/BV[0-9A-Za-z]{10}/i);
        if (match) return `BV${match[0].slice(2)}`;
    }
    return "";
}

function remoteEntryIdentity(entry) {
    const bvid = extractBvid(entry?.id, entry?.url, entry?.sourceUrl);
    if (bvid) return bvid.toLowerCase();
    const id = String(entry?.id || "").trim();
    return (id || shortUrlId(entry?.url || entry?.sourceUrl)).toLowerCase();
}

function countUniqueRemoteIds(entries) {
    return new Set(entries.map(remoteEntryIdentity)).size;
}

function remoteSourceKey(item) {
    const bvid = extractBvid(item.id, item.url, item.sourceUrl);
    if (bvid) return `bilibili:${bvid.toLowerCase()}`;
    return item.useSourcePlaylist ? `${item.url}#playlist-index=${item.playlistIndex}` : item.url;
}

function remoteItemLabel(item) {
    const title = sanitizeFilenamePart(item?.title, 110, "remote-video");
    const id = extractBvid(item?.id, item?.url, item?.sourceUrl) || sanitizeFilenamePart(item?.id, 56, shortUrlId(item?.url));
    return `${title} [${id}]`;
}

function assignRemoteOutputStems(entries) {
    const counts = new Map();
    return entries.map((entry) => {
        const title = sanitizeFilenamePart(entry.title, 110, "remote-video");
        const id = sanitizeFilenamePart(extractBvid(entry.id, entry.url, entry.sourceUrl) || entry.id, 56, shortUrlId(entry.url));
        const base = `${title} [${id}]`;
        const count = (counts.get(base.toLowerCase()) || 0) + 1;
        counts.set(base.toLowerCase(), count);
        const discriminator = entry.playlistIndex && entry.playlistIndex !== 1 ? entry.playlistIndex : count;
        const suffix = count === 1 ? "" : `-${discriminator}`;
        return { ...entry, outputStem: `${base}${suffix}` };
    });
}

async function processRemoteVideoWithRetries(params) {
    const maxAttempts = params.options.itemRetries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const context = { position: params.itemPosition, total: params.itemTotal, attempt, maxAttempts };
        console.log(`${remoteStagePrefix(context, "开始条目")} ${remoteItemLabel(params.item)}`);
        const status = await processRemoteVideo({ ...params, context });
        if (status !== "failed" || attempt === maxAttempts) return status;
        console.warn(`${remoteStagePrefix(context, "外层重试")} ${itemRetryDelayMs / 1000} 秒后重试`);
        await sleep(itemRetryDelayMs);
    }
    return "failed";
}

async function processRemoteVideo({ item, outputDir, ffmpeg, ytDlp, args, options, db, context }) {
    const sourceKey = remoteSourceKey(item);
    const jobId = startIngestJob(db, { jobType: "subtitle_url", sourceKey, sourcePath: "" });
    beginActiveTask({ db, jobId, label: remoteItemLabel(item) });
    let tempDir = "";
    let outputPart = "";
    try {
        const existing = !args.force ? await findExistingRemoteOutput(outputDir, item, args.language) : "";
        if (existing) {
            finishIngestJob(db, jobId, { status: "completed" });
            markActiveTaskFinished(jobId);
            console.log(`${remoteStagePrefix(context, "跳过")} 已存在：${path.relative(appRoot, existing)}`);
            return "completed";
        }

        item = enrichRemoteEntryMetadata({ item, ffmpeg, ytDlp, options, context });
        const tempRoot = path.join(appRoot, "knowledge", "creative", ".tmp", "video-subtitles");
        await fs.mkdir(tempRoot, { recursive: true });
        tempDir = await fs.mkdtemp(path.join(tempRoot, "yt-"));
        registerActiveTempDir(tempDir);
        const candidates = reorderAuthCandidates(authCandidates(item.isBilibili ? item.sourceUrl : item.url, options), item.preferredAuth);
        const subtitle = await downloadRemoteSubtitle({ item, tempDir, ffmpeg, ytDlp, candidates, requestedLanguage: args.language, context });
        let output;
        let method;
        if (subtitle) {
            const language = normalizeLanguage(subtitle.language || args.language || "zh");
            output = path.join(outputDir, `${item.outputStem}.${language}.srt`);
            outputPart = subtitlePartPath(output);
            registerActivePart(outputPart);
            await fs.rm(outputPart, { force: true });
            await fs.copyFile(subtitle.file, outputPart);
            method = "yt-dlp subtitle";
        } else {
            if (args["embedded-only"]) throw new Error("远程视频没有可提取的人工或自动字幕");
            const audio = await downloadRemoteAudio({ item, tempDir, ffmpeg, ytDlp, candidates, context });
            const language = normalizeLanguage(args.language || "zh");
            output = path.join(outputDir, `${item.outputStem}.${language}.srt`);
            outputPart = subtitlePartPath(output);
            registerActivePart(outputPart);
            await fs.rm(outputPart, { force: true });
            console.log(`${remoteStagePrefix(context, "语音转写")} 认证候选：不适用`);
            transcribe(audio, outputPart, args);
            method = "yt-dlp audio + speech-to-text";
        }

        await publishSubtitle(outputPart, output);
        finishIngestJob(db, jobId, { status: "completed" });
        markActiveTaskFinished(jobId);
        console.log(`${remoteStagePrefix(context, "完成")} ${remoteItemLabel(item)} -> ${path.relative(appRoot, output)} (${method})`);
        return "completed";
    } catch (error) {
        const message = safeErrorMessage(error);
        finishIngestJob(db, jobId, { status: "failed", error: message });
        markActiveTaskFinished(jobId);
        console.error(`${remoteStagePrefix(context, "失败")} ${remoteItemLabel(item)}：${message}`);
        return "failed";
    } finally {
        if (outputPart) await fs.rm(outputPart, { force: true }).catch(() => {});
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.warn(`[临时文件清理失败] ${tempDir}：${safeErrorMessage(error)}`);
            }
        }
        endActiveTask(jobId);
    }
}

function enrichRemoteEntryMetadata({ item, ffmpeg, ytDlp, options, context }) {
    const candidates = reorderAuthCandidates(authCandidates(item.isBilibili ? item.sourceUrl : item.url, options), item.preferredAuth);
    for (const [candidateIndex, candidate] of candidates.entries()) {
        const result = runYtDlp(ytDlp, [
            ...ytDlpBaseArgs(ffmpeg),
            ...authArgs(candidate),
            ...remoteItemSelectionArgs(item),
            "--dump-single-json",
            "--skip-download",
            item.url,
        ], {
            stage: "读取元数据",
            timeoutMs: ytDlpTimeoutMs.metadata,
            candidate,
            candidateIndex,
            candidateTotal: candidates.length,
            context,
        });
        if (result.status !== 0) continue;
        try {
            const payload = JSON.parse(result.stdout || "{}");
            const metadata = Array.isArray(payload.entries) ? payload.entries.find(Boolean) || payload : payload;
            const title = String(metadata.title || metadata.fulltitle || item.title || item.id);
            const id = String(metadata.id || item.id || shortUrlId(item.url));
            const outputId = extractBvid(id, item.id, item.url, item.sourceUrl) || id;
            return { ...item, title, id: outputId, outputStem: `${sanitizeFilenamePart(title, 110, "remote-video")} [${sanitizeFilenamePart(outputId, 56, shortUrlId(item.url))}]` };
        } catch {
            // Keep the playlist-level metadata when a single entry returns malformed JSON.
        }
    }
    return item;
}

async function downloadRemoteSubtitle({ item, tempDir, ffmpeg, ytDlp, candidates, requestedLanguage, context }) {
    const diagnostics = [];
    let commandSucceeded = false;
    for (const [candidateIndex, candidate] of candidates.entries()) {
        await removeFilesWithPrefix(tempDir, "subtitle.");
        const result = runYtDlp(ytDlp, [
            ...ytDlpBaseArgs(ffmpeg),
            ...authArgs(candidate),
            ...remoteItemSelectionArgs(item),
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            subtitleLanguageSelector(requestedLanguage),
            "--sub-format",
            "srt/best",
            "--convert-subs",
            "srt",
            "--windows-filenames",
            "--force-overwrites",
            "--output",
            path.join(tempDir, "subtitle.%(ext)s"),
            item.url,
        ], {
            stage: "下载字幕",
            timeoutMs: ytDlpTimeoutMs.subtitle,
            candidate,
            candidateIndex,
            candidateTotal: candidates.length,
            context,
        });
        const files = await listMatchingFiles(tempDir, (name) => name.startsWith("subtitle.") && name.toLowerCase().endsWith(".srt"));
        if (result.status === 0 && files.length) {
            const file = chooseRemoteSubtitle(files, requestedLanguage);
            try {
                await assertSubtitleFile(file);
                return { file, language: languageFromRemoteSubtitle(file) };
            } catch (error) {
                diagnostics.push(`字幕完整性校验失败：${safeErrorMessage(error)}`);
            }
        }
        if (result.status === 0) commandSucceeded = true;
        else diagnostics.push(resultDiagnostic(result));
    }
    if (commandSucceeded) return null;
    throw new Error(formatRemoteFailure(item.url, "提取字幕", diagnostics));
}

async function downloadRemoteAudio({ item, tempDir, ffmpeg, ytDlp, candidates, context }) {
    const diagnostics = [];
    for (const [candidateIndex, candidate] of candidates.entries()) {
        await removeFilesWithPrefix(tempDir, "audio.");
        const result = runYtDlp(ytDlp, [
            ...ytDlpBaseArgs(ffmpeg),
            ...authArgs(candidate),
            ...remoteItemSelectionArgs(item),
            "--format",
            "bestaudio/best",
            "--windows-filenames",
            "--force-overwrites",
            "--output",
            path.join(tempDir, "audio.%(ext)s"),
            item.url,
        ], {
            stage: "下载音频",
            timeoutMs: ytDlpTimeoutMs.audio,
            candidate,
            candidateIndex,
            candidateTotal: candidates.length,
            context,
        });
        const files = result.status === 0 ? await listMatchingFiles(tempDir, (name) => name.startsWith("audio.") && !/\.(?:part|ytdl)$/i.test(name)) : [];
        if (files.length && (await fs.stat(files[0])).size > 0) return files[0];
        diagnostics.push(resultDiagnostic(result));
    }
    throw new Error(formatRemoteFailure(item.url, "下载最佳音频", diagnostics));
}

function remoteItemSelectionArgs(item) {
    return item.useSourcePlaylist ? ["--playlist-items", String(item.playlistIndex)] : ["--no-playlist"];
}

function runYtDlp(ytDlp, commandArgs, { stage, timeoutMs, candidate, candidateIndex, candidateTotal, context } = {}) {
    const effectiveTimeoutMs = timeoutMs || ytDlpTimeoutMs.metadata;
    const prefix = ytDlpStagePrefix({ stage, candidate, candidateIndex, candidateTotal, context });
    console.log(`${prefix} 开始，进程超时 ${formatDuration(effectiveTimeoutMs)}`);
    const result = spawnSync(ytDlp.command, [...ytDlp.prefix, ...commandArgs], {
        encoding: "utf8",
        maxBuffer: 100 * 1024 * 1024,
        windowsHide: true,
        timeout: effectiveTimeoutMs,
        killSignal: "SIGTERM",
        env: { ...process.env, NO_COLOR: "1" },
    });
    const hasNextCandidate = Number(candidateIndex) + 1 < Number(candidateTotal);
    if (isProcessTimeout(result)) {
        console.warn(`${prefix} 超时${hasNextCandidate ? "，继续下一个认证候选" : "，已无其他认证候选"}`);
    } else if (result.status !== 0) {
        console.warn(`${prefix} 失败${hasNextCandidate ? "，继续下一个认证候选" : "，已无其他认证候选"}`);
    }
    return { ...result, timeoutMs: effectiveTimeoutMs };
}

function remoteStagePrefix(context, stage) {
    return `[条目 ${context.position}/${context.total}][尝试 ${context.attempt}/${context.maxAttempts}][${stage}]`;
}

function ytDlpStagePrefix({ stage, candidate, candidateIndex, candidateTotal, context }) {
    const operation = context ? remoteStagePrefix(context, stage || "yt-dlp") : `[${stage || "yt-dlp"}]`;
    const currentCandidate = Number.isInteger(candidateIndex) ? candidateIndex + 1 : 1;
    const totalCandidates = Number.isInteger(candidateTotal) && candidateTotal > 0 ? candidateTotal : 1;
    return `${operation}[认证候选 ${currentCandidate}/${totalCandidates}：${describeAuth(candidate || { kind: "anonymous", value: "" })}]`;
}

function isProcessTimeout(result) {
    return result?.error?.code === "ETIMEDOUT";
}

function formatDuration(milliseconds) {
    if (milliseconds >= 60_000 && milliseconds % 60_000 === 0) return `${milliseconds / 60_000} 分钟`;
    return `${Math.ceil(milliseconds / 1000)} 秒`;
}

function ytDlpBaseArgs(ffmpeg) {
    const args = [
        "--ignore-config",
        "--no-progress",
        "--socket-timeout",
        "30",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--extractor-retries",
        "3",
    ];
    if (ffmpeg) args.push("--ffmpeg-location", path.dirname(ffmpeg));
    return args;
}

function subtitleLanguageSelector(requestedLanguage) {
    const requested = String(requestedLanguage || "").trim();
    return [...new Set([requested, "ai-zh", "zh-Hans", "zh-CN", "zh", "zh-Hant", "ai-en", "en"].filter(Boolean))].join(",");
}

function authCandidates(url, options) {
    if (options.cookies) return [{ kind: "cookies", value: options.cookies }, { kind: "anonymous", value: "" }];
    if (options.browser) return [{ kind: "browser", value: options.browser }, { kind: "anonymous", value: "" }];
    if (!isBilibiliUrl(url)) return [{ kind: "anonymous", value: "" }];
    detectedBrowsers ||= detectInstalledBrowsers();
    return [...detectedBrowsers.map((browser) => ({ kind: "browser", value: browser })), { kind: "anonymous", value: "" }];
}

function reorderAuthCandidates(candidates, preferred) {
    if (!preferred) return candidates;
    const preferredKey = authKey(preferred);
    return [...candidates].sort((left, right) => Number(authKey(right) === preferredKey) - Number(authKey(left) === preferredKey));
}

function authKey(candidate) {
    return `${candidate?.kind || ""}:${candidate?.value || ""}`;
}

function authArgs(candidate) {
    if (candidate.kind === "cookies") return ["--cookies", candidate.value];
    if (candidate.kind === "browser") return ["--cookies-from-browser", candidate.value];
    return [];
}

function describeAuth(candidate) {
    if (candidate.kind === "browser") return `${candidate.value === "edge" ? "Edge" : candidate.value === "chrome" ? "Chrome" : "Firefox"} 登录态`;
    if (candidate.kind === "cookies") return "cookies.txt 登录态";
    return "匿名访问";
}

function detectInstalledBrowsers() {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const localAppData = process.env.LOCALAPPDATA || "";
    const appData = process.env.APPDATA || "";
    const programFiles = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
    const definitions = {
        edge: {
            commands: ["msedge", "microsoft-edge", "microsoft-edge-stable"],
            paths: [
                localAppData && path.join(localAppData, "Microsoft", "Edge", "User Data"),
                localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
                ...programFiles.map((dir) => path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe")),
                home && path.join(home, ".config", "microsoft-edge"),
                home && path.join(home, "Library", "Application Support", "Microsoft Edge"),
                "/Applications/Microsoft Edge.app",
            ],
        },
        chrome: {
            commands: ["chrome", "google-chrome", "google-chrome-stable"],
            paths: [
                localAppData && path.join(localAppData, "Google", "Chrome", "User Data"),
                localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
                ...programFiles.map((dir) => path.join(dir, "Google", "Chrome", "Application", "chrome.exe")),
                home && path.join(home, ".config", "google-chrome"),
                home && path.join(home, "Library", "Application Support", "Google", "Chrome"),
                "/Applications/Google Chrome.app",
            ],
        },
        firefox: {
            commands: ["firefox"],
            paths: [
                appData && path.join(appData, "Mozilla", "Firefox", "Profiles"),
                ...programFiles.map((dir) => path.join(dir, "Mozilla Firefox", "firefox.exe")),
                home && path.join(home, ".mozilla", "firefox"),
                home && path.join(home, "Library", "Application Support", "Firefox", "Profiles"),
                "/Applications/Firefox.app",
            ],
        },
    };
    return ["edge", "chrome", "firefox"].filter((name) => {
        const definition = definitions[name];
        return definition.paths.filter(Boolean).some((candidate) => fsSync.existsSync(candidate)) || definition.commands.some((command) => Boolean(resolveCommand(command)));
    });
}

function isBilibiliUrl(value) {
    try {
        const host = new URL(String(value)).hostname.toLowerCase();
        return /(^|\.)bilibili\.com$/.test(host) || host === "b23.tv" || /(^|\.)bili2233\.cn$/.test(host);
    } catch {
        return false;
    }
}

function formatRemoteFailure(url, operation, diagnostics) {
    const diagnostic = sanitizeDiagnostic(diagnostics.filter(Boolean).join("\n"));
    const host = remoteHost(url);
    if (/could not copy.*cookie|failed to decrypt|decrypt.*cookie|cookie database|cookies-from-browser/i.test(diagnostic)) {
        return `无法读取 ${host} 的浏览器登录态。请关闭对应浏览器后重试，或用 --cookies 指定导出的 cookies.txt。`;
    }
    if (/login|log in|sign in|account|cookie|captcha|verify|verification|risk|风控|登录|验证|扫码|HTTP Error (?:403|412|429)|status code (?:403|412|429)|precondition failed/i.test(diagnostic)) {
        const site = isBilibiliUrl(url) ? "B站" : host;
        return `${site}要求登录或触发了远程站点风控，无法${operation}。请先在浏览器中正常登录并打开视频，再使用 --browser edge/chrome/firefox 或 --cookies <cookies.txt> 重试；频繁请求时请稍后再试。`;
    }
    const detail = lastNonEmptyLine(diagnostic);
    return `yt-dlp 无法${operation}（${host}）${detail ? `：${detail}` : ""}`;
}

function recordRemoteFailure(db, sourceUrl, error) {
    const message = safeErrorMessage(error);
    const jobId = startIngestJob(db, { jobType: "subtitle_url", sourceKey: sourceUrl, sourcePath: "" });
    finishIngestJob(db, jobId, { status: "failed", error: message });
    console.error(`[URL 展开失败] ${remoteHost(sourceUrl)}：${message}`);
}

function resultDiagnostic(result) {
    if (isProcessTimeout(result)) return `yt-dlp 进程在 ${formatDuration(result.timeoutMs || ytDlpTimeoutMs.metadata)} 后超时`;
    return sanitizeDiagnostic(result?.stderr || result?.error?.message || result?.stdout || "yt-dlp 运行失败");
}

function sanitizeDiagnostic(value) {
    return String(value || "")
        .replace(/(^|\n)[^\r\n]*\t(?:TRUE|FALSE)\t[^\r\n]*\t(?:TRUE|FALSE)\t\d+\t[^\t\r\n]+\t[^\r\n]+/gi, "$1[Cookie 内容已隐藏]")
        .replace(/\b(SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5|sid|authorization)\s*[:=]\s*[^;\s]+/gi, "$1=[已隐藏]")
        .replace(/((?:set-)?cookie\s*[:=]\s*)[^\r\n]+/gi, "$1[已隐藏]")
        .trim()
        .slice(-4000);
}

function safeErrorMessage(error) {
    return sanitizeDiagnostic(error instanceof Error ? error.message : String(error));
}

function lastNonEmptyLine(value) {
    return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
}

function remoteHost(value) {
    try {
        return new URL(String(value)).hostname || "远程站点";
    } catch {
        return "远程站点";
    }
}

async function findExistingRemoteOutput(dir, item, requestedLanguage) {
    const files = await fs.readdir(dir);
    const bvid = extractBvid(item.id, item.url, item.sourceUrl);
    const candidates = files
        .filter((name) => {
            if (!name.toLowerCase().endsWith(".srt")) return false;
            if (bvid) return extractBvidFromFilename(name).toLowerCase() === bvid.toLowerCase();
            return name.startsWith(`${item.outputStem}.`);
        })
        .sort();
    const matches = [];
    for (const name of candidates) {
        try {
            await assertSubtitleFile(path.join(dir, name));
            matches.push(name);
        } catch {
            // The output may have been replaced by another worker between readdir and stat.
        }
    }
    if (!matches.length) return "";
    const requested = requestedLanguage ? normalizeLanguage(requestedLanguage) : "";
    const preferred = requested ? matches.find((name) => name.toLowerCase().endsWith(`.${requested}.srt`)) : "";
    if (requested && requested !== "auto" && !preferred) return "";
    return path.join(dir, preferred || matches[0]);
}

function extractBvidFromFilename(name) {
    return String(name || "").match(/\[(BV[0-9A-Za-z]{10})\](?:-\d+)?(?:\.|$)/i)?.[1] || "";
}

async function removeFilesWithPrefix(dir, prefix) {
    const files = await fs.readdir(dir);
    await Promise.all(files.filter((name) => name.startsWith(prefix)).map((name) => fs.rm(path.join(dir, name), { force: true })));
}

async function listMatchingFiles(dir, predicate) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && predicate(entry.name)).map((entry) => path.join(dir, entry.name)).sort();
}

function chooseRemoteSubtitle(files, requestedLanguage) {
    return [...files].sort((left, right) => remoteSubtitleScore(right, requestedLanguage) - remoteSubtitleScore(left, requestedLanguage) || left.localeCompare(right))[0];
}

function remoteSubtitleScore(file, requestedLanguage) {
    const language = languageFromRemoteSubtitle(file);
    const requested = normalizeLanguage(requestedLanguage || "zh");
    if (normalizeLanguage(language) === requested) return 5;
    if (requested === "zh" && isChineseLanguage(language)) return 4;
    if (isChineseLanguage(language)) return 3;
    if (/orig|default/i.test(language)) return 2;
    return 1;
}

function languageFromRemoteSubtitle(file) {
    return path.basename(file).match(/^subtitle\.(.+)\.srt$/i)?.[1] || "auto";
}

function shortUrlId(value) {
    return `url-${createHash("sha256").update(String(value || ""), "utf8").digest("hex").slice(0, 12)}`;
}

function sanitizeFilenamePart(value, maxLength, fallback) {
    const cleaned = String(value || "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "")
        .trim();
    return (cleaned || fallback).slice(0, maxLength);
}

function probeSubtitleStreams(ffprobe, input) {
    const result = spawnSync(ffprobe, ["-v", "error", "-select_streams", "s", "-show_entries", "stream=index,codec_name:stream_tags=language,title", "-of", "json", input], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(result.stderr || "ffprobe 无法读取视频");
    try {
        const parsed = JSON.parse(result.stdout || "{}");
        return Array.isArray(parsed.streams) ? parsed.streams : [];
    } catch {
        return [];
    }
}

function chooseSubtitleStream(streams, requestedLanguage) {
    if (!streams.length) return null;
    const requested = normalizeLanguage(requestedLanguage || "zh");
    return (
        streams.find((stream) => normalizeLanguage(stream.tags?.language || "") === requested && isTextSubtitle(stream.codec_name)) ||
        streams.find((stream) => isChineseLanguage(stream.tags?.language) && isTextSubtitle(stream.codec_name)) ||
        streams.find((stream) => isTextSubtitle(stream.codec_name)) ||
        streams[0]
    );
}

function isTextSubtitle(codec) {
    return !/hdmv_pgs|dvd_subtitle|dvb_subtitle|xsub/i.test(String(codec || ""));
}

function isChineseLanguage(value) {
    return /(^|[-_])(zh|chi|zho|cmn)([-_]|$)|chinese|中文/i.test(String(value || ""));
}

function normalizeLanguage(value) {
    const language = String(value || "").toLowerCase();
    if (isChineseLanguage(language)) return "zh";
    return language.replace(/[^a-z0-9-]/g, "").slice(0, 12) || "auto";
}

function uniqueOutputPath(dir, input, language) {
    const stem = path.basename(input, path.extname(input)).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120);
    return path.join(dir, `${stem}.${language}.srt`);
}

async function outputIsCurrent(input, output) {
    try {
        const [inputStat, outputStat] = await Promise.all([fs.stat(input), fs.stat(output)]);
        if (outputStat.mtimeMs < inputStat.mtimeMs) return false;
        await assertSubtitleFile(output);
        return true;
    } catch {
        return false;
    }
}

async function assertSubtitleFile(output) {
    const stat = await fs.stat(output);
    if (stat.size < 16) throw new Error("生成的字幕文件为空或不完整");
    const content = (await fs.readFile(output, "utf8")).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (content.includes("\u0000")) throw new Error("生成的字幕文件包含无效字符");
    const lines = content.split("\n");
    const timingPattern = /^\s*\d{1,3}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,3}:\d{2}:\d{2}[,.]\d{3}(?:\s+.*)?$/;
    let validCue = false;
    for (let index = 1; index < lines.length - 1; index += 1) {
        if (!timingPattern.test(lines[index])) continue;
        if (!/^\s*\d+\s*$/.test(lines[index - 1])) continue;
        if (lines[index + 1].trim()) {
            validCue = true;
            break;
        }
    }
    if (!validCue) throw new Error("生成的字幕文件不是完整的 SRT（缺少序号、时间轴或正文）");
}

function subtitlePartPath(output) {
    return `${output}.part`;
}

async function publishSubtitle(partFile, output) {
    await assertSubtitleFile(partFile);
    await fs.rename(partFile, output);
}

async function waitForStableFile(file) {
    let previous = -1;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const stat = await fs.stat(file);
        if (stat.size > 0 && stat.size === previous) return;
        previous = stat.size;
        await sleep(1200);
    }
}

function transcribe(input, output, options) {
    const python = resolveCommand("python");
    if (!python) throw new Error("视频没有文本字幕轨，且未找到 Python，无法进行语音转写");
    const pythonArgs = [transcribeScript, input, output, "--model", String(options.model || "small")];
    if (options.language && options.language !== "auto") pythonArgs.push("--language", String(options.language));
    let result = spawnSync(python, pythonArgs, { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"], maxBuffer: 20 * 1024 * 1024 });
    if (result.status === 3 && !options["no-install"]) {
        console.log("首次使用语音转写，正在安装 faster-whisper...");
        const install = spawnSync(python, ["-m", "pip", "install", "--disable-pip-version-check", "faster-whisper"], { stdio: "inherit" });
        if (install.status !== 0) throw new Error("faster-whisper 自动安装失败");
        result = spawnSync(python, pythonArgs, { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"], maxBuffer: 20 * 1024 * 1024 });
    }
    if (result.status !== 0) throw new Error(result.stderr || "语音转写失败");
}

function pickVideoFiles() {
    const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
        "$dialog.Multiselect = $true",
        "$dialog.Filter = '视频文件|*.mp4;*.mov;*.mkv;*.avi;*.webm;*.m4v;*.ts;*.mts;*.m2ts|所有文件|*.*'",
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.FileNames }",
    ].join("; ");
    const result = spawnSync("powershell", ["-NoProfile", "-STA", "-Command", script], { encoding: "utf8", windowsHide: false });
    if (result.status !== 0) return [];
    return result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function beginActiveTask({ db, jobId, label }) {
    activeTask = { db, jobId, label, partFiles: new Set(), tempDir: "", jobFinished: false };
}

function registerActivePart(file) {
    if (activeTask && file) activeTask.partFiles.add(file);
}

function registerActiveTempDir(dir) {
    if (activeTask) activeTask.tempDir = dir;
}

function markActiveTaskFinished(jobId) {
    if (activeTask?.jobId === jobId) activeTask.jobFinished = true;
}

function endActiveTask(jobId) {
    if (activeTask?.jobId === jobId) activeTask = null;
}

function terminateFromSignal(signal) {
    if (terminating) return;
    terminating = true;
    const task = activeTask;
    const error = `收到 ${signal}，任务已中断，临时文件已清理`;
    if (task) {
        for (const file of task.partFiles) {
            try {
                fsSync.rmSync(file, { force: true });
            } catch {
                // Continue cleanup so the database status is still finalized.
            }
        }
        if (task.tempDir) {
            try {
                fsSync.rmSync(task.tempDir, { recursive: true, force: true });
            } catch {
                // Continue to mark the running job as failed.
            }
        }
        if (!task.jobFinished) {
            try {
                finishIngestJob(task.db, task.jobId, { status: "failed", error });
            } catch {
                // The process is terminating; there is no further recovery path here.
            }
        }
        try {
            task.db.close();
        } catch {
            // The database may already be closed by normal finalization.
        }
    }
    try {
        fsSync.writeSync(process.stderr.fd, `[字幕任务中断] ${error}${task?.label ? `：${task.label}` : ""}\n`);
    } catch {
        // Avoid masking the requested termination when stderr is unavailable.
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
