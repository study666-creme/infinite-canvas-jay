"use client";

import localforage from "localforage";

import { readImageMeta } from "@/lib/image-utils";
import {
    hasLocalMediaFolder,
    isLocalMediaKey,
    readLocalMediaBlob,
    resolveLocalMediaUrl,
    revokeLocalMediaUrl,
    sourceToBlob,
    writeLocalMedia,
    type LocalMediaSource,
} from "@/services/local-media-store";
import { shouldUseLocalMedia } from "@/services/local-media-policy";
import { nanoid } from "nanoid";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type UploadImageOptions = {
    source?: LocalMediaSource;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();

export async function uploadImage(input: string | Blob, options: UploadImageOptions = {}): Promise<UploadedImage> {
    const blob = await sourceToBlob(input);
    const source = options.source ?? "generated";

    if (await shouldUseLocalMedia("image")) {
        const saved = await writeLocalMedia("image", blob, source);
        const meta = await readImageMeta(saved.url);
        return { url: saved.url, storageKey: saved.storageKey, width: meta.width, height: meta.height, bytes: saved.bytes, mimeType: saved.mimeType || meta.mimeType };
    }

    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = await readImageMeta(url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    if (isLocalMediaKey(storageKey)) return (await resolveLocalMediaUrl(storageKey)) ?? fallback;
    if (storageKey.startsWith("image:") && (await shouldUseLocalMedia("image"))) {
        const blob = await store.getItem<Blob>(storageKey);
        if (blob) {
            const saved = await writeLocalMedia("image", blob, storageKey.includes("upload") ? "upload" : "generated");
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

export async function getImageBlob(storageKey: string) {
    if (isLocalMediaKey(storageKey)) return readLocalMediaBlob(storageKey);
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    if (isLocalMediaKey(storageKey)) {
        const saved = await writeLocalMedia("image", blob, "generated");
        return saved.url;
    }
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
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

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.startsWith("image:") || value.storageKey.startsWith("local:image:"))) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}
