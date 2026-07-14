"use client";

import { imageToDataUrl } from "@/services/image-storage";
import type { CanvasConnection, CanvasNodeData } from "@/app/(user)/canvas/types";
import { CanvasNodeType } from "@/app/(user)/canvas/types";

export const PROMPT_HUB_DEFAULTS = {
    apiBase: "https://api.prompt-hubs.com",
    supabaseUrl: "https://api.prompt-hubs.com/supabase",
    anonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImV4cCI6MzM2MDEwMTQ5NywiaWF0IjoxNzgzMzAxNDk3LCJpc3MiOiJzdXBhYmFzZSJ9.5lXHe7E3Fef6XFqUjloawjQRbFVmyA7rmnRPf5ymEgM",
    siteUrl: "https://prompt-hubs.com/",
};

export type PromptHubSession = {
    access_token: string;
    refresh_token?: string | null;
    expires_at?: number | null;
    user?: { id?: string; email?: string | null } | null;
};

export type PromptHubSaveInput = {
    prompt?: string;
    title?: string;
    imageBase64?: string | null;
    sourceUrl?: string | null;
    tags?: string[];
    publishToCommunity?: boolean;
};

export type PromptHubCardListItem = {
    id: string;
    title: string;
    prompt: string;
    imageRef: string;
    thumbUrl: string;
    imageUrl?: string;
    sourceUrl?: string;
    hasImage?: boolean;
    tags?: string[];
    group?: string | null;
    updatedAt?: number;
};

export type PreparedPromptHubCard =
    | { kind: "image"; blob: Blob; prompt: string; title: string }
    | { kind: "text"; prompt: string; title: string; imageUnavailable?: boolean };

export type PromptHubCardListResult = {
    cards: PromptHubCardListItem[];
    total: number;
    page: number;
    limit: number;
};

export type PromptHubCardFilters = {
    apiBase?: string;
    page?: number;
    limit?: number;
    q?: string;
    group?: string;
    tag?: string;
};

export type PromptHubCatalogPricingTier = {
    when: Record<string, string | number | boolean>;
    yuan: number;
    credits: number;
};

export type PromptHubCatalogPricing = {
    mode: "fixed" | "tiered" | "token";
    unit: "request" | "second" | "image" | "token";
    yuan?: number;
    credits?: number;
    tiers?: PromptHubCatalogPricingTier[];
    quantityParameter?: string | null;
    inputMultiplier?: number;
    outputMultiplier?: number;
    completionRatio?: number;
    inputCreditsPerMillion?: number;
    outputCreditsPerMillion?: number;
};

export type PromptHubCatalogModel = {
    id: string;
    label: string;
    description?: string;
    modality: "text" | "image" | "video" | "audio";
    operation?: "chat" | "generate";
    endpoint?: { method?: string; path?: string; contentType?: string };
    catalogVersion?: string | null;
    pricingVersion?: string | null;
    parameters?: PromptHubModelParameter[];
    pricing?: PromptHubCatalogPricing;
};

export type PromptHubImageModel = PromptHubCatalogModel & {
    modality: "image";
    provider?: string;
    uiFamily?: string;
    aspectRatios?: string[];
    resolutions?: string[];
    pricingByResolution?: boolean;
    creditsByResolution?: Record<string, number> | null;
    costByResolution?: Record<string, { final?: number; listPrice?: number }> | null;
    selectable?: boolean;
    cost?: { credits?: number };
};

export type PromptHubModelParameter = {
    name: string;
    path: string;
    label?: string;
    type: "string" | "integer" | "number" | "boolean" | "array" | "object";
    required?: boolean;
    default?: unknown;
    fixed?: unknown;
    options?: unknown[];
    min?: number;
    max?: number;
    min_items?: number;
    max_items?: number;
};

export type PromptHubGenerationJob = {
    jobId: string;
    status: string;
    imageUrl?: string | null;
    extraImageUrls?: string[];
    mjGalleryUrls?: string[];
    creditsRemaining?: number;
    errorMessage?: string;
    message?: string;
};

export type PromptHubVideoJob = {
    jobId: string;
    status: "processing" | "completed" | "failed";
    model: string;
    modelLabel?: string;
    progress?: number;
    videoUrl?: string | null;
    errorMessage?: string | null;
    creditsCharged?: number;
    creditsRemaining?: number;
};

export type PromptHubChatToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
};

export type PromptHubChatMessage =
    | { role: "system" | "user"; content: string }
    | { role: "assistant"; content?: string | null; tool_calls?: PromptHubChatToolCall[] }
    | { role: "tool"; content: string; tool_call_id: string };

