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
    type LocalMediaKind,
    type LocalMediaSource,
} from "@/services/local-media-store";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

type UploadMediaOptions = {
    source?: LocalMediaSource;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();

function prefixToKind(prefix: string): LocalMediaKind {
    if (prefix.startsWith("audio")) return "audio";
    return "video";
}

export async function uploadMediaFile(input: string | Blob, prefix = "file", options: UploadMediaOptions = {}): Promise<UploadedFile> {
    const blob = await sourceToBlob(input);
    const kind = prefixToKind(prefix);
    const source = options.source ?? "generated";

    if (await shouldUseLocalMedia(kind)) {
        const saved = await writeLocalMedia(kind, blob, source);
        const meta = blob.type.startsWith("video/") ? await readVideoMeta(saved.url) : blob.type.startsWith("audio/") ? await readAudioMeta(saved.url) : {};
        return { url: saved.url, storageKey: saved.storageKey, bytes: saved.bytes, mimeType: saved.mimeType, ...meta };
    }

    const storageKey = `${prefix}:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : blob.type.startsWith("audio/") ? await readAudioMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
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

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
