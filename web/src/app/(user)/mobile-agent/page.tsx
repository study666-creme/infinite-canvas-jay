"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, SendHorizontal, Settings2, Trash2, X } from "lucide-react";

type ChatRole = "user" | "assistant";
type ChatMessage = {
    id: string;
    role: ChatRole;
    text: string;
};

type MobileAgentSettings = {
    accessToken: string;
    apiKey: string;
    baseUrl: string;
    model: string;
};

const messagesKey = "kazang-mobile-agent:messages";
const settingsKey = "kazang-mobile-agent:settings";

const defaultSettings: MobileAgentSettings = {
    accessToken: "",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
};

function createId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toApiMessages(messages: ChatMessage[]) {
    return messages.map((message) => ({ role: message.role, content: message.text }));
}

function readJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export default function MobileAgentPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [settings, setSettings] = useState<MobileAgentSettings>(defaultSettings);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [copiedId, setCopiedId] = useState("");
    const scrollerRef = useRef<HTMLDivElement>(null);

    const canSend = useMemo(() => Boolean(input.trim()) && !sending, [input, sending]);

    useEffect(() => {
        setMessages(readJson<ChatMessage[]>(localStorage.getItem(messagesKey), []));
        setSettings({ ...defaultSettings, ...readJson<Partial<MobileAgentSettings>>(localStorage.getItem(settingsKey), {}) });
    }, []);

    useEffect(() => {
        localStorage.setItem(messagesKey, JSON.stringify(messages));
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (patch: Partial<MobileAgentSettings>) => setSettings((value) => ({ ...value, ...patch }));

    const submit = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const content = input.trim();
        if (!content || sending) return;

        const userMessage: ChatMessage = { id: createId(), role: "user", text: content };
        const assistantId = createId();
        const nextMessages = [...messages, userMessage];
        setInput("");
        setSending(true);
        setMessages([...nextMessages, { id: assistantId, role: "assistant", text: "" }]);

        try {
            const response = await fetch("/api/mobile-agent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(settings.accessToken.trim() ? { "x-mobile-agent-token": settings.accessToken.trim() } : {}),
                },
                body: JSON.stringify({
                    accessToken: settings.accessToken.trim(),
                    apiKey: settings.apiKey.trim(),
                    baseUrl: settings.baseUrl.trim(),
                    model: settings.model.trim(),
                    messages: toApiMessages(nextMessages),
                }),
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(payload?.error || `请求失败：${response.status}`);
            }
            if (!response.body) throw new Error("没有收到回复内容");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let streamed = "";
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                streamed += decoder.decode(value, { stream: true });
                setMessages((items) => items.map((item) => (item.id === assistantId ? { ...item, text: streamed } : item)));
            }
            streamed += decoder.decode();
            setMessages((items) => items.map((item) => (item.id === assistantId ? { ...item, text: streamed || "没有返回内容。" } : item)));
        } catch (error) {
            const text = error instanceof Error ? error.message : "请求失败";
            setMessages((items) => items.map((item) => (item.id === assistantId ? { ...item, text } : item)));
        } finally {
            setSending(false);
        }
    };

    const copyMessage = async (message: ChatMessage) => {
        await navigator.clipboard.writeText(message.text);
        setCopiedId(message.id);
        window.setTimeout(() => setCopiedId(""), 1200);
    };

    return (
        <main className="flex h-full flex-col bg-[#f5f3ee] text-stone-950 dark:bg-[#070707] dark:text-stone-100">
            <header className="flex shrink-0 items-center justify-between border-b border-black/10 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                <div className="min-w-0">
                    <div className="text-base font-semibold leading-6">移动对话</div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">{settings.model || "未设置模型"}</div>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => setMessages([])} aria-label="清空对话" title="清空对话">
                        <Trash2 className="size-4" />
                    </button>
                    <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white" onClick={() => setSettingsOpen(true)} aria-label="连接配置" title="连接配置">
                        <Settings2 className="size-4" />
                    </button>
                </div>
            </header>

            <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {messages.length ? (
                        messages.map((message) => (
                            <article key={message.id} className={`group flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-7 shadow-sm ${message.role === "user" ? "bg-stone-950 text-white dark:bg-white dark:text-black" : "border border-black/10 bg-white/78 text-stone-900 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.07] dark:text-stone-100"}`}>
                                    {message.text ? <div className="whitespace-pre-wrap break-words">{message.text}</div> : <LoaderCircle className="size-4 animate-spin" />}
                                    {message.role === "assistant" && message.text ? (
                                        <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400 transition hover:text-stone-700 dark:hover:text-stone-200" onClick={() => void copyMessage(message)}>
                                            {copiedId === message.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                            {copiedId === message.id ? "已复制" : "复制"}
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        ))
                    ) : (
                        <section className="flex min-h-[52vh] flex-col items-center justify-center text-center">
                            <div className="grid size-12 place-items-center rounded-2xl bg-stone-950 text-white shadow-sm dark:bg-white dark:text-black">
                                <KeyRound className="size-5" />
                            </div>
                            <h1 className="mt-5 text-2xl font-semibold">卡藏移动助手</h1>
                            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">手机发消息，直接接收文字回复。</p>
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
                        placeholder="发消息..."
                        className="max-h-36 min-h-10 flex-1 bg-transparent px-3 py-2 text-[16px] leading-6 outline-none placeholder:text-stone-400"
                    />
                    <button type="submit" disabled={!canSend} className="grid size-10 shrink-0 place-items-center rounded-2xl bg-stone-950 text-white transition enabled:hover:scale-[1.03] disabled:opacity-35 dark:bg-white dark:text-black" aria-label="发送">
                        {sending ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
                    </button>
                </div>
            </form>

            {settingsOpen ? (
                <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
                    <section className="absolute bottom-0 left-0 right-0 max-h-[86vh] overflow-y-auto rounded-t-[1.75rem] border border-black/10 bg-[#f7f5ef] p-5 shadow-2xl sm:left-auto sm:top-0 sm:h-full sm:w-[420px] sm:rounded-none dark:border-white/10 dark:bg-[#101010]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">连接配置</h2>
                            <button type="button" className="grid size-9 place-items-center text-stone-500 transition hover:text-stone-950 dark:hover:text-white" onClick={() => setSettingsOpen(false)} aria-label="关闭">
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            <label className="block">
                                <span className="text-sm font-medium">访问口令</span>
                                <input value={settings.accessToken} onChange={(event) => updateSettings({ accessToken: event.target.value })} type="password" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">API Key</span>
                                <input value={settings.apiKey} onChange={(event) => updateSettings({ apiKey: event.target.value })} type="password" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">Base URL</span>
                                <input value={settings.baseUrl} onChange={(event) => updateSettings({ baseUrl: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium">模型</span>
                                <input value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]" />
                            </label>
                        </div>
                    </section>
                </div>
            ) : null}
        </main>
    );
}
