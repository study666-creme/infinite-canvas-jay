"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, FolderGit2, LoaderCircle, PlugZap, RotateCcw, SendHorizontal, Settings2, TerminalSquare, Trash2, X } from "lucide-react";

type MessageRole = "user" | "assistant" | "tool" | "error" | "status";
type MobileMessage = { id: string; role: MessageRole; title?: string; text: string; streamId?: string };
type Settings = { agentUrl: string; token: string; canvasId: string; threadId: string; workspacePath: string };
type Workspace = { canvasId: string; workspacePath: string; activeThreadId?: string };
type AgentEvent = { type?: string; item?: Record<string, unknown>; usage?: unknown; message?: string };
type PendingRun = { threadId: string; canvasId: string; prompt: string; startedAt: number };

const settingsKey = "kazang-mobile-codex:settings";
const messagesKey = "kazang-mobile-codex:messages";
const pendingRunKey = "kazang-mobile-codex:pending-run";
const pendingRunMaxAge = 1000 * 60 * 60 * 12;
const defaultSettings: Settings = {
    agentUrl: "",
    token: "",
    canvasId: "default",
    threadId: "",
    workspacePath: "",
};
const legacyDefaultWorkspacePath = "D:\\canvas\\infinite-canvas";

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
    if (!raw) throw new Error("请先填写 canvas-agent 的 HTTPS 地址");
    if (isCanvasWebUrl(raw)) throw new Error("Agent URL 填成了画布网页地址。这里要填 cloudflared / Tailscale / VPS 反代出来的 canvas-agent 地址。");
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("Agent URL 不是有效网址");
    }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) throw new Error("手机远程连接需要 HTTPS Agent URL");
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

