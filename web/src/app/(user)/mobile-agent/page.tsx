"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, FolderGit2, LoaderCircle, PlugZap, RotateCcw, SendHorizontal, Settings2, TerminalSquare, Trash2, X } from "lucide-react";

type MessageRole = "user" | "assistant" | "tool" | "error" | "status";
type MobileMessage = { id: string; role: MessageRole; title?: string; text: string; streamId?: string };
type Settings = { agentUrl: string; token: string; canvasId: string; workspacePath: string };
type Workspace = { canvasId: string; workspacePath: string; activeThreadId?: string };
type AgentEvent = { type?: string; item?: Record<string, unknown>; usage?: unknown; message?: string };

const settingsKey = "kazang-mobile-codex:settings";
const messagesKey = "kazang-mobile-codex:messages";
const defaultSettings: Settings = {
    agentUrl: "http://127.0.0.1:17371",
    token: "",
    canvasId: "default",
    workspacePath: "D:\\canvas\\infinite-canvas",
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
    return value.trim().replace(/\/+$/, "");
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
    const eventSourceRef = useRef<EventSource | null>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);

    const canSend = useMemo(() => connected && Boolean(input.trim()) && !sending, [connected, input, sending]);

    useEffect(() => {
        setSettings({ ...defaultSettings, ...readJson<Partial<Settings>>(localStorage.getItem(settingsKey), {}) });
        setMessages(readJson<MobileMessage[]>(localStorage.getItem(messagesKey), []));
        return () => eventSourceRef.current?.close();
    }, []);

    useEffect(() => {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        localStorage.setItem(messagesKey, JSON.stringify(messages.slice(-120)));
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

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

    const agentFetch = async <T,>(path: string, init?: RequestInit) => {
        const response = await fetch(withToken(settings.agentUrl, path, settings.token), {
            ...init,
            headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
        });
        const payload = (await response.json().catch(() => ({}))) as T & { error?: string; msg?: string };
        if (!response.ok) throw new Error(payload.error || payload.msg || `Agent 请求失败：${response.status}`);
        return payload;
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
            upsertStreamMessage({ id: `done-${Date.now()}`, role: "status", text: "本轮完成" });
            return;
        }
        if (event.type === "error") {
            setSending(false);
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
            if (settings.workspacePath.trim()) {
                const data = await agentFetch<{ workspace?: Workspace }>("/agent/codex/workspace", {
                    method: "POST",
                    body: JSON.stringify({ canvasId: settings.canvasId.trim() || "default", workspacePath: settings.workspacePath.trim() }),
                });
                setWorkspace(data.workspace || null);
                setActiveThreadId(data.workspace?.activeThreadId || "");
            }

            const data = await agentFetch<{ workspace?: Workspace }>(`/agent/codex/workspace?canvasId=${encodeURIComponent(settings.canvasId.trim() || "default")}`);
            setWorkspace(data.workspace || null);
            setActiveThreadId(data.workspace?.activeThreadId || "");

            const source = new EventSource(withToken(settings.agentUrl, `/events?clientId=mobile-codex-${Date.now()}`, settings.token));
            eventSourceRef.current = source;
            source.addEventListener("hello", () => {
                setConnected(true);
                setConnecting(false);
                pushMessage({ id: createId(), role: "status", text: "已连接电脑 Codex" });
            });
            source.addEventListener("agent_event", (event) => {
                const data = parseEventData<AgentEvent>(event);
                if (data) handleAgentEvent(data);
            });
            source.addEventListener("agent_error", (event) => {
                const data = parseEventData<{ message?: string }>(event);
                setSending(false);
                pushMessage({ id: createId(), role: "error", title: "Agent", text: data?.message || "Agent 出错" });
            });
            source.addEventListener("agent_done", () => setSending(false));
            source.onerror = () => {
                setConnected(false);
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
                body: JSON.stringify({ canvasId: settings.canvasId.trim() || "default" }),
            });
            setWorkspace(data.workspace || workspace);
            setActiveThreadId(data.thread?.id || data.workspace?.activeThreadId || "");
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
        pushMessage({ id: createId(), role: "user", text: prompt });
        try {
            const data = await agentFetch<{ threadId?: string }>("/agent/codex/turn", {
                method: "POST",
                body: JSON.stringify({ prompt, canvasId: settings.canvasId.trim() || "default", threadId: activeThreadId || undefined }),
            });
            if (data.threadId) setActiveThreadId(data.threadId);
        } catch (error) {
            setSending(false);
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
                            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">{connected ? "已连接电脑 Agent" : "连接电脑 Agent 后开始"}</p>
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
                            <label className="block">
                                <span className="text-sm font-medium">Agent URL</span>
                                <input value={settings.agentUrl} onChange={(event) => updateSettings({ agentUrl: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Token</span>
                                <input value={settings.token} onChange={(event) => updateSettings({ token: event.target.value })} type="password" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Workspace</span>
                                <input value={settings.workspacePath} onChange={(event) => updateSettings({ workspacePath: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Canvas ID</span>
                                <input value={settings.canvasId} onChange={(event) => updateSettings({ canvasId: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
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
