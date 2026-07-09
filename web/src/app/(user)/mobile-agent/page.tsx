"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Clock3, Copy, FolderGit2, GitBranch, ImagePlus, ListTodo, LoaderCircle, MessageSquareText, PlugZap, Plus, RefreshCcw, RotateCcw, SendHorizontal, Settings2, TerminalSquare, Trash2, UploadCloud, X } from "lucide-react";

type MessageRole = "user" | "assistant" | "tool" | "error" | "status";
type MobileMessage = { id: string; role: MessageRole; title?: string; text: string; streamId?: string };
type Settings = { agentUrl: string; token: string; canvasId: string; threadId: string; workspacePath: string; gitRepoPath: string; model: string; effort: string };
type Workspace = { canvasId: string; workspacePath: string; activeThreadId?: string };
type AgentEvent = { type?: string; item?: Record<string, unknown>; usage?: unknown; message?: string };
type PendingRun = { threadId: string; canvasId: string; prompt: string; startedAt: number };
type ConnectionStatus = "idle" | "connecting" | "connected" | "offline" | "error";
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
type ThreadSummary = {
    id: string;
    preview?: string;
    name?: string | null;
    cwd?: string;
    status?: string;
    updatedAt?: number;
    createdAt?: number;
};
type AgentAttachment = { name?: string; type?: string; dataUrl?: string };
type QueuedTaskStatus = "queued" | "running" | "done" | "failed";
type QueuedTask = { id: string; text: string; attachments: AgentAttachment[]; createdAt: number; status: QueuedTaskStatus; error?: string };
type ThreadGroup = { key: string; label: string; path: string; threads: ThreadSummary[] };

const settingsKey = "kazang-mobile-codex:settings";
const messagesKey = "kazang-mobile-codex:messages";
const pendingRunKey = "kazang-mobile-codex:pending-run";
const queueKey = "kazang-mobile-codex:task-queue";
const pendingRunMaxAge = 1000 * 60 * 60 * 12;
const legacyDefaultWorkspacePath = "D:\\canvas\\infinite-canvas";
const queueGuides = ["继续修复并验证", "跑测试并汇报结果", "提交并推送当前项目", "整理当前进度和下一步", "检查线上部署状态"];
const mobileAgentUiVersion = "队列版 3 2026-07-09";
const defaultSettings: Settings = {
    agentUrl: "",
    token: "",
    canvasId: "default",
    threadId: "",
    workspacePath: "",
    gitRepoPath: "",
    model: "",
    effort: "",
};

function createId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function endpoint(value: string) {
    const raw = value.trim();
    try {
        return new URL(raw).origin;
    } catch {
        return raw.replace(/\/+$/, "");
    }
}

function isCanvasWebUrl(value: string) {
    const raw = value.trim();
    if (!raw) return false;
    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase();
        const currentHost = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();
        return host === currentHost || host === "canvas.prompt-hubs.com" || host === "infinite-canvas-jay.vercel.app" || path === "/mobile-agent" || path.startsWith("/mobile-agent/") || path === "/canvas" || path.startsWith("/canvas/");
    } catch {
        return /(?:^|\/)(mobile-agent|canvas)(?:\/|$)/i.test(raw);
    }
}

function sanitizeSettings(value: Partial<Settings>) {
    const next = { ...defaultSettings, ...value };
    if (next.workspacePath.trim().toLowerCase() === legacyDefaultWorkspacePath.toLowerCase()) next.workspacePath = "";
    if (isCanvasWebUrl(next.agentUrl)) next.agentUrl = "";
    return next;
}

function validateAgentUrl(value: string) {
    const raw = value.trim();
    if (!raw) throw new Error("请先填写 canvas-agent 的 HTTPS 服务地址。");
    if (isCanvasWebUrl(raw)) throw new Error("Agent URL 填成了画布网页地址。这里要填 cloudflared / Tailscale / VPS 反代出来的 canvas-agent 地址。");
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("Agent URL 不是有效网址。");
    }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) throw new Error("手机远程连接需要 HTTPS Agent URL。");
    return endpoint(raw);
}

