"use client";

import { create } from "zustand";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type UserStore = {
    user: LocalUser | null;
    setUser: (user: LocalUser | null) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    setUser: (user) => set({ user }),
    clearSession: () => set({ user: null }),
}));
