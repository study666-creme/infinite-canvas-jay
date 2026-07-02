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
                const session = await loginPromptHub(email, password, { apiBase: get().apiBase });
                set({ session, email: email.trim() });
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
            partialize: (state) => ({
                apiBase: state.apiBase,
                session: state.session,
                email: state.email,
                imageModel: state.imageModel,
            }),
        },
    ),
);
