"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
    PROMPT_HUB_DEFAULTS,
    checkPromptHubStatus,
    getValidPromptHubSession,
    loginPromptHub,
    type PromptHubImageModel,
    type PromptHubSession,
} from "@/services/prompt-hub";
import { loadPromptHubGenerationAccount } from "@/services/prompt-hub-generation";

type PromptHubStore = {
    apiBase: string;
    session: PromptHubSession | null;
    email: string;
    credits: number | null;
    imageModel: string;
    imageModels: PromptHubImageModel[];
    setApiBase: (apiBase: string) => void;
    setEmail: (email: string) => void;
    setSession: (session: PromptHubSession | null) => void;
    setImageModel: (model: string) => void;
    login: (email: string, password: string) => Promise<PromptHubSession>;
    logout: () => void;
    getSession: () => Promise<PromptHubSession | null>;
    verifySession: () => Promise<boolean>;
    refreshGenerationAccount: () => Promise<void>;
};

function normalizePromptHubApiBase(value: string) {
    const fallback = PROMPT_HUB_DEFAULTS.apiBase;
    const raw = String(value || "").trim();
    if (!raw) return fallback;

    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        const hostname = url.hostname.toLowerCase();
        if (
            hostname === "prompt-hubs.com"
            || hostname === "www.prompt-hubs.com"
            || hostname === "canvas.prompt-hubs.com"
            || hostname === "infinite-canvas-jay.vercel.app"
            || (hostname.endsWith(".vercel.app") && hostname.startsWith("prompt-canvas"))
        ) {
            return fallback;
        }

        const pathname = url.pathname.replace(/\/+$/, "").replace(/\/supabase$/i, "");
        return `${url.origin}${pathname}`;
    } catch {
        return fallback;
    }
}

export const usePromptHubStore = create<PromptHubStore>()(
    persist(
        (set, get) => ({
            apiBase: PROMPT_HUB_DEFAULTS.apiBase,
            session: null,
            email: "",
            credits: null,
            imageModel: "gpt-image-2",
            imageModels: [],
            setApiBase: (apiBase) => set({ apiBase: apiBase.trim() || PROMPT_HUB_DEFAULTS.apiBase }),
            setEmail: (email) => set({ email }),
            setSession: (session) => set({ session }),
            setImageModel: (imageModel) => set({ imageModel: imageModel.trim() || "gpt-image-2" }),
            login: async (email, password) => {
                const configuredApiBase = normalizePromptHubApiBase(get().apiBase);
                let activeApiBase = configuredApiBase;
                let session: PromptHubSession;
                try {
                    session = await loginPromptHub(email, password, { apiBase: configuredApiBase });
                } catch (error) {
                    if (configuredApiBase === PROMPT_HUB_DEFAULTS.apiBase) throw error;
                    activeApiBase = PROMPT_HUB_DEFAULTS.apiBase;
                    session = await loginPromptHub(email, password, { apiBase: activeApiBase });
                }
                set({ session, email: email.trim(), apiBase: activeApiBase });
                await get().refreshGenerationAccount();
                return session;
            },
            logout: () => set({ session: null, credits: null, imageModels: [] }),
            getSession: async () => {
                const { session, apiBase } = get();
                if (!session?.access_token) return null;
                const next = await getValidPromptHubSession(session, { apiBase });
                if (!next) {
                    set({ session: null, credits: null, imageModels: [] });
                    return null;
                }
                if (next.access_token !== session.access_token) set({ session: next });
                return next;
            },
            verifySession: async () => {
                const session = await get().getSession();
                if (!session) return false;
                try {
                    await checkPromptHubStatus(session, { apiBase: get().apiBase });
                    return true;
                } catch {
                    set({ session: null, credits: null, imageModels: [] });
                    return false;
                }
            },
            refreshGenerationAccount: async () => {
                const session = await get().getSession();
                if (!session) return;
                try {
                    const account = await loadPromptHubGenerationAccount(session, { apiBase: get().apiBase });
                    const current = get().imageModel;
                    const hasCurrent = account.models.some((m) => m.id === current);
                    set({
                        credits: account.credits,
                        imageModels: account.models,
                        imageModel: hasCurrent ? current : account.defaultModel,
                    });
                } catch {
                    /* ignore */
                }
            },
        }),
        {
            name: "infinite-canvas:prompt_hub_store",
            merge: (persisted, current) => {
                const stored = (persisted || {}) as Partial<PromptHubStore>;
                return {
                    ...current,
                    ...stored,
                    apiBase: normalizePromptHubApiBase(stored.apiBase || current.apiBase),
                };
            },
            partialize: (state) => ({
                apiBase: state.apiBase,
                session: state.session,
                email: state.email,
                imageModel: state.imageModel,
            }),
        },
    ),
);