export type PromptHubChatResult = {
    reply: string;
    toolCalls?: PromptHubChatToolCall[];
    finishReason?: string | null;
    creditsCharged: number;
    creditsRemaining: number;
    model: string;
    modelLabel?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function compactJson(value: unknown) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    try {
        return JSON.stringify(value).slice(0, 300);
    } catch {
        return "";
    }
}

function promptHubErrorCode(payload: unknown) {
    if (!isRecord(payload)) return "";
    const error = payload.error;
    return stringField(payload.code) || (typeof payload.code === "number" ? String(payload.code) : "") || (isRecord(error) ? stringField(error.code) : stringField(error));
}

function promptHubErrorMessage(payload: unknown, status: number) {
    if (!isRecord(payload)) return `HTTP ${status}`;
    const error = payload.error;
    const details = isRecord(error) ? error.details : payload.details;
    const message = stringField(payload.message) || stringField(payload.msg) || (isRecord(error) ? stringField(error.message) : stringField(error)) || compactJson(details) || promptHubErrorCode(payload);
    return message || `HTTP ${status}`;
}

async function phAuthFetch(
    path: string,
    session: PromptHubSession,
    opts: { apiBase?: string; method?: string; body?: unknown; signal?: AbortSignal } = {},
) {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const res = await fetch(`${apiBase}${path}`, {
        method: opts.method || "GET",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        const code = promptHubErrorCode(data);
        const msg = promptHubErrorMessage(data, res.status);
        if (res.status === 402 || code === "INSUFFICIENT_CREDITS") {
            throw new Error(`积分不足：${msg}`);
        }
        throw new Error(msg);
    }
    return data;
}

function normalizeApiBase(apiBase: string) {
    return String(apiBase || PROMPT_HUB_DEFAULTS.apiBase).replace(/\/$/, "");
}

function normalizeSupabaseUrl(apiBase: string) {
    const base = normalizeApiBase(apiBase);
    if (base.includes("/supabase")) return base;
    return `${base}/supabase`;
}

function sessionExpired(session: PromptHubSession | null | undefined) {
    if (!session?.access_token) return true;
    const expMs = session.expires_at ? Number(session.expires_at) * 1000 : 0;
    return Boolean(expMs && expMs <= Date.now() + 120_000);
}

export async function loginPromptHub(email: string, password: string, opts: { apiBase?: string; anonKey?: string } = {}) {
    const supabaseUrl = normalizeSupabaseUrl(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const anonKey = opts.anonKey || PROMPT_HUB_DEFAULTS.anonKey;
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
            apikey: anonKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        const raw = String(data.error_description || data.msg || data.message || "").toLowerCase();
        if (/invalid login|invalid credentials|invalid_grant|invalid authentication/.test(raw)) {
            throw new Error("邮箱或密码不正确，请核对后重试");
        }
        throw new Error("登录失败，请检查邮箱和密码后重试");
    }
    return {
        access_token: data.access_token as string,
        refresh_token: data.refresh_token || null,
        expires_at: data.expires_at || null,
        user: data.user || null,
    } satisfies PromptHubSession;
}

export async function refreshPromptHubSession(session: PromptHubSession, opts: { apiBase?: string; anonKey?: string } = {}) {
    if (!session.refresh_token) return session;
    const supabaseUrl = normalizeSupabaseUrl(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const anonKey = opts.anonKey || PROMPT_HUB_DEFAULTS.anonKey;
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
            apikey: anonKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return session;
    return {
        access_token: data.access_token as string,
        refresh_token: data.refresh_token || session.refresh_token,
        expires_at: data.expires_at || session.expires_at || null,
        user: data.user || session.user || null,
    } satisfies PromptHubSession;
}

export async function getValidPromptHubSession(
    session: PromptHubSession | null | undefined,
    opts: { apiBase?: string; anonKey?: string } = {},
) {
    if (!session?.access_token) return null;
    if (!sessionExpired(session)) return session;
    const next = await refreshPromptHubSession(session, opts);
    return next.access_token ? next : null;
}

export async function checkPromptHubStatus(session: PromptHubSession, opts: { apiBase?: string } = {}) {
    const data = await phAuthFetch("/api/v1/extension/status", session, opts);
    return data;
}

export async function fetchPromptHubImageModels(session: PromptHubSession, opts: { apiBase?: string } = {}) {
    const data = await phAuthFetch("/api/v1/generate/models", session, opts);
    const models = Array.isArray(data.data?.models) ? (data.data.models as PromptHubImageModel[]) : [];
    return models.filter((model) => model.modality === "image" && model.selectable !== false);
}

export async function fetchPromptHubModels(session: PromptHubSession, opts: { apiBase?: string } = {}) {
    const data = await phAuthFetch("/api/v1/models", session, opts);
    const models = Array.isArray(data.data?.models) ? (data.data.models as PromptHubCatalogModel[]) : [];
    return models.filter((model) => ["text", "image", "video", "audio"].includes(model.modality));
}

export async function fetchPromptHubGenerationCost(
    session: PromptHubSession,
    params: { model: string; resolution?: string; apiBase?: string },
) {
    const apiBase = normalizeApiBase(params.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const q = new URLSearchParams({
        model: params.model,
        resolution: params.resolution || "1k",
    });
    const data = await phAuthFetch(`/api/v1/generate/cost?${q.toString()}`, session, { apiBase });
    return data.data as { credits?: number; cost?: number };
}

export async function submitPromptHubGeneration(
    session: PromptHubSession,
    payload: {
        prompt: string;
        model: string;
        resolution?: "1k" | "2k" | "4k";
        quality?: "standard" | "high" | "ultra";
        size?: string;
        count?: number;
        refImageUrls?: string[];
        apiBase?: string;
        signal?: AbortSignal;
    },
) {
    const body: Record<string, unknown> = {
        prompt: payload.prompt,
        model: payload.model,
        resolution: payload.resolution || "1k",
        quality: payload.quality || "standard",
    };
    if (payload.size) body.size = payload.size;
    if (payload.count && payload.count > 1) {
        body.count = Math.max(1, Math.min(8, Math.floor(payload.count)));
    }
    if (payload.refImageUrls?.length) {
        body.refImageUrls = payload.refImageUrls.slice(0, 14);
    }
    const data = await phAuthFetch("/api/v1/generate", session, {
        apiBase: payload.apiBase,
        method: "POST",
        body,
        signal: payload.signal,
    });
    return data.data as { jobId: string; creditsRemaining?: number; status?: string };
}

export async function submitPromptHubVideo(
    session: PromptHubSession,
    payload: {
        model: string;
        prompt: string;
        duration: number;
        ratio: string;
        resolution: string;
        referenceImages?: string[];
        referenceVideos?: string[];
        referenceAudios?: string[];
        apiBase?: string;
        signal?: AbortSignal;
    },
) {
    const data = await phAuthFetch("/api/v1/video", session, {
        apiBase: payload.apiBase,
        method: "POST",
        body: {
            model: payload.model,
            prompt: payload.prompt,
            duration: payload.duration,
            ratio: payload.ratio,
            resolution: payload.resolution,
            referenceImages: payload.referenceImages,
            referenceVideos: payload.referenceVideos,
            referenceAudios: payload.referenceAudios,
        },
        signal: payload.signal,
    });
    return data.data as PromptHubVideoJob;
}

export async function fetchPromptHubVideoJob(session: PromptHubSession, jobId: string, opts: { apiBase?: string; signal?: AbortSignal } = {}) {
    const data = await phAuthFetch(`/api/v1/video/jobs/${encodeURIComponent(jobId)}`, session, opts);
    return data.data as PromptHubVideoJob;
}

export async function downloadPromptHubVideo(session: PromptHubSession, jobId: string, opts: { apiBase?: string; signal?: AbortSignal } = {}) {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const response = await fetch(`${apiBase}/api/v1/video/jobs/${encodeURIComponent(jobId)}/content`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: opts.signal,
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(promptHubErrorMessage(payload, response.status));
    }
    return response.blob();
}

export async function submitPromptHubChat(
    session: PromptHubSession,
    payload: {
        model: string;
        messages: PromptHubChatMessage[];
        reasoningEffort?: string;
        temperature?: number;
        maxTokens?: number;
        tools?: Array<Record<string, unknown>>;
        toolChoice?: unknown;
        apiBase?: string;
        signal?: AbortSignal;
    },
) {
    const data = await phAuthFetch("/api/v1/chat", session, {
        apiBase: payload.apiBase,
        method: "POST",
        body: {
            model: payload.model,
            messages: payload.messages,
            reasoningEffort: payload.reasoningEffort,
            temperature: payload.temperature,
            maxTokens: payload.maxTokens,
            tools: payload.tools,
            toolChoice: payload.toolChoice,
            noPreset: true,
        },
        signal: payload.signal,
    });
    return data.data as PromptHubChatResult;
}

export async function pollPromptHubGenerationJob(
    session: PromptHubSession,
    jobId: string,
    opts: { apiBase?: string; signal?: AbortSignal; onPoll?: (attempt: number, job: PromptHubGenerationJob) => void } = {},
): Promise<PromptHubGenerationJob> {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    let completedWithoutUrls = 0;
    for (let i = 0; i < 90; i += 1) {
        if (opts.signal?.aborted) throw new Error("已取消生成");
        const delay = i < 2 ? 1500 : i < 8 ? 2500 : i < 20 ? 4000 : 6000;
        await new Promise((r) => setTimeout(r, delay));
        const settle = i >= 6 ? "?settle=1" : "";
        const data = await phAuthFetch(`/api/v1/generate/jobs/${encodeURIComponent(jobId)}${settle}`, session, {
            apiBase,
            signal: opts.signal,
        });
        const job = data.data as PromptHubGenerationJob;
        opts.onPoll?.(i + 1, job);
        if (job.status === "failed") {
            throw new Error(job.errorMessage || job.message || "卡藏生图失败");
        }
        const urls = collectPromptHubJobImageUrls(job);
        if (job.status === "completed" && urls.length) {
            return { ...job, imageUrl: urls[0], extraImageUrls: urls.slice(1) };
        }
        if (job.status === "completed") {
            completedWithoutUrls += 1;
            if (completedWithoutUrls >= 3) return job;
        } else {
            completedWithoutUrls = 0;
        }
    }
    throw new Error("卡藏生图超时，请到 Prompt Hub 生图页查看是否已完成");
}

export function collectPromptHubJobImageUrls(job: PromptHubGenerationJob) {
    const urls: string[] = [];
    const push = (u?: string | null) => {
        if (u && typeof u === "string" && !urls.includes(u)) urls.push(u);
    };
    push(job.imageUrl);
    (job.mjGalleryUrls || []).forEach(push);
    (job.extraImageUrls || []).forEach(push);
    return urls;
}

export async function listPromptHubCards(
    session: PromptHubSession,
    opts: PromptHubCardFilters = {},
): Promise<PromptHubCardListResult> {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const params = new URLSearchParams();
    params.set("page", String(Math.max(1, opts.page || 1)));
    params.set("limit", String(Math.min(48, Math.max(1, opts.limit || 24))));
    if (opts.q?.trim()) params.set("q", opts.q.trim());
    if (opts.group?.trim()) params.set("group", opts.group.trim());
    if (opts.tag?.trim()) params.set("tag", opts.tag.trim());
    const res = await fetch(`${apiBase}/api/v1/extension/cards?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        throw new Error(data.message || data.code || `加载卡片库失败 (${res.status})`);
    }
    const payload = data.data || {};
    return {
        cards: Array.isArray(payload.cards) ? payload.cards : [],
        total: Number(payload.total) || 0,
        page: Number(payload.page) || 1,
        limit: Number(payload.limit) || 24,
    };
}

export async function listPromptHubTags(session: PromptHubSession, opts: { apiBase?: string } = {}) {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const res = await fetch(`${apiBase}/api/v1/extension/tags`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        throw new Error(data.message || data.code || `加载标签失败 (${res.status})`);
    }
    return Array.isArray(data.data?.tags) ? (data.data.tags as string[]) : [];
}

export async function listPromptHubGroups(session: PromptHubSession, opts: { apiBase?: string } = {}) {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const res = await fetch(`${apiBase}/api/v1/extension/groups`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        throw new Error(data.message || data.code || `加载分组失败 (${res.status})`);
    }
    return Array.isArray(data.data?.groups) ? (data.data.groups as string[]) : [];
}

export async function signPromptHubImageRef(
    imageRef: string,
    session: PromptHubSession,
    opts: { apiBase?: string; variant?: "grid" | "full" } = {},
) {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const variant = opts.variant || "full";
    const params = new URLSearchParams({ ref: imageRef, variant });
    const res = await fetch(`${apiBase}/api/v1/media/sign?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.url) {
        throw new Error(data.message || data.code || `图片签名失败 (${res.status})`);
    }
    return String(data.data.url);
}

function normalizePromptHubMediaUrl(value: string, apiBase: string) {
    const raw = value.trim();
    if (!raw) return "";
    if (/^(?:https?:|blob:|data:)/i.test(raw)) return raw;
    if (raw.startsWith("/")) return new URL(raw, apiBase).toString();
    return "";
}

function cardStringField(card: PromptHubCardListItem, key: string) {
    const value = (card as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
}

function collectPromptHubCardImageCandidates(card: PromptHubCardListItem, apiBase: string) {
    const fields = [
        card.imageUrl,
        cardStringField(card, "image_url"),
        cardStringField(card, "fullUrl"),
        cardStringField(card, "full_url"),
        card.sourceUrl,
        cardStringField(card, "source_url"),
        cardStringField(card, "url"),
        card.thumbUrl,
        cardStringField(card, "thumbnailUrl"),
        cardStringField(card, "thumbnail_url"),
        card.imageRef,
    ];
    const urls: string[] = [];
    fields.forEach((field) => {
        const url = normalizePromptHubMediaUrl(String(field || ""), apiBase);
        if (url && !urls.includes(url)) urls.push(url);
    });
    return urls;
}

async function fetchPromptHubImageBlob(url: string, session: PromptHubSession) {
    if (url.startsWith("data:")) {
        const response = await fetch(url);
        return response.blob();
    }

    let directError: Error | null = null;
    try {
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (response.ok) return await response.blob();
        directError = new Error(`下载卡片图片失败 (${response.status})`);
    } catch (error) {
        directError = error instanceof Error ? error : new Error("下载卡片图片失败");
    }

    const proxyResponse = await fetch(`/api/prompt-hub-media?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (proxyResponse.ok) return proxyResponse.blob();
    throw directError || new Error(`下载卡片图片失败 (${proxyResponse.status})`);
}

export async function preparePromptHubCardForCanvas(
    card: PromptHubCardListItem,
    session: PromptHubSession,
    opts: { apiBase?: string } = {},
): Promise<PreparedPromptHubCard> {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const prompt = String(card.prompt || card.title || "").trim();
    const title = String(card.title || prompt.slice(0, 32) || "Prompt Hub 卡片").trim();
    const imageRef = String(card.imageRef || "").trim();
    const directCandidates = collectPromptHubCardImageCandidates(card, apiBase);
    const hasImage = card.hasImage !== false && (Boolean(imageRef) || directCandidates.length > 0);
    if (!hasImage) {
        if (!prompt) throw new Error("该卡片没有提示词");
        return { kind: "text", prompt, title };
    }
    const candidates: string[] = [];
    if (!normalizePromptHubMediaUrl(imageRef, apiBase)) {
        try {
            candidates.push(await signPromptHubImageRef(imageRef, session, { ...opts, variant: "full" }));
        } catch {
            // Older cards may carry a non-signable ref; the thumbnail/direct URL fallback below still works.
        }
    }
    directCandidates.forEach((url) => {
        if (!candidates.includes(url)) candidates.push(url);
    });

    for (const url of candidates) {
        try {
            const blob = await fetchPromptHubImageBlob(url, session);
            if (blob.size > 0) return { kind: "image", blob, prompt, title };
        } catch {
            // Try the next candidate.
        }
    }

    if (prompt) return { kind: "text", prompt, title, imageUnavailable: true };
    throw new Error("图片签名或下载失败");
}

export async function savePromptHubQuickCard(
    input: PromptHubSaveInput,
    session: PromptHubSession,
    opts: { apiBase?: string } = {},
) {
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const prompt = String(input.prompt || "").trim();
    const imageBase64 = input.imageBase64 || null;
    if (!prompt && !imageBase64) {
        throw new Error("请提供提示词或图片");
    }
    const res = await fetch(`${apiBase}/api/v1/extension/quick-card`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt,
            title: input.title || prompt.slice(0, 48) || "画布图片",
            imageBase64,
            sourceUrl: input.sourceUrl || null,
            tags: input.tags || ["#卡藏画布"],
            publishToCommunity: input.publishToCommunity === true,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        throw new Error(data.message || data.code || `保存失败 (${res.status})`);
    }
    return data;
}

export function canSaveImageNodeToPromptHub(node: CanvasNodeData | null | undefined) {
    return node?.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
}

export function resolveImageNodePrompt(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const direct = node.metadata?.prompt?.trim() || "";
    if (direct) return direct;
    const upstreamText = connections
        .filter((connection) => connection.toNodeId === node.id)
        .map((connection) => nodes.find((item) => item.id === connection.fromNodeId))
        .filter((item): item is CanvasNodeData => item?.type === CanvasNodeType.Text)
        .map((item) => item.metadata?.content?.trim() || "")
        .filter(Boolean);
    if (upstreamText.length) return upstreamText.join("\n\n");
    const title = node.title?.trim() || "";
    if (title && !/^图片|image$/i.test(title)) return title;
    return "";
}

export async function imageNodeToBase64(node: CanvasNodeData) {
    if (!node.metadata?.content) return "";
    const dataUrl = await imageToDataUrl({
        dataUrl: node.metadata.storageKey ? "" : node.metadata.content,
        storageKey: node.metadata.storageKey,
        url: node.metadata.content,
    });
    if (!dataUrl) return "";
    if (dataUrl.startsWith("data:")) return dataUrl;
    return dataUrl;
}
