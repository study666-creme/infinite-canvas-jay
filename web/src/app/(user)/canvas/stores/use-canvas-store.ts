import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { accountScopedStorageKey, currentPromptHubStorageKey, promptHubStorageUserKey } from "@/lib/prompt-hub-auth";
import type { PromptHubSession } from "@/services/prompt-hub";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
let canvasStorageUserKey = currentPromptHubStorageKey();
type PersistedCanvasState = Pick<CanvasStore, "projects">;
const LEGACY_DEFAULT_TITLE_RE = /^无限画布(?:\s+(\d+))?$/;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let pendingPersistPayload: string | null = null;
let persistPending = false;
let persistStatusListeners = new Set<(pending: boolean) => void>();

function normalizeCanvasProjectTitle(title: string) {
    const match = title.match(LEGACY_DEFAULT_TITLE_RE);
    return match ? `卡藏画布${match[1] ? ` ${match[1]}` : ""}` : title;
}

function normalizeCanvasProjects(projects: CanvasProject[]) {
    return projects.map((project) => {
        const title = normalizeCanvasProjectTitle(project.title);
        return title === project.title ? project : { ...project, title };
    });
}

function notifyPersistStatus(pending: boolean) {
    persistPending = pending;
    persistStatusListeners.forEach((listener) => listener(pending));
}

export function subscribeCanvasPersistStatus(listener: (pending: boolean) => void) {
    persistStatusListeners.add(listener);
    listener(persistPending);
    return () => {
        persistStatusListeners.delete(listener);
    };
}

export async function flushCanvasStore() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!pendingPersistPayload) {
        notifyPersistStatus(false);
        return;
    }
    const payload = pendingPersistPayload;
    pendingPersistPayload = null;
    await localForageStorage.setItem(canvasPersistKey(CANVAS_STORE_KEY), payload);
    notifyPersistStatus(false);
}

export async function prepareCanvasStorageForSession(session: PromptHubSession | null) {
    const nextUserKey = promptHubStorageUserKey(session);
    if (!session?.access_token || nextUserKey === "anonymous") return;
    const nextKey = accountScopedStorageKey(CANVAS_STORE_KEY, nextUserKey);
    const existing = await localForageStorage.getItem(nextKey);
    if (existing) return;
    const legacy = await localForageStorage.getItem(CANVAS_STORE_KEY);
    if (legacy) await localForageStorage.setItem(nextKey, legacy);
}

export function setCanvasStorageUserFromSession(session: PromptHubSession | null) {
    const nextUserKey = promptHubStorageUserKey(session);
    if (nextUserKey === canvasStorageUserKey) return;
    canvasStorageUserKey = nextUserKey;
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    queuedPersistState = null;
    pendingPersistPayload = null;
    notifyPersistStatus(false);
    useCanvasStore.setState({ hydrated: false, projects: [] });
    void useCanvasStore.persist.rehydrate();
}

function canvasPersistKey(name: string) {
    return accountScopedStorageKey(name, canvasStorageUserKey);
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(canvasPersistKey(name));
        if (typeof value !== "string") return null;
        try {
            const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
            queuedPersistState = parsed.state as PersistedCanvasState;
            return parsed;
        } catch {
            return null;
        }
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects) return;
        queuedPersistState = nextState;
        pendingPersistPayload = JSON.stringify(value);
        notifyPersistStatus(true);
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            const payload = pendingPersistPayload;
            pendingPersistPayload = null;
            if (!payload) {
                notifyPersistStatus(false);
                return;
            }
            void Promise.resolve(localForageStorage.setItem(canvasPersistKey(name), payload)).finally(() => notifyPersistStatus(false));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(canvasPersistKey(name)),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const projects = state.projects.filter((project) => !ids.includes(project.id));
                    return { projects };
                }),
            replaceProjects: (projects) => set({ projects }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                }) as StorageValue<CanvasStore>["state"],
            merge: (persistedState, currentState) => {
                const state = persistedState as Partial<CanvasStore> | undefined;
                return {
                    ...currentState,
                    ...state,
                    projects: normalizeCanvasProjects(state?.projects || currentState.projects),
                };
            },
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);