export default function MobileAgentPage() {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [messages, setMessages] = useState<MobileMessage[]>([]);
    const [input, setInput] = useState("");
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [sending, setSending] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [activeThreadId, setActiveThreadId] = useState("");
    const [copiedId, setCopiedId] = useState("");
    const [hydrated, setHydrated] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingPromptRef = useRef("");
    const settingsRef = useRef<Settings>(defaultSettings);
    const activeThreadIdRef = useRef("");
    const scrollerRef = useRef<HTMLDivElement>(null);

    const canSend = useMemo(() => connected && Boolean(input.trim()) && !sending, [connected, input, sending]);

    useEffect(() => {
        const loadedSettings = sanitizeSettings(readJson<Partial<Settings>>(localStorage.getItem(settingsKey), {}));
        settingsRef.current = loadedSettings;
        setSettings(loadedSettings);
        setMessages(readJson<MobileMessage[]>(localStorage.getItem(messagesKey), []));
        setHydrated(true);
        return () => {
            eventSourceRef.current?.close();
            stopThreadPoll();
        };
    }, []);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        activeThreadIdRef.current = activeThreadId;
    }, [activeThreadId]);

    useEffect(() => {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        localStorage.setItem(messagesKey, JSON.stringify(messages.slice(-120)));
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
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

    function stopThreadPoll() {
        if (!pollTimerRef.current) return;
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
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
        setMessages(items);
        return items;
    }

    const agentFetch = async <T,>(path: string, init?: RequestInit) => {
        const currentSettings = settingsRef.current;
        const response = await fetch(`${endpoint(currentSettings.agentUrl)}${path}`, {
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

    const pollThreadUntilReply = (threadId: string, canvasId: string, prompt: string) => {
        stopThreadPoll();
        writePendingRun({ threadId, canvasId, prompt, startedAt: Date.now() });
        let attempts = 0;
        const tick = async () => {
            attempts += 1;
            try {
                const items = await refreshThreadMessages(threadId, canvasId, prompt);
                if (hasReplyAfterPrompt(items, prompt)) {
                    pendingPromptRef.current = "";
                    setSending(false);
                    clearPendingRun();
                    stopThreadPoll();
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
                pushMessage({ id: createId(), role: "status", text: "Codex 还没返回结果。可以点右上角连接按钮刷新会话记录。" });
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
            setActiveThreadId(pendingRun.threadId);
            if (currentSettings.threadId !== pendingRun.threadId || normalizeCanvasId(currentSettings.canvasId) !== pendingRun.canvasId) {
                updateSettings({ threadId: pendingRun.threadId, canvasId: pendingRun.canvasId });
            }
            try {
                const items = await refreshThreadMessages(pendingRun.threadId, pendingRun.canvasId, pendingRun.prompt);
                if (hasReplyAfterPrompt(items, pendingRun.prompt)) {
                    pendingPromptRef.current = "";
                    setSending(false);
                    clearPendingRun();
                    stopThreadPoll();
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
            upsertStreamMessage({ id: "turn-status", role: "status", text: "Codex 正在处理..." });
            return;
        }
        if (event.type === "turn.completed") {
            setSending(false);
            if (!pendingPromptRef.current) stopThreadPoll();
            upsertStreamMessage({ id: `done-${Date.now()}`, role: "status", text: pendingPromptRef.current ? "本轮完成，正在同步记录..." : "本轮完成" });
            return;
        }
        if (event.type === "error") {
            setSending(false);
            stopThreadPoll();
            pushMessage({ id: createId(), role: "error", title: "Codex", text: normalizeText(event.message || itemField(item, "message")) || "Codex 出错" });
            return;
        }
        if ((event.type === "item.updated" || event.type === "item.completed") && itemType === "agent_message") {
            const id = normalizeText(itemField(item, "id")) || createId();
            const text = normalizeText(itemField(item, "text"));
            if (text) upsertStreamMessage({ id, streamId: id, role: "assistant", title: "Codex", text });
            return;
        }
        if (event.type === "item.started" || event.type === "item.completed") {
            const tool = normalizeText(itemField(item, "tool"));
            if (tool || itemType === "commandExecution") {
                const id = normalizeText(itemField(item, "id")) || createId();
                const label = itemType === "commandExecution" ? "命令" : toolLabel(tool);
                const status = normalizeText(itemField(item, "status")) || (event.type === "item.started" ? "执行中" : "完成");
                upsertStreamMessage({ id, streamId: id, role: "tool", title: label, text: status });
            }
        }
    };

    const connect = async () => {
        eventSourceRef.current?.close();
        setConnecting(true);
        setConnected(false);
        try {
            const agentEndpoint = validateAgentUrl(settings.agentUrl);
            if (agentEndpoint !== settings.agentUrl.trim()) updateSettings({ agentUrl: agentEndpoint });
            const canvasId = normalizeCanvasId(settings.canvasId);
            const threadId = normalizeThreadId(settings.threadId);
            if (settings.workspacePath.trim()) {
                const data = await agentFetch<{ workspace?: Workspace }>("/agent/codex/workspace", {
                    method: "POST",
                    body: JSON.stringify({ canvasId, workspacePath: settings.workspacePath.trim() }),
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
                if (resumed.messages?.length) setMessages(resumed.messages);
            }

            setConnected(true);
            setConnecting(false);
            pushMessage({ id: createId(), role: "status", text: "已连接电脑 Codex" });

            const source = new EventSource(withToken(settings.agentUrl, `/events?clientId=mobile-codex-${Date.now()}`, settings.token));
            eventSourceRef.current = source;
            source.addEventListener("hello", () => {
                setConnected(true);
                setConnecting(false);
            });
            source.addEventListener("agent_event", (event) => {
                const data = parseEventData<AgentEvent>(event);
                if (data) handleAgentEvent(data);
            });
            source.addEventListener("agent_error", (event) => {
                const data = parseEventData<{ message?: string }>(event);
                setSending(false);
                stopThreadPoll();
                pushMessage({ id: createId(), role: "error", title: "Agent", text: data?.message || "Agent 出错" });
            });
            source.addEventListener("agent_done", () => {
                const threadId = activeThreadId || normalizeThreadId(settings.threadId);
                const canvasId = normalizeCanvasId(settings.canvasId);
                const pendingPrompt = pendingPromptRef.current;
                if (!threadId) {
                    pendingPromptRef.current = "";
                    setSending(false);
                    stopThreadPoll();
                    return;
                }
                void refreshThreadMessages(threadId, canvasId, pendingPrompt).then((items) => {
                    if (!pendingPrompt || hasReplyAfterPrompt(items, pendingPrompt)) {
                        pendingPromptRef.current = "";
                        setSending(false);
                        clearPendingRun();
                        stopThreadPoll();
                    }
                });
            });
            source.onerror = () => {
                setConnecting(false);
            };
        } catch (error) {
            setConnecting(false);
            setConnected(false);
            pushMessage({ id: createId(), role: "error", title: "连接失败", text: error instanceof Error ? error.message : String(error) });
        }
    };

    const newThread = async () => {
        try {
            const data = await agentFetch<{ workspace?: Workspace; thread?: { id?: string } }>("/agent/codex/threads/new", {
                method: "POST",
                body: JSON.stringify({ canvasId: normalizeCanvasId(settings.canvasId) }),
            });
            setWorkspace(data.workspace || workspace);
            setActiveThreadId(data.thread?.id || data.workspace?.activeThreadId || "");
            if (data.thread?.id || data.workspace?.activeThreadId) updateSettings({ threadId: data.thread?.id || data.workspace?.activeThreadId || "" });
            setMessages([]);
            pushMessage({ id: createId(), role: "status", text: "已创建新 Codex 对话" });
        } catch (error) {
            pushMessage({ id: createId(), role: "error", title: "新对话失败", text: error instanceof Error ? error.message : String(error) });
        }
    };

    const submit = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const prompt = input.trim();
        if (!prompt || sending) return;
        setInput("");
        setSending(true);
        pendingPromptRef.current = prompt;
        pushMessage({ id: createId(), role: "user", text: prompt });
        upsertStreamMessage({ id: "turn-status", role: "status", text: "Codex 正在处理..." });
        try {
            const canvasId = normalizeCanvasId(settings.canvasId);
            const targetThreadId = activeThreadId || normalizeThreadId(settings.threadId);
            if (targetThreadId) writePendingRun({ threadId: targetThreadId, canvasId, prompt, startedAt: Date.now() });
            const data = await agentFetch<{ threadId?: string }>("/agent/codex/turn", {
                method: "POST",
                body: JSON.stringify({ prompt, canvasId, threadId: targetThreadId || undefined }),
            });
            if (data.threadId) {
                setActiveThreadId(data.threadId);
                updateSettings({ threadId: data.threadId });
                pollThreadUntilReply(data.threadId, canvasId, prompt);
            }
        } catch (error) {
            setSending(false);
            pendingPromptRef.current = "";
            stopThreadPoll();
            pushMessage({ id: createId(), role: "error", title: "发送失败", text: error instanceof Error ? error.message : String(error) });
        }
    };

    const copyMessage = async (message: MobileMessage) => {
        await navigator.clipboard.writeText(message.text);
        setCopiedId(message.id);
        window.setTimeout(() => setCopiedId(""), 1200);
    };

    return (
        <main className="flex h-full flex-col bg-[#f5f3ee] text-stone-950 dark:bg-[#070707] dark:text-stone-100">
            <header className="flex shrink-0 items-center justify-between border-b border-black/10 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-semibold leading-6">
                        <TerminalSquare className="size-4" />
                        移动 Codex
                    </div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">{workspace?.workspacePath || "未连接工作目录"}</div>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => void connect()} aria-label="连接" title="连接">
                        {connecting ? <LoaderCircle className="size-4 animate-spin" /> : connected ? <CheckCircle2 className="size-4" /> : <PlugZap className="size-4" />}
                    </button>
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => setSettingsOpen(true)} aria-label="配置" title="配置">
                        <Settings2 className="size-4" />
                    </button>
                </div>
            </header>

            {sending ? (
                <div className="shrink-0 border-b border-black/10 bg-amber-500/10 px-4 py-2 text-xs leading-5 text-amber-800 dark:border-white/10 dark:text-amber-100">
                    Codex 后台执行中。手机锁屏或切后台后，回到页面会自动同步当前会话记录。
                </div>
            ) : null}

            <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
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
                                                ? "border border-black/10 bg-white/50 text-stone-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-400"
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
                            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">{connected ? "回复会显示在本页，桌面窗口可能不会实时同步" : "连接电脑 Agent 后开始"}</p>
                        </section>
                    )}
                </div>
            </div>

            <form onSubmit={(event) => void submit(event)} className="shrink-0 border-t border-black/10 bg-white/72 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-black/72">
                <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-black/10 bg-[#f9f8f4] p-2 shadow-[0_12px_34px_rgba(23,21,19,.10)] dark:border-white/10 dark:bg-white/[0.06]">
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) void submit();
                        }}
                        rows={1}
                        placeholder={connected ? "让 Codex 继续做项目任务..." : "先连接电脑 Agent"}
                        className="max-h-36 min-h-10 flex-1 bg-transparent px-3 py-2 text-[16px] leading-6 outline-none placeholder:text-stone-400"
                    />
                    <button type="submit" disabled={!canSend} className="grid size-10 shrink-0 place-items-center rounded-2xl bg-stone-950 text-white transition enabled:hover:scale-[1.03] disabled:opacity-35 dark:bg-white dark:text-black" aria-label="发送">
                        {sending ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
                    </button>
                </div>
            </form>

            {settingsOpen ? (
                <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
                    <section className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-black/10 bg-[#f7f5ef] p-5 shadow-2xl sm:left-auto sm:top-0 sm:h-full sm:w-[420px] sm:rounded-none dark:border-white/10 dark:bg-[#101010]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">连接配置</h2>
                            <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:hover:text-white" onClick={() => setSettingsOpen(false)} aria-label="关闭">
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-100">
                                Agent URL 是 canvas-agent 的 HTTPS 服务地址，不是画布网页地址、New API 地址或创作 Agent API。可用 Cloudflare Tunnel、Tailscale Funnel 或 VPS 反代地址；不要把 17371 端口无鉴权裸露到公网。
                            </p>
                            <label className="block">
                                <span className="text-sm font-medium">Agent URL</span>
                                <input value={settings.agentUrl} onChange={(event) => updateSettings({ agentUrl: event.target.value })} placeholder="https://your-canvas-agent.example.com" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">填暴露 canvas-agent 的地址，不填 https://canvas.prompt-hubs.com。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Token</span>
                                <input value={settings.token} onChange={(event) => updateSettings({ token: event.target.value })} type="password" autoComplete="new-password" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">canvas-agent 启动输出的 Connect token，不是 Codex API Key。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Workspace</span>
                                <input value={settings.workspacePath} onChange={(event) => updateSettings({ workspacePath: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">可留空使用 agent 已保存的工作区；要覆盖时填运行 agent 那台机器上的项目路径。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Canvas ID</span>
                                <input value={settings.canvasId} onChange={(event) => updateSettings({ canvasId: event.target.value })} placeholder="/canvas/019f..." className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">只用于区分画布工作区。可填完整 /canvas/019...，不是 Codex 会话。</span>
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Codex Thread ID</span>
                                <input value={settings.threadId} onChange={(event) => updateSettings({ threadId: event.target.value })} placeholder="codex://threads/019f..." className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">要继续指定 Codex 会话就填这里；可填完整 codex://threads/... 或只填 ID。</span>
                            </label>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-2">
                            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium dark:border-white/10 dark:bg-white/[0.06]" onClick={() => void connect()}>
                                <PlugZap className="size-4" />
                                连接
                            </button>
                            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium dark:border-white/10 dark:bg-white/[0.06]" onClick={() => void newThread()} disabled={!connected}>
                                <RotateCcw className="size-4" />
                                新对话
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
