"use client";

import { imageToDataUrl } from "@/services/image-storage";
import type { CanvasConnection, CanvasNodeData } from "@/app/(user)/canvas/types";
import { CanvasNodeType } from "@/app/(user)/canvas/types";

export const PROMPT_HUB_DEFAULTS = {
    apiBase: "https://api.prompt-hubs.com",
    supabaseUrl: "https://api.prompt-hubs.com/supabase",
    anonKey: "sb_publishable_PGhXkT83iWKzx5244I9t4w_HSBITvgF",
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
    tags?: string[];
    group?: string | null;
    updatedAt?: number;
};

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
        throw new Error(data.error_description || data.msg || data.message || "登录失败，请检查邮箱和密码");
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
    const apiBase = normalizeApiBase(opts.apiBase || PROMPT_HUB_DEFAULTS.apiBase);
    const res = await fetch(`${apiBase}/api/v1/extension/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || data.code || `HTTP ${res.status}`);
    }
    return data;
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

export async function preparePromptHubCardForCanvas(
    card: PromptHubCardListItem,
    session: PromptHubSession,
    opts: { apiBase?: string } = {},
) {
    const imageUrl = await signPromptHubImageRef(card.imageRef, session, { ...opts, variant: "full" });
    const res = await fetch(imageUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("下载卡片图片失败");
    const blob = await res.blob();
    const prompt = String(card.prompt || card.title || "").trim();
    const title = String(card.title || prompt.slice(0, 32) || "Prompt Hub 卡片").trim();
    return { blob, prompt, title };
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
            tags: input.tags || ["#无限画布"],
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