function normalizeCanvasId(value: string) {
    const raw = value.trim();
    if (!raw) return "default";
    const match = raw.match(/(?:^|\/)canvas\/([^/?#]+)/i);
    return decodeURIComponent(match?.[1] || raw.replace(/^\/?canvas\//i, "")).trim() || "default";
}

function normalizeThreadId(value: string) {
    const raw = value.trim();
    if (!raw) return "";
    const match = raw.match(/(?:codex:\/\/threads\/|\/threads\/)([^/?#]+)/i);
    return decodeURIComponent(match?.[1] || raw).trim();
}

function withToken(base: string, path: string, token: string) {
    return `${endpoint(base)}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token.trim())}`;
}

function normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : value == null ? "" : JSON.stringify(value, null, 2);
}

function itemField(item: unknown, key: string) {
    return item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined;
}

function toolLabel(name: string) {
    if (name === "canvas_apply_ops") return "画布操作";
    if (name === "canvas_get_state") return "读取画布";
    if (name === "canvas_generate_image") return "生成图片";
    if (name === "canvas_generate_video") return "生成视频";
    if (name === "canvas_generate_text") return "生成文本";
    if (name === "canvas_run_generation") return "触发生成";
    return name || "工具调用";
}

function itemStatusLabel(itemType: string, tool: string) {
    if (itemType === "commandExecution") return "正在执行命令";
    if (itemType === "fileChange") return "正在修改文件";
    if (tool) return `正在执行：${toolLabel(tool)}`;
    return "正在处理";
}

function parseEventData<T>(event: Event) {
    try {
        return JSON.parse((event as MessageEvent).data) as T;
    } catch {
        return null;
    }
}

function readPendingRun() {
    if (typeof localStorage === "undefined") return null;
    const value = readJson<PendingRun | null>(localStorage.getItem(pendingRunKey), null);
    if (!value?.threadId || !value.prompt || Date.now() - Number(value.startedAt || 0) > pendingRunMaxAge) {
        localStorage.removeItem(pendingRunKey);
        return null;
    }
    return value;
}

function writePendingRun(run: PendingRun) {
    localStorage.setItem(pendingRunKey, JSON.stringify(run));
}

function clearPendingRun() {
    localStorage.removeItem(pendingRunKey);
}

function samePath(a: string, b: string) {
    return a.trim().replaceAll("/", "\\").toLowerCase() === b.trim().replaceAll("/", "\\").toLowerCase();
}

function repoName(repoPath: string) {
    return repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;
}

function threadTitle(thread: ThreadSummary) {
    return thread.name || thread.preview || thread.id;
}

function queueTaskCount(items: QueuedTask[]) {
    return items.filter((item) => item.status === "queued" || item.status === "running").length;
}

function normalizeQueue(items: QueuedTask[]) {
    return items
        .filter((item) => item?.text?.trim())
        .slice(-30)
        .map((item) => ({ ...item, attachments: item.attachments || [], status: item.status === "running" ? "queued" : item.status }));
}

function threadGroupLabel(path: string) {
    if (!path) return "Current workspace";
    const name = repoName(path);
    return name === path ? path : name;
}

function formatThreadTime(value?: number) {
    if (!value) return "";
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isNearBottom(element: HTMLElement, distance = 80) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < distance;
}

function readFileAsDataUrl(file: File) {
    return new Promise<AgentAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: String(reader.result || "") });
        reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });
}

export default function MobileAgentPage() {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [messages, setMessages] = useState<MobileMessage[]>([]);
    const [input, setInput] = useState("");
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [sending, setSending] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [threadsOpen, setThreadsOpen] = useState(false);
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [activeThreadId, setActiveThreadId] = useState("");
    const [copiedId, setCopiedId] = useState("");
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
    const [connectionMessage, setConnectionMessage] = useState("");
    const [hydrated, setHydrated] = useState(false);
    const [repos, setRepos] = useState<GitRepoInfo[]>([]);
    const [reposLoading, setReposLoading] = useState(false);
    const [repoError, setRepoError] = useState("");
    const [threads, setThreads] = useState<ThreadSummary[]>([]);
    const [threadsLoading, setThreadsLoading] = useState(false);
    const [threadSearch, setThreadSearch] = useState("");
    const [threadError, setThreadError] = useState("");
    const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
    const [queueOpen, setQueueOpen] = useState(false);
    const [queueInput, setQueueInput] = useState("");
    const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
    const [runStatus, setRunStatus] = useState("");
    const [unreadCount, setUnreadCount] = useState(0);
    const eventSourceRef = useRef<EventSource | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingPromptRef = useRef("");
    const activeQueueTaskIdRef = useRef("");
    const queuedTasksRef = useRef<QueuedTask[]>([]);
    const settingsRef = useRef<Settings>(defaultSettings);
    const activeThreadIdRef = useRef("");
    const scrollerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const atBottomRef = useRef(true);

    const canSend = useMemo(() => Boolean(input.trim() || attachments.length), [attachments.length, input]);
    const activeQueueCount = useMemo(() => queueTaskCount(queuedTasks), [queuedTasks]);
    const selectedRepo = useMemo(() => repos.find((repo) => samePath(repo.repoPath, settings.gitRepoPath)) || null, [repos, settings.gitRepoPath]);
    const groupedThreads = useMemo<ThreadGroup[]>(() => {
        const groups = new Map<string, ThreadGroup>();
        for (const thread of threads) {
            const path = thread.cwd || workspace?.workspacePath || "Current workspace";
            const key = path.trim().toLowerCase() || "current";
            const existing = groups.get(key);
            if (existing) existing.threads.push(thread);
            else groups.set(key, { key, label: threadGroupLabel(path), path, threads: [thread] });
        }
        return [...groups.values()];
    }, [threads, workspace?.workspacePath]);

    useEffect(() => {
        const loadedSettings = sanitizeSettings(readJson<Partial<Settings>>(localStorage.getItem(settingsKey), {}));
        settingsRef.current = loadedSettings;
        setSettings(loadedSettings);
        setMessages(readJson<MobileMessage[]>(localStorage.getItem(messagesKey), []));
        setQueuedTasks(normalizeQueue(readJson<QueuedTask[]>(localStorage.getItem(queueKey), [])));
        setHydrated(true);
        return () => {
            eventSourceRef.current?.close();
            stopThreadPoll();
            if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        };
    }, []);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        activeThreadIdRef.current = activeThreadId;
    }, [activeThreadId]);

    useEffect(() => {
        queuedTasksRef.current = queuedTasks;
        if (hydrated) localStorage.setItem(queueKey, JSON.stringify(queuedTasks));
    }, [hydrated, queuedTasks]);

    useEffect(() => {
        if (hydrated) localStorage.setItem(settingsKey, JSON.stringify(settings));
    }, [hydrated, settings]);

    useEffect(() => {
        localStorage.setItem(messagesKey, JSON.stringify(messages.slice(-120)));
        const scroller = scrollerRef.current;
        if (!scroller) return;
        if (atBottomRef.current) {
            requestAnimationFrame(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }));
            setUnreadCount(0);
        } else {
            setUnreadCount((value) => value + 1);
        }
    }, [messages]);

    useEffect(() => {
        if (!hydrated) return;
        const resume = () => {
            if (document.visibilityState === "hidden") return;
            void resumeThreadAfterInterruption();
        };
        const handleVisibility = () => resume();
        window.addEventListener("focus", resume);
        window.addEventListener("online", resume);
        document.addEventListener("visibilitychange", handleVisibility);
        resume();
        return () => {
            window.removeEventListener("focus", resume);
            window.removeEventListener("online", resume);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [hydrated, activeThreadId, settings.agentUrl, settings.token, settings.canvasId, settings.threadId]);

    const setTemporaryStatus = (text: string, autoClear = false) => {
        setRunStatus(text);
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        if (autoClear) statusTimerRef.current = setTimeout(() => setRunStatus(""), 1800);
    };

    const pushMessage = (message: MobileMessage) => setMessages((items) => [...items, message].slice(-140));

    const upsertStreamMessage = (message: MobileMessage) => {
        setMessages((items) => {
            const key = message.streamId || message.id;
            const index = items.findIndex((item) => (item.streamId || item.id) === key);
            if (index < 0) return [...items, message].slice(-140);
            const next = [...items];
            next[index] = { ...next[index], ...message, id: next[index].id };
            return next;
        });
    };

    const updateSettings = (patch: Partial<Settings>) => setSettings((value) => ({ ...value, ...patch }));

    function markActiveQueueTask(status: QueuedTaskStatus, error = "") {
        const id = activeQueueTaskIdRef.current;
        if (!id) return;
        setQueuedTasks((items) => {
            const next = items.map((item) => (item.id === id ? { ...item, status, error } : item));
            queuedTasksRef.current = next;
            return next;
        });
        activeQueueTaskIdRef.current = "";
    }

    function stopThreadPoll() {
        if (!pollTimerRef.current) return;
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
    }

    function finishCurrentTurn(statusText = "本轮完成", autoClear = true) {
        pendingPromptRef.current = "";
        setSending(false);
        clearPendingRun();
        stopThreadPoll();
        markActiveQueueTask("done");
        setTemporaryStatus(statusText, autoClear);
        window.setTimeout(() => void runNextQueuedTask(), 350);
    }

    function failCurrentTurn(errorText: string) {
        pendingPromptRef.current = "";
        setSending(false);
        stopThreadPoll();
        setTemporaryStatus("");
        markActiveQueueTask("failed", errorText);
        window.setTimeout(() => void runNextQueuedTask(), 350);
    }

    function enqueueTask(text: string, taskAttachments: AgentAttachment[] = []) {
        const task: QueuedTask = {
            id: createId(),
            text: text.trim(),
            attachments: taskAttachments,
            createdAt: Date.now(),
            status: "queued",
        };
        setQueuedTasks((items) => {
            const next = normalizeQueue([...items, task]);
            queuedTasksRef.current = next;
            return next;
        });
        pushMessage({ id: createId(), role: "status", text: `已加入任务队列：${task.text}` });
        window.setTimeout(() => void runNextQueuedTask(), 100);
        return task;
    }

    function addQueueTaskFromDrawer() {
        const text = queueInput.trim();
        if (!text) return;
        enqueueTask(text);
        setQueueInput("");
    }

    function removeQueueTask(id: string) {
        setQueuedTasks((items) => {
            const next = items.filter((item) => item.id !== id || item.status === "running");
            queuedTasksRef.current = next;
            return next;
        });
    }

    function clearFinishedQueue() {
        setQueuedTasks((items) => {
            const next = items.filter((item) => item.status === "queued" || item.status === "running");
            queuedTasksRef.current = next;
            return next;
        });
    }

    function scrollToLatest() {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        atBottomRef.current = true;
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
        setUnreadCount(0);
    }

    function handleScroll() {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        const nearBottom = isNearBottom(scroller);
        atBottomRef.current = nearBottom;
        if (nearBottom) setUnreadCount(0);
    }

    function sameText(a: string, b: string) {
        return a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");
    }

    function promptIndex(items: MobileMessage[], prompt: string) {
        if (!prompt.trim()) return -1;
        for (let index = items.length - 1; index >= 0; index -= 1) {
            if (items[index]?.role === "user" && sameText(items[index].text, prompt)) return index;
        }
        return -1;
    }

    function hasReplyAfterPrompt(items: MobileMessage[], prompt: string) {
        const index = promptIndex(items, prompt);
        return index >= 0 && items.slice(index + 1).some((item) => item.role === "assistant" || item.role === "error");
    }

    function applyThreadMessages(items: MobileMessage[] | undefined, pendingPrompt = "") {
        if (!items?.length) return [];
        if (pendingPrompt && promptIndex(items, pendingPrompt) < 0) return items;
        atBottomRef.current = true;
        setUnreadCount(0);
        setMessages(items);
        return items;
    }

    const agentFetch = async <T,>(targetPath: string, init?: RequestInit) => {
        const currentSettings = settingsRef.current;
        const response = await fetch(`${endpoint(currentSettings.agentUrl)}${targetPath}`, {
            ...init,
            headers: { "Content-Type": "application/json", "x-canvas-agent-token": currentSettings.token.trim(), ...(init?.headers || {}) },
        });
        const payload = (await response.json().catch(() => ({}))) as T & { error?: string; msg?: string };
        if (!response.ok) throw new Error(payload.error || payload.msg || `Agent 请求失败：${response.status}`);
        return payload;
    };

    const refreshThreadMessages = async (threadId: string, canvasId: string, pendingPrompt = "") => {
        const data = await agentFetch<{ workspace?: Workspace; messages?: MobileMessage[] }>(`/agent/codex/threads/${encodeURIComponent(threadId)}?canvasId=${encodeURIComponent(canvasId)}`);
        if (data.workspace) {
            setWorkspace(data.workspace);
            setActiveThreadId(data.workspace.activeThreadId || threadId);
        }
        return applyThreadMessages(data.messages, pendingPrompt);
    };

    const refreshThreads = async (quiet = false) => {
        if (!settingsRef.current.agentUrl.trim() || !settingsRef.current.token.trim()) return threads;
        setThreadsLoading(true);
        setThreadError("");
        try {
            const canvasId = normalizeCanvasId(settingsRef.current.canvasId);
            const query = new URLSearchParams({ canvasId });
            if (threadSearch.trim()) query.set("searchTerm", threadSearch.trim());
            const data = await agentFetch<{ workspace?: Workspace; data?: ThreadSummary[] }>(`/agent/codex/threads?${query.toString()}`);
            const nextThreads = data.data || [];
            setThreads(nextThreads);
            if (data.workspace) setWorkspace(data.workspace);
            if (!quiet) pushMessage({ id: createId(), role: "status", text: nextThreads.length ? `已读取 ${nextThreads.length} 个当前工作区会话。` : "当前工作区没有可显示的 Codex 会话。" });
            return nextThreads;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setThreadError(message);
            if (!quiet) pushMessage({ id: createId(), role: "error", title: "会话读取失败", text: message });
            return threads;
        } finally {
            setThreadsLoading(false);
        }
    };

    const refreshGitRepos = async (quiet = false) => {
        if (!settingsRef.current.agentUrl.trim() || !settingsRef.current.token.trim()) return repos;
        setReposLoading(true);
        setRepoError("");
        try {
            const data = await agentFetch<{ workspace?: Workspace; repos?: GitRepoInfo[] }>(`/agent/git/repos?canvasId=${encodeURIComponent(normalizeCanvasId(settingsRef.current.canvasId))}`);
            const nextRepos = data.repos || [];
            setRepos(nextRepos);
            if (data.workspace) setWorkspace(data.workspace);
            const currentSelection = settingsRef.current.gitRepoPath;
            const nextSelection = nextRepos.find((repo) => samePath(repo.repoPath, currentSelection)) || nextRepos.find((repo) => !repo.pushBlocked) || nextRepos[0];
            if (nextSelection && !samePath(nextSelection.repoPath, currentSelection)) updateSettings({ gitRepoPath: nextSelection.repoPath });
            if (!quiet) pushMessage({ id: createId(), role: "status", text: nextRepos.length ? `已发现 ${nextRepos.length} 个本机 Git 仓库。` : "没有发现可推送的 Git 仓库。" });
            return nextRepos;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setRepoError(message);
            if (!quiet) pushMessage({ id: createId(), role: "error", title: "仓库刷新失败", text: message });
            return repos;
        } finally {
            setReposLoading(false);
        }
    };

    const pollThreadUntilReply = (threadId: string, canvasId: string, prompt: string) => {
        stopThreadPoll();
        writePendingRun({ threadId, canvasId, prompt, startedAt: Date.now() });
        let attempts = 0;
        const tick = async () => {
            attempts += 1;
            try {
                const items = await refreshThreadMessages(threadId, canvasId, prompt);
                if (hasReplyAfterPrompt(items, prompt)) {
                    finishCurrentTurn("本轮完成", true);
                    return;
                }
            } catch (error) {
                if (attempts >= 2) pushMessage({ id: createId(), role: "error", title: "刷新失败", text: error instanceof Error ? error.message : String(error) });
            }
            if (attempts >= 60) {
                pendingPromptRef.current = "";
                setSending(false);
                clearPendingRun();
                stopThreadPoll();
                markActiveQueueTask("failed", "等待 Codex 返回超时");
                setTemporaryStatus("");
                pushMessage({ id: createId(), role: "status", text: "Codex 还没返回结果。回到页面或点右上角连接按钮，会继续同步当前会话记录。" });
                return;
            }
            pollTimerRef.current = setTimeout(tick, attempts < 4 ? 1500 : 3000);
        };
        pollTimerRef.current = setTimeout(tick, 1200);
    };

    const resumeThreadAfterInterruption = async () => {
        const currentSettings = settingsRef.current;
        if (!currentSettings.agentUrl.trim() || !currentSettings.token.trim()) return;
        const pendingRun = readPendingRun();
        if (pendingRun) {
            pendingPromptRef.current = pendingRun.prompt;
            setSending(true);
            setTemporaryStatus("正在同步后台执行结果...");
            setActiveThreadId(pendingRun.threadId);
            if (currentSettings.threadId !== pendingRun.threadId || normalizeCanvasId(currentSettings.canvasId) !== pendingRun.canvasId) {
                updateSettings({ threadId: pendingRun.threadId, canvasId: pendingRun.canvasId });
            }
            try {
                const items = await refreshThreadMessages(pendingRun.threadId, pendingRun.canvasId, pendingRun.prompt);
                if (hasReplyAfterPrompt(items, pendingRun.prompt)) {
                    finishCurrentTurn("已同步最新结果", true);
                    return;
                }
                pollThreadUntilReply(pendingRun.threadId, pendingRun.canvasId, pendingRun.prompt);
            } catch {
                pollThreadUntilReply(pendingRun.threadId, pendingRun.canvasId, pendingRun.prompt);
            }
            return;
        }
        const threadId = activeThreadIdRef.current || normalizeThreadId(currentSettings.threadId);
        if (!threadId) return;
        try {
            await refreshThreadMessages(threadId, normalizeCanvasId(currentSettings.canvasId));
        } catch {
            // Foreground refresh is best effort; explicit connect still shows the real error.
        }
    };

    const handleAgentEvent = (event: AgentEvent) => {
        const item = event.item;
        const itemType = normalizeText(itemField(item, "type"));
        if (event.type === "turn.started") {
            setSending(true);
            setTemporaryStatus("Codex 正在思考...");
            upsertStreamMessage({ id: "turn-status", role: "status", text: "Codex 正在处理..." });
            return;
        }
        if (event.type === "turn.completed") {
            if (!pendingPromptRef.current) {
                setSending(false);
                stopThreadPoll();
                setTemporaryStatus("本轮完成", true);
            } else {
                setTemporaryStatus("本轮完成，正在同步记录...");
            }
            upsertStreamMessage({ id: `done-${Date.now()}`, role: "status", text: pendingPromptRef.current ? "本轮完成，正在同步记录..." : "本轮完成" });
            return;
        }
        if (event.type === "error") {
            const message = normalizeText(event.message || itemField(item, "message")) || "Codex 出错";
            failCurrentTurn(message);
            pushMessage({ id: createId(), role: "error", title: "Codex", text: message });
            return;
        }
        if ((event.type === "item.updated" || event.type === "item.completed") && itemType === "agent_message") {
            const id = normalizeText(itemField(item, "id")) || createId();
            const text = normalizeText(itemField(item, "text"));
            if (text) {
                setTemporaryStatus("Codex 正在输出回复...");
                upsertStreamMessage({ id, streamId: id, role: "assistant", title: "Codex", text });
            }
            return;
        }
        if (event.type === "item.started" || event.type === "item.completed") {
            const tool = normalizeText(itemField(item, "tool"));
            if (tool || itemType === "commandExecution" || itemType === "fileChange") {
                const id = normalizeText(itemField(item, "id")) || createId();
                const label = itemType === "commandExecution" ? "命令" : itemType === "fileChange" ? "文件变更" : toolLabel(tool);
                const status = normalizeText(itemField(item, "status")) || (event.type === "item.started" ? "执行中" : "完成");
                setTemporaryStatus(event.type === "item.started" ? itemStatusLabel(itemType, tool) : `${label} 已完成`, event.type === "item.completed");
                upsertStreamMessage({ id, streamId: id, role: "tool", title: label, text: status });
            }
        }
    };

    const connect = async (options: { quiet?: boolean } = {}) => {
        eventSourceRef.current?.close();
        setConnecting(true);
        setConnected(false);
        setConnectionStatus("connecting");
        setConnectionMessage("正在连接电脑 Agent...");
        if (!options.quiet) pushMessage({ id: createId(), role: "status", text: "正在连接电脑 Agent..." });
        try {
            const agentEndpoint = validateAgentUrl(settingsRef.current.agentUrl);
            if (agentEndpoint !== settingsRef.current.agentUrl.trim()) {
                settingsRef.current = { ...settingsRef.current, agentUrl: agentEndpoint };
                updateSettings({ agentUrl: agentEndpoint });
            }
            const canvasId = normalizeCanvasId(settingsRef.current.canvasId);
            const threadId = normalizeThreadId(settingsRef.current.threadId);
            if (settingsRef.current.workspacePath.trim()) {
                const data = await agentFetch<{ workspace?: Workspace }>("/agent/codex/workspace", {
                    method: "POST",
                    body: JSON.stringify({ canvasId, workspacePath: settingsRef.current.workspacePath.trim() }),
                });
                setWorkspace(data.workspace || null);
                setActiveThreadId(data.workspace?.activeThreadId || "");
            }

            const data = await agentFetch<{ workspace?: Workspace }>(`/agent/codex/workspace?canvasId=${encodeURIComponent(canvasId)}`);
            setWorkspace(data.workspace || null);
            setActiveThreadId(threadId || data.workspace?.activeThreadId || "");

            if (threadId) {
                const resumed = await agentFetch<{ workspace?: Workspace; messages?: MobileMessage[] }>(`/agent/codex/threads/${encodeURIComponent(threadId)}/resume`, {
                    method: "POST",
                    body: JSON.stringify({ canvasId }),
                });
                setWorkspace(resumed.workspace || data.workspace || null);
                setActiveThreadId(threadId);
                if (resumed.messages?.length) applyThreadMessages(resumed.messages);
            }

            setConnected(true);
            setConnecting(false);
            setConnectionStatus("connected");
            setConnectionMessage("已连接电脑 Codex");
            if (!options.quiet) pushMessage({ id: createId(), role: "status", text: "已连接电脑 Codex" });
            void refreshGitRepos(true);
            void refreshThreads(true);

            const source = new EventSource(withToken(agentEndpoint, `/events?clientId=mobile-codex-${Date.now()}`, settingsRef.current.token));
            eventSourceRef.current = source;
            source.addEventListener("hello", () => {
                setConnected(true);
                setConnecting(false);
                setConnectionStatus("connected");
                setConnectionMessage("实时通道已连接");
            });
            source.addEventListener("agent_event", (event) => {
                const data = parseEventData<AgentEvent>(event);
                if (data) handleAgentEvent(data);
            });
            source.addEventListener("agent_error", (event) => {
                const data = parseEventData<{ message?: string }>(event);
                const message = data?.message || "Agent 出错";
                failCurrentTurn(message);
                pushMessage({ id: createId(), role: "error", title: "Agent", text: message });
            });
            source.addEventListener("agent_done", () => {
                const threadId = activeThreadIdRef.current || normalizeThreadId(settingsRef.current.threadId);
                const canvasId = normalizeCanvasId(settingsRef.current.canvasId);
                const pendingPrompt = pendingPromptRef.current;
                if (!threadId) {
                    failCurrentTurn("没有可同步的 Codex 会话");
                    return;
                }
                void refreshThreadMessages(threadId, canvasId, pendingPrompt).then((items) => {
                    if (!pendingPrompt || hasReplyAfterPrompt(items, pendingPrompt)) {
                        finishCurrentTurn("本轮完成", true);
                    }
                });
            });
            source.onerror = () => {
                setConnecting(false);
                setConnectionStatus("offline");
                setConnectionMessage("实时通道断开；发送和同步仍会尝试通过 HTTP 继续");
            };
            return true;
        } catch (error) {
            setConnecting(false);
            setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            setConnectionStatus("error");
            setConnectionMessage(message);
            pushMessage({ id: createId(), role: "error", title: "连接失败", text: message });
            return false;
        }
    };

    const selectThread = async (thread: ThreadSummary) => {
        if (!thread.id) return;
        try {
            const canvasId = normalizeCanvasId(settingsRef.current.canvasId);
            setTemporaryStatus("正在切换会话...");
            const data = await agentFetch<{ workspace?: Workspace; messages?: MobileMessage[] }>(`/agent/codex/threads/${encodeURIComponent(thread.id)}/resume`, {
                method: "POST",
                body: JSON.stringify({ canvasId }),
            });
            setWorkspace(data.workspace || workspace);
            setActiveThreadId(thread.id);
            updateSettings({ threadId: thread.id });
            if (data.messages?.length) applyThreadMessages(data.messages);
            else setMessages([]);
            setThreadsOpen(false);
            setTemporaryStatus("会话已切换", true);
        } catch (error) {
            setTemporaryStatus("");
            pushMessage({ id: createId(), role: "error", title: "切换会话失败", text: error instanceof Error ? error.message : String(error) });
        }
    };

    const pushCurrentCommit = async () => {
        if (pushing) return;
        if (!settingsRef.current.agentUrl.trim() || !settingsRef.current.token.trim()) {
            setSettingsOpen(true);
            pushMessage({ id: createId(), role: "error", title: "无法推送", text: "请先填写 Agent URL 和 Token。" });
            return;
        }
        if (!connected) {
            const ok = await connect({ quiet: true });
            if (!ok) return;
        }
        let repo = repos.find((item) => samePath(item.repoPath, settingsRef.current.gitRepoPath)) || selectedRepo;
        if (!repo) {
            const list = await refreshGitRepos(true);
            repo = list.find((item) => samePath(item.repoPath, settingsRef.current.gitRepoPath)) || list.find((item) => !item.pushBlocked) || list[0];
        }
        if (!repo) {
            pushMessage({ id: createId(), role: "error", title: "无法推送", text: "电脑上没有发现可推送的 Git 仓库。" });
            return;
        }
        if (repo.pushBlocked) {
            pushMessage({ id: createId(), role: "error", title: "推送已拦截", text: repo.warnings.join("\n") || "这个仓库当前不适合从手机直接 push。" });
            return;
        }
        const remote = repo.defaultRemote || "origin";
        const branch = repo.defaultBranch || "main";
        setPushing(true);
        setTemporaryStatus(`正在推送 ${repoName(repo.repoPath)}...`);
        pushMessage({ id: createId(), role: "status", text: `正在让电脑执行 git push ${remote} HEAD:${branch}\n${repo.repoPath}` });
        try {
            const data = await agentFetch<{ stdout?: string; stderr?: string; remote?: string; branch?: string; repo?: GitRepoInfo; repoPath?: string }>("/agent/git/push", {
                method: "POST",
                body: JSON.stringify({ canvasId: normalizeCanvasId(settingsRef.current.canvasId), repoPath: repo.repoPath, remote, branch }),
            });
            pushMessage({ id: createId(), role: "tool", title: "Git push", text: data.stdout || data.stderr || `已推送 ${repoName(data.repo?.repoPath || repo.repoPath)} 到 ${data.remote || remote}/${data.branch || branch}` });
            setTemporaryStatus("推送完成", true);
            void refreshGitRepos(true);
        } catch (error) {
            setTemporaryStatus("");
            pushMessage({ id: createId(), role: "error", title: "推送失败", text: error instanceof Error ? error.message : String(error) });
        } finally {
            setPushing(false);
        }
    };

    const newThread = async () => {
        try {
            const data = await agentFetch<{ workspace?: Workspace; thread?: { id?: string }; messages?: MobileMessage[] }>("/agent/codex/threads/new", {
                method: "POST",
                body: JSON.stringify({ canvasId: normalizeCanvasId(settingsRef.current.canvasId) }),
            });
            setWorkspace(data.workspace || workspace);
            setActiveThreadId(data.thread?.id || data.workspace?.activeThreadId || "");
            if (data.thread?.id || data.workspace?.activeThreadId) updateSettings({ threadId: data.thread?.id || data.workspace?.activeThreadId || "" });
            setMessages([]);
            setThreadsOpen(false);
            pushMessage({ id: createId(), role: "status", text: "已创建新 Codex 对话" });
            void refreshThreads(true);
        } catch (error) {
            pushMessage({ id: createId(), role: "error", title: "新对话失败", text: error instanceof Error ? error.message : String(error) });
        }
    };

    async function submitPrompt(prompt: string, currentAttachments: AgentAttachment[], options: { queuedTaskId?: string } = {}) {
        if (!settingsRef.current.agentUrl.trim() || !settingsRef.current.token.trim()) {
            setConnectionStatus("error");
            setConnectionMessage("请先填写 Agent URL 和 Token");
            setSettingsOpen(true);
            if (options.queuedTaskId) markActiveQueueTask("queued");
            pushMessage({ id: createId(), role: "error", title: "发送失败", text: "请先填写 Agent URL 和 Token。" });
            return;
        }
        if (!connected) {
            const ok = await connect({ quiet: true });
            if (!ok) {
                if (options.queuedTaskId) markActiveQueueTask("queued");
                return;
            }
        }
        setSending(true);
        pendingPromptRef.current = prompt;
        setTemporaryStatus("Codex 正在接收任务...");
        pushMessage({ id: createId(), role: "user", text: currentAttachments.length ? `${prompt}\n\n[图片附件 ${currentAttachments.length} 张]` : prompt });
        upsertStreamMessage({ id: "turn-status", role: "status", text: "Codex 正在处理..." });
        try {
            const canvasId = normalizeCanvasId(settingsRef.current.canvasId);
            const targetThreadId = activeThreadIdRef.current || normalizeThreadId(settingsRef.current.threadId);
            if (targetThreadId) writePendingRun({ threadId: targetThreadId, canvasId, prompt, startedAt: Date.now() });
            const data = await agentFetch<{ threadId?: string }>("/agent/codex/turn", {
                method: "POST",
                body: JSON.stringify({ prompt, canvasId, threadId: targetThreadId || undefined, attachments: currentAttachments }),
            });
            if (data.threadId) {
                setActiveThreadId(data.threadId);
                updateSettings({ threadId: data.threadId });
                pollThreadUntilReply(data.threadId, canvasId, prompt);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.queuedTaskId) {
                failCurrentTurn(message);
            } else {
                setSending(false);
                pendingPromptRef.current = "";
                stopThreadPoll();
                setTemporaryStatus("");
                setAttachments(currentAttachments);
            }
            pushMessage({ id: createId(), role: "error", title: "发送失败", text: message });
        }
    }

    async function runNextQueuedTask() {
        if (pendingPromptRef.current || activeQueueTaskIdRef.current) return;
        const nextTask = queuedTasksRef.current.find((item) => item.status === "queued");
        if (!nextTask) return;
        activeQueueTaskIdRef.current = nextTask.id;
        setQueuedTasks((items) => {
            const next = items.map((item) => (item.id === nextTask.id ? { ...item, status: "running" as QueuedTaskStatus, error: "" } : item));
            queuedTasksRef.current = next;
            return next;
        });
        setTemporaryStatus(`正在执行队列任务：${nextTask.text.slice(0, 36)}${nextTask.text.length > 36 ? "..." : ""}`);
        await submitPrompt(nextTask.text, nextTask.attachments || [], { queuedTaskId: nextTask.id });
    }

    const submit = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const currentAttachments = attachments;
        const prompt = input.trim() || (currentAttachments.length ? "请根据图片继续处理当前任务。" : "");
        if (!prompt) return;
        setInput("");
        setAttachments([]);
        if (sending || pendingPromptRef.current || activeQueueTaskIdRef.current) {
            enqueueTask(prompt, currentAttachments);
            return;
        }
        await submitPrompt(prompt, currentAttachments);
    };

    const copyMessage = async (message: MobileMessage) => {
        await navigator.clipboard.writeText(message.text);
        setCopiedId(message.id);
        window.setTimeout(() => setCopiedId(""), 1200);
    };

    const pickImages = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files || [])].filter((file) => file.type.startsWith("image/")).slice(0, 6);
        event.target.value = "";
        if (!files.length) return;
        try {
            const next = await Promise.all(files.map(readFileAsDataUrl));
            setAttachments((items) => [...items, ...next].slice(0, 6));
        } catch (error) {
            pushMessage({ id: createId(), role: "error", title: "图片读取失败", text: error instanceof Error ? error.message : String(error) });
        }
    };

    return (
        <main className="flex h-full flex-col bg-[#f5f3ee] text-stone-950 dark:bg-[#070707] dark:text-stone-100">
            <header className="flex shrink-0 items-center justify-between border-b border-black/10 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-semibold leading-6">
                        <TerminalSquare className="size-4" />
                        移动 Codex
                        <span className="rounded-full border border-black/10 bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium leading-4 text-stone-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-400">{mobileAgentUiVersion}</span>
                    </div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">{workspace?.workspacePath || "未连接工作目录"}</div>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="relative grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => setQueueOpen(true)} aria-label="任务队列" title="任务队列">
                        <ListTodo className="size-4" />
                        {activeQueueCount ? <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-sky-500 px-1 text-[10px] font-semibold leading-4 text-white">{activeQueueCount}</span> : null}
                    </button>
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => { setThreadsOpen(true); void refreshThreads(true); }} aria-label="会话" title="会话">
                        <MessageSquareText className="size-4" />
                    </button>
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => void connect()} aria-label="连接" title="连接">
                        {connecting ? <LoaderCircle className="size-4 animate-spin" /> : connected ? <CheckCircle2 className="size-4" /> : <PlugZap className="size-4" />}
                    </button>
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => setSettingsOpen(true)} aria-label="配置" title="配置">
                        <Settings2 className="size-4" />
                    </button>
                </div>
            </header>

            {connectionMessage ? (
                <div
                    className={[
                        "shrink-0 border-b px-4 py-2 text-xs leading-5",
                        connectionStatus === "connected"
                            ? "border-emerald-500/15 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
                            : connectionStatus === "connecting"
                              ? "border-sky-500/15 bg-sky-500/10 text-sky-800 dark:text-sky-100"
                              : connectionStatus === "error"
                                ? "border-red-500/15 bg-red-500/10 text-red-800 dark:text-red-100"
                                : "border-amber-500/15 bg-amber-500/10 text-amber-800 dark:text-amber-100",
                    ].join(" ")}
                >
                    {connectionMessage}
                </div>
            ) : null}

            {sending || runStatus ? (
                <div className="shrink-0 border-b border-black/10 bg-amber-500/10 px-4 py-2 text-xs leading-5 text-amber-800 dark:border-white/10 dark:text-amber-100">
                    {runStatus || "Codex 后台执行中。手机锁屏或切后台后，回到页面会自动同步当前会话记录。"}
                </div>
            ) : null}

            <div ref={scrollerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {messages.length ? (
                        messages.map((message) => (
                            <article key={message.id} className={`group flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div
                                    className={[
                                        "max-w-[90%] rounded-2xl px-4 py-3 text-[15px] leading-7 shadow-sm",
                                        message.role === "user"
                                            ? "bg-stone-950 text-white dark:bg-white dark:text-black"
                                            : message.role === "error"
                                              ? "border border-red-500/20 bg-red-500/10 text-red-900 dark:text-red-100"
                                              : message.role === "tool" || message.role === "status"
                                                ? "border border-black/10 bg-white/50 text-stone-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-300"
                                                : "border border-black/10 bg-white/78 text-stone-900 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.07] dark:text-stone-100",
                                    ].join(" ")}
                                >
                                    {message.title ? <div className="mb-1 text-xs font-medium opacity-60">{message.title}</div> : null}
                                    <div className="whitespace-pre-wrap break-words">{message.text || "..."}</div>
                                    {message.role === "assistant" && message.text ? (
                                        <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400 transition hover:text-stone-700 dark:hover:text-stone-200" onClick={() => void copyMessage(message)}>
                                            {copiedId === message.id ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
                                            {copiedId === message.id ? "已复制" : "复制"}
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        ))
                    ) : (
                        <section className="flex min-h-[52vh] flex-col items-center justify-center text-center">
                            <div className="grid size-12 place-items-center rounded-2xl bg-stone-950 text-white shadow-sm dark:bg-white dark:text-black">
                                <FolderGit2 className="size-5" />
                            </div>
                            <h1 className="mt-5 text-2xl font-semibold">手机操作 Codex</h1>
                            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">{connected ? "回复会显示在本页；电脑端窗口不一定实时同步。" : "连接电脑 Agent 后开始。"}</p>
                        </section>
                    )}
                </div>
            </div>

            {unreadCount > 0 ? (
                <button type="button" onClick={scrollToLatest} className="fixed bottom-24 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-sky-300/35 bg-[#0A84FF] px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(10,132,255,.38)] transition active:scale-95 dark:border-sky-300/25 dark:bg-[#0A84FF] dark:text-white">
                    <ChevronDown className="size-4" />
                    {unreadCount} 条新消息
                </button>
            ) : null}

            <form onSubmit={(event) => void submit(event)} className="shrink-0 border-t border-black/10 bg-white/72 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-black/72">
                {attachments.length ? (
                    <div className="mx-auto mb-2 flex max-w-3xl gap-2 overflow-x-auto">
                        {attachments.map((item, index) => (
                            <div key={`${item.name}-${index}`} className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.06]">
                                {item.dataUrl ? <img src={item.dataUrl} alt={item.name || "attachment"} className="size-full object-cover" /> : null}
                                <button type="button" className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white" onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="移除图片">
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : null}
                <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-black/10 bg-[#f9f8f4] p-2 shadow-[0_12px_34px_rgba(23,21,19,.10)] dark:border-white/10 dark:bg-white/[0.06]">
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void pickImages(event)} />
                    <button type="button" className="grid size-10 shrink-0 place-items-center rounded-2xl text-stone-500 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white" onClick={() => fileInputRef.current?.click()} aria-label="添加图片">
                        <ImagePlus className="size-4" />
                    </button>
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                        rows={1}
                        placeholder={connected ? "让 Codex 继续做项目任务..." : "可以先输入，发送时会尝试连接电脑 Agent"}
                        className="max-h-36 min-h-10 flex-1 bg-transparent px-1 py-2 text-[16px] leading-6 outline-none placeholder:text-stone-400"
                    />
                    <button
                        type="button"
                        disabled={!canSend}
                        className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#0A84FF] text-white shadow-[0_8px_24px_rgba(10,132,255,.32)] transition enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none dark:bg-[#0A84FF] dark:text-white dark:disabled:bg-white/10 dark:disabled:text-white/35"
                        aria-label={sending ? "加入任务队列" : "发送"}
                        onClick={(event) => {
                            event.preventDefault();
                            void submit();
                        }}
                    >
                        {sending ? <Plus className="size-4" /> : <SendHorizontal className="size-4" />}
                    </button>
                </div>
            </form>

            {queueOpen ? (
                <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" onClick={() => setQueueOpen(false)}>
                    <section className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-black/10 bg-[#f7f5ef] p-5 shadow-2xl sm:left-auto sm:top-0 sm:h-full sm:w-[430px] sm:rounded-none dark:border-white/10 dark:bg-[#101010]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">任务队列</h2>
                                <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">队列会按顺序发送到当前 Codex 会话；手机页面恢复后会继续同步并执行下一条。</p>
                            </div>
                            <button type="button" className="grid size-9 shrink-0 place-items-center text-stone-500 transition hover:text-stone-950 dark:hover:text-white" onClick={() => setQueueOpen(false)} aria-label="关闭">
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="mt-4 rounded-2xl border border-black/10 bg-white/65 p-3 dark:border-white/10 dark:bg-white/[0.05]">
                            <textarea
                                value={queueInput}
                                onChange={(event) => setQueueInput(event.target.value)}
                                rows={4}
                                placeholder="写下一条要排队执行的任务..."
                                className="min-h-28 w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-stone-400 dark:text-stone-100"
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                                {queueGuides.map((guide) => (
                                    <button
                                        key={guide}
                                        type="button"
                                        className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs text-stone-700 transition hover:border-sky-400/40 hover:bg-sky-500/10 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-200 dark:hover:bg-sky-400/10"
                                        onClick={() => setQueueInput((value) => (value.trim() ? `${value.trim()}\n${guide}` : guide))}
                                    >
                                        {guide}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-2">
                                <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black" disabled={!queueInput.trim()} onClick={addQueueTaskFromDrawer}>
                                    <Plus className="size-4" />
                                    加入队列
                                </button>
                                <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/70 px-3 text-sm text-stone-600 transition hover:text-stone-950 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-300 dark:hover:text-white" onClick={clearFinishedQueue} disabled={!queuedTasks.some((item) => item.status === "done" || item.status === "failed")}>
                                    <Trash2 className="size-4" />
                                    清理完成
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            {queuedTasks.map((task, index) => (
                                <div key={task.id} className="rounded-2xl border border-black/10 bg-white/70 px-3 py-3 text-left dark:border-white/10 dark:bg-white/[0.05]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                                                {task.status === "running" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Clock3 className="size-3.5" />}
                                                <span>#{index + 1}</span>
                                                <span
                                                    className={[
                                                        "rounded-full px-2 py-0.5",
                                                        task.status === "running"
                                                            ? "bg-sky-500/12 text-sky-700 dark:text-sky-200"
                                                            : task.status === "failed"
                                                              ? "bg-red-500/12 text-red-700 dark:text-red-200"
                                                              : task.status === "done"
                                                                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
                                                                : "bg-black/[0.05] text-stone-600 dark:bg-white/[0.08] dark:text-stone-300",
                                                    ].join(" ")}
                                                >
                                                    {task.status === "running" ? "执行中" : task.status === "failed" ? "失败" : task.status === "done" ? "完成" : "待执行"}
                                                </span>
                                                {task.attachments.length ? <span>{task.attachments.length} 张图</span> : null}
                                            </div>
                                            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-900 dark:text-stone-100">{task.text}</div>
                                            {task.error ? <div className="mt-2 text-xs leading-5 text-red-700 dark:text-red-200">{task.error}</div> : null}
                                        </div>
                                        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-xl text-stone-400 transition hover:bg-black/[0.04] hover:text-stone-900 disabled:opacity-30 dark:hover:bg-white/[0.08] dark:hover:text-white" onClick={() => removeQueueTask(task.id)} disabled={task.status === "running"} aria-label="删除队列任务">
                                            <Trash2 className="size-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {!queuedTasks.length ? <div className="rounded-2xl bg-black/[0.04] px-3 py-5 text-center text-xs leading-5 text-stone-500 dark:bg-white/[0.05] dark:text-stone-400">暂无排队任务。当前任务运行时，也可以直接在底部输入框继续发送，内容会自动进入队列。</div> : null}
                        </div>
                    </section>
                </div>
            ) : null}

            {threadsOpen ? (
                <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" onClick={() => setThreadsOpen(false)}>
                    <section className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-black/10 bg-[#f7f5ef] p-5 shadow-2xl sm:bottom-auto sm:right-auto sm:top-0 sm:h-full sm:w-[430px] sm:rounded-none dark:border-white/10 dark:bg-[#101010]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">选择会话</h2>
                                <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">按工作目录分区显示；当前后端返回的是已连接 workspace 的会话。</p>
                            </div>
                            <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:hover:text-white" onClick={() => setThreadsOpen(false)} aria-label="关闭">
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <input value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder="搜索当前工作区会话" className="h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-500 dark:border-white/10 dark:bg-[#181818] dark:text-stone-100" />
                            <button type="button" className="grid size-11 place-items-center rounded-xl border border-black/10 bg-white text-stone-600 disabled:opacity-45 dark:border-white/10 dark:bg-[#181818] dark:text-stone-300" onClick={() => void refreshThreads()} disabled={threadsLoading || !settings.agentUrl.trim() || !settings.token.trim()} aria-label="刷新会话">
                                <RefreshCcw className={`size-4 ${threadsLoading ? "animate-spin" : ""}`} />
                            </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium disabled:opacity-45 dark:border-white/10 dark:bg-[#181818] dark:text-stone-100" onClick={() => void connect()}>
                                <PlugZap className="size-4" />
                                连接
                            </button>
                            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium disabled:opacity-45 dark:border-white/10 dark:bg-[#181818] dark:text-stone-100" onClick={() => void newThread()} disabled={!connected}>
                                <RotateCcw className="size-4" />
                                新对话
                            </button>
                        </div>
                        {threadError ? <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-800 dark:text-red-100">{threadError}</div> : null}
                        <div className="mt-4 space-y-5">
                            {groupedThreads.map((group) => (
                                <div key={group.key}>
                                    <div className="mb-2 flex items-center justify-between gap-3 px-1">
                                        <div className="min-w-0">
                                            <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">{group.label}</div>
                                            <div className="truncate text-[11px] leading-4 text-stone-400 dark:text-stone-500">{group.path}</div>
                                        </div>
                                        <div className="shrink-0 text-[11px] text-stone-400 dark:text-stone-500">{group.threads.length}</div>
                                    </div>
                                    <div className="space-y-2">
                                        {group.threads.map((thread) => (
                                            <button
                                                key={thread.id}
                                                type="button"
                                                className={[
                                                    "block w-full rounded-2xl border px-3 py-3 text-left transition",
                                                    thread.id === activeThreadId
                                                        ? "border-sky-500/45 bg-sky-500/12 text-stone-950 shadow-[0_10px_28px_rgba(14,165,233,.16)] dark:border-sky-400/45 dark:bg-[#0d2631] dark:text-stone-50"
                                                        : "border-black/10 bg-white/70 text-stone-900 hover:bg-white dark:border-white/10 dark:bg-[#151515] dark:text-stone-100 dark:hover:bg-[#1d1d1d]",
                                                ].join(" ")}
                                                onClick={() => void selectThread(thread)}
                                            >
                                                <div className="line-clamp-2 text-sm font-medium leading-5">{threadTitle(thread)}</div>
                                                <div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-60">
                                                    <span className="truncate">{thread.id}</span>
                                                    <span className="shrink-0">{formatThreadTime(thread.updatedAt || thread.createdAt)}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {!threads.length ? <div className="rounded-2xl bg-black/[0.04] px-3 py-4 text-center text-xs leading-5 text-stone-500 dark:bg-white/[0.05] dark:text-stone-400">连接后点击刷新，会列出当前 Workspace 下的 Codex 会话。</div> : null}
                        </div>
                    </section>
                </div>
            ) : null}

            {settingsOpen ? (
                <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
                    <section className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-black/10 bg-[#f7f5ef] p-5 shadow-2xl sm:left-auto sm:top-0 sm:h-full sm:w-[430px] sm:rounded-none dark:border-white/10 dark:bg-[#101010]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">连接配置</h2>
                            <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:hover:text-white" onClick={() => setSettingsOpen(false)} aria-label="关闭">
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-100">
                                Agent URL 是电脑上 canvas-agent 的 HTTPS 服务地址，不是画布网页地址、New API 地址或创作 Agent API。不要把 17371 端口无鉴权裸露到公网。
                            </p>
                            <label className="block">
                                <span className="text-sm font-medium">Agent URL</span>
                                <input value={settings.agentUrl} onChange={(event) => updateSettings({ agentUrl: event.target.value })} placeholder="https://your-canvas-agent.example.com" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">填 cloudflared / Tailscale / VPS 反代出的 canvas-agent 地址。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Token</span>
                                <input value={settings.token} onChange={(event) => updateSettings({ token: event.target.value })} type="password" autoComplete="new-password" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">canvas-agent 启动输出的 Connect token，不是 Codex API Key。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Workspace</span>
                                <input value={settings.workspacePath} onChange={(event) => updateSettings({ workspacePath: event.target.value })} placeholder="可留空" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">留空使用 agent 已保存的工作区。指定 Codex 会话时，Workspace 必须和该会话的 cwd 一致。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Canvas ID</span>
                                <input value={settings.canvasId} onChange={(event) => updateSettings({ canvasId: event.target.value })} placeholder="/canvas/019f..." className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">只用于区分画布工作区，可填完整 /canvas/019...，不是 Codex 会话。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Codex Thread ID</span>
                                <input value={settings.threadId} onChange={(event) => updateSettings({ threadId: event.target.value })} placeholder="codex://threads/019f..." className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">要继续指定 Codex 会话就填这里；可填完整 codex://threads/... 或只填 ID。</span>
                            </label>

                            <div className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.05]">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Settings2 className="size-4" />
                                    模型与强度
                                </div>
                                <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">当前本机 agent 后端还不接收 model / effort 参数，所以这里先只保留配置位，实际仍沿用电脑 Codex 默认设置。</p>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <input value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="模型，待后端接入" disabled className="h-11 rounded-xl border border-black/10 bg-white/60 px-3 text-sm outline-none disabled:opacity-55 dark:border-white/10 dark:bg-white/[0.06]" />
                                    <select value={settings.effort} onChange={(event) => updateSettings({ effort: event.target.value })} disabled className="h-11 rounded-xl border border-black/10 bg-white/60 px-3 text-sm outline-none disabled:opacity-55 dark:border-white/10 dark:bg-white/[0.06]">
                                        <option value="">强度，待后端接入</option>
                                        <option value="low">low</option>
                                        <option value="medium">medium</option>
                                        <option value="high">high</option>
                                        <option value="xhigh">xhigh</option>
                                    </select>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.05]">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <GitBranch className="size-4" />
                                            本机 Git 仓库
                                        </div>
                                        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">手机 push 只推已提交 HEAD，不会自动 add/commit。</div>
                                    </div>
                                    <button type="button" className="grid size-9 shrink-0 place-items-center rounded-xl border border-black/10 bg-white text-stone-600 transition hover:text-stone-950 disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-300" onClick={() => void refreshGitRepos()} disabled={reposLoading || !settings.agentUrl.trim() || !settings.token.trim()} aria-label="刷新仓库">
                                        <RefreshCcw className={`size-4 ${reposLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                                <select value={settings.gitRepoPath} onChange={(event) => updateSettings({ gitRepoPath: event.target.value })} className="mt-3 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-stone-500 dark:border-white/10 dark:bg-[#151515]">
                                    <option value="">选择要推送的仓库</option>
                                    {repos.map((repo) => (
                                        <option key={repo.repoPath} value={repo.repoPath}>
                                            {repoName(repo.repoPath)} - {repo.branch}
                                        </option>
                                    ))}
                                </select>
                                {selectedRepo ? (
                                    <div className="mt-3 space-y-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
                                        <div className="break-all rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.05]">{selectedRepo.repoPath}</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.05]">当前分支：{selectedRepo.branch}</div>
                                            <div className="rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.05]">推送目标：{selectedRepo.defaultRemote || "origin"}/{selectedRepo.defaultBranch || "main"}</div>
                                        </div>
                                        {selectedRepo.remotes[0] ? <div className="break-all rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.05]">远程：{selectedRepo.remotes[0].url}</div> : null}
                                        {selectedRepo.statusShort.length ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-100">未提交改动：{selectedRepo.statusShort.length} 条。手机 push 不会把这些改动带上。</div> : null}
                                        {selectedRepo.warnings.map((warning) => (
                                            <div key={warning} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-800 dark:text-red-100">
                                                {warning}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-3 rounded-xl bg-black/[0.04] px-3 py-2 text-xs leading-5 text-stone-500 dark:bg-white/[0.05] dark:text-stone-400">{repoError || "连接后会自动扫描本机仓库，也可以点刷新。"}</div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-2">
                            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium dark:border-white/10 dark:bg-white/[0.06]" onClick={() => void connect()}>
                                <PlugZap className="size-4" />
                                连接
                            </button>
                            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.06]" onClick={() => void newThread()} disabled={!connected}>
                                <RotateCcw className="size-4" />
                                新对话
                            </button>
                            <button type="button" className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.06]" onClick={() => void pushCurrentCommit()} disabled={pushing || !settings.agentUrl.trim() || !settings.token.trim()}>
                                {pushing ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                                推送所选仓库已提交 HEAD
                            </button>
                            <button type="button" className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium dark:border-white/10 dark:bg-white/[0.06]" onClick={() => setMessages([])}>
                                <Trash2 className="size-4" />
                                清空消息
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </main>
    );
}
