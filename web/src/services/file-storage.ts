"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

import { shouldUseLocalMedia } from "@/services/local-media-policy";
import {
    isLocalMediaKey,
    parseLocalMediaKey,
    readLocalMediaBlob,
    resolveLocalMediaUrl,
    revokeLocalMediaUrl,
    sourceToBlob,
    writeLocalMedia,
    type LocalMediaSource,
} from "@/services/local-media-store";
import { validateMediaBlob } from "@/services/media-validation";

export type UploadedFile = { url: string; storageKey?: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

type UploadMediaOptions = {
    source?: LocalMediaSource;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();

function prefixToKind(prefix: string): "video" | "audio" {
    if (prefix.startsWith("audio")) return "audio";
    return "video";
}

export async function uploadMediaFile(input: string | Blob, prefix = "file", options: UploadMediaOptions = {}): Promise<UploadedFile> {
    const kind = prefixToKind(prefix);
    const validated = await validateMediaBlob(await sourceToBlob(input), kind);
    const blob = validated.blob;
    const source = options.source ?? "generated";

    if (await shouldUseLocalMedia(kind)) {
        const saved = await writeLocalMedia(kind, blob, source);
        return { url: saved.url, storageKey: saved.storageKey, bytes: saved.bytes, mimeType: saved.mimeType || validated.mimeType, width: validated.width, height: validated.height, durationMs: validated.durationMs };
    }

    const storageKey = `${prefix}:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return { url, storageKey, bytes: blob.size, mimeType: validated.mimeType, width: validated.width, height: validated.height, durationMs: validated.durationMs };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    if (isLocalMediaKey(storageKey)) return (await resolveLocalMediaUrl(storageKey)) ?? fallback;
    const kind = storageKey.startsWith("audio:") ? "audio" : "video";
    if ((storageKey.startsWith("video:") || storageKey.startsWith("audio:")) && (await shouldUseLocalMedia(kind))) {
        const blob = await store.getItem<Blob>(storageKey);
        if (blob) {
            const saved = await writeLocalMedia(kind, blob, "generated");
            await store.removeItem(storageKey);
            objectUrls.delete(storageKey);
            return saved.url;
        }
    }
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    if (isLocalMediaKey(storageKey)) return readLocalMediaBlob(storageKey);
    return store.getItem<Blob>(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    const kind = storageKey.startsWith("audio:") || storageKey.startsWith("local:audio:") ? "audio" : "video";
    const validated = await validateMediaBlob(blob, kind);
    blob = validated.blob;
    if (isLocalMediaKey(storageKey)) {
        const parsed = parseLocalMediaKey(storageKey);
        if (!parsed) throw new Error("无效的本地文件引用");
        const saved = await writeLocalMedia(parsed.kind, blob, "generated");
        return saved.url;
    }
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            if (isLocalMediaKey(key)) {
                revokeLocalMediaUrl(key);
                return;
            }
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => store.removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.includes(":") || value.storageKey.startsWith("local:"))) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}
