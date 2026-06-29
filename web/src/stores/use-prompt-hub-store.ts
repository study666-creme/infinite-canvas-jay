"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
    PROMPT_HUB_DEFAULTS,
    checkPromptHubStatus,
    getValidPromptHubSession,
    loginPromptHub,
    type PromptHubSession,
} from "@/services/prompt-hub";

type PromptHubStore = {
    apiBase: string;
    session: PromptHubSession | null;
    email: string;
    setApiBase: (apiBase: string) => void;
    setEmail: (email: string) => void;
    setSession: (session: PromptHubSession | null) => void;
    login: (email: string, password: string) => Promise<PromptHubSession>;
    logout: () => void;
    getSession: () => Promise<PromptHubSession | null>;
    verifySession: () => Promise<boolean>;
};

export const usePromptHubStore = create<PromptHubStore>()(
    persist(
        (set, get) => ({
            apiBase: PROMPT_HUB_DEFAULTS.apiBase,
            session: null,
            email: "",
            setApiBase: (apiBase) => set({ apiBase: apiBase.trim() || PROMPT_HUB_DEFAULTS.apiBase }),
            setEmail: (email) => set({ email }),
            setSession: (session) => set({ session }),
            login: async (email, password) => {
                const session = await loginPromptHub(email, password, { apiBase: get().apiBase });
                set({ session, email: email.trim() });
                return session;
            },
            logout: () => set({ session: null }),
            getSession: async () => {
                const { session, apiBase } = get();
                if (!session?.access_token) return null;
                const next = await getValidPromptHubSession(session, { apiBase });
                if (!next) {
                    set({ session: null });
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
                    set({ session: null });
                    return false;
                }
            },
        }),
        {
            name: "infinite-canvas:prompt_hub_store",
            partialize: (state) => ({
                apiBase: state.apiBase,
                session: state.session,
                email: state.email,
            }),
        },
    ),
);
