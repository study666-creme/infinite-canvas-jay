import type { PromptHubSession } from "@/services/prompt-hub";

export const PROMPT_HUB_STORE_KEY = "infinite-canvas:prompt_hub_store";
export const ANONYMOUS_ACCOUNT_KEY = "anonymous";

type PromptHubJwtPayload = {
    sub?: string;
    email?: string;
    exp?: number;
};

export type PromptHubUserIdentity = {
    id: string;
    email: string;
    displayName: string;
};

export function promptHubUserIdentity(session: PromptHubSession | null | undefined): PromptHubUserIdentity | null {
    if (!session?.access_token) return null;
    const payload = decodePromptHubToken(session.access_token);
    const id = String(session.user?.id || payload?.sub || "").trim();
    const email = String(session.user?.email || payload?.email || "").trim();
    if (!id && !email) return null;
    const label = email || id;
    return {
        id: id || email,
        email,
        displayName: label.includes("@") ? label.split("@")[0] : label,
    };
}

export function promptHubStorageUserKey(session: PromptHubSession | null | undefined) {
    const identity = promptHubUserIdentity(session);
    if (!identity) return ANONYMOUS_ACCOUNT_KEY;
    return safeStorageSegment(identity.id || identity.email);
}

export function readPersistedPromptHubSession(): PromptHubSession | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(PROMPT_HUB_STORE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { state?: { session?: PromptHubSession | null } };
        return parsed.state?.session?.access_token ? parsed.state.session : null;
    } catch {
        return null;
    }
}

export function currentPromptHubStorageKey() {
    return promptHubStorageUserKey(readPersistedPromptHubSession());
}

export function accountScopedStorageKey(baseKey: string, userKey: string) {
    return userKey && userKey !== ANONYMOUS_ACCOUNT_KEY ? `${baseKey}:${userKey}` : baseKey;
}

export function decodePromptHubToken(token: string): PromptHubJwtPayload | null {
    const payload = token.split(".")[1];
    if (!payload) return null;
    try {
        return JSON.parse(base64UrlDecode(payload)) as PromptHubJwtPayload;
    } catch {
        return null;
    }
}

function base64UrlDecode(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    if (typeof atob === "function") {
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, "base64").toString("utf8");
}

function safeStorageSegment(value: string) {
    return encodeURIComponent(value.trim().toLowerCase()).replace(/%/g, "_").replace(/[^a-z0-9._-]/gi, "-").slice(0, 160) || ANONYMOUS_ACCOUNT_KEY;
}
