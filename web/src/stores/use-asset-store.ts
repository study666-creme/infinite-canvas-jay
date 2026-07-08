"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { accountScopedStorageKey, currentPromptHubStorageKey, promptHubStorageUserKey } from "@/lib/prompt-hub-auth";
import { cleanupUnusedImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import type { PromptHubSession } from "@/services/prompt-hub";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

export type AssetFolder = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
};

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    folderId?: string | null;
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    folders: AssetFolder[];
    assets: Asset[];
    addFolder: (name: string) => string;
    renameFolder: (id: string, name: string) => void;
    removeFolder: (id: string) => void;
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
let assetStorageUserKey = currentPromptHubStorageKey();

export async function prepareAssetStorageForSession(session: PromptHubSession | null) {
    const nextUserKey = promptHubStorageUserKey(session);
    if (!session?.access_token || nextUserKey === "anonymous") return;
    const nextKey = accountScopedStorageKey(ASSET_STORE_KEY, nextUserKey);
    const existing = await localForageStorage.getItem(nextKey);
    if (existing) return;
    const legacy = await localForageStorage.getItem(ASSET_STORE_KEY);
    if (legacy) await localForageStorage.setItem(nextKey, legacy);
}

export function setAssetStorageUserFromSession(session: PromptHubSession | null) {
    const nextUserKey = promptHubStorageUserKey(session);
    if (nextUserKey === assetStorageUserKey) return;
    assetStorageUserKey = nextUserKey;
    useAssetStore.setState({ hydrated: false, folders: [], assets: [] });
    void useAssetStore.persist.rehydrate();
}

function assetPersistKey(name: string) {
    return accountScopedStorageKey(name, assetStorageUserKey);
}

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(assetPersistKey(name));
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.folders = parsed.state.folders || [];
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(assetPersistKey(name), JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(assetPersistKey(name)),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            folders: [],
            assets: [],
            addFolder: (name) => {
                const nextName = name.trim();
                if (!nextName) return "";
                const existing = get().folders.find((folder) => folder.name.trim().toLowerCase() === nextName.toLowerCase());
                if (existing) return existing.id;
                const now = new Date().toISOString();
                const folder = { id: nanoid(), name: nextName, createdAt: now, updatedAt: now };
                set((state) => ({ folders: [...state.folders, folder] }));
                return folder.id;
            },
            renameFolder: (id, name) =>
                set((state) => {
                    const nextName = name.trim();
                    if (!nextName || state.folders.some((folder) => folder.id !== id && folder.name.trim().toLowerCase() === nextName.toLowerCase())) return state;
                    return {
                        folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name: nextName, updatedAt: new Date().toISOString() } : folder)),
                    };
                }),
            removeFolder: (id) =>
                set((state) => ({
                    folders: state.folders.filter((folder) => folder.id !== id),
                    assets: state.assets.map((asset) => (asset.folderId === id ? { ...asset, folderId: null, updatedAt: new Date().toISOString() } : asset)),
                })),
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets, folders: state.folders }) as StorageValue<AssetStore>["state"],
            merge: (persisted, current) => ({
                ...current,
                ...(persisted as Partial<AssetStore>),
                folders: (persisted as Partial<AssetStore>)?.folders || [],
                assets: (persisted as Partial<AssetStore>)?.assets || [],
            }),
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);
