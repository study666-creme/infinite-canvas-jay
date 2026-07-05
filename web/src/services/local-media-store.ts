"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

export type LocalMediaKind = "image" | "video" | "audio";
export type LocalMediaSource = "upload" | "generated";
export type LocalFolderKind = "image" | "video";

type LocalDirectoryHandle = FileSystemDirectoryHandle & {
    values: () => AsyncIterable<FileSystemHandle>;
    queryPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window &
    typeof globalThis & {
        showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<LocalDirectoryHandle>;
    };

const handleStore = localforage.createInstance({ name: "infinite-canvas", storeName: "export_folders" });
const recentStore = localforage.createInstance({ name: "infinite-canvas", storeName: "local_media_recent" });
const objectUrls = new Map<string, string>();

const LOCAL_PREFIX = "local:";

function supportsDirectoryPicker() {
    return typeof window !== "undefined" && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export function localMediaSupported() {
    return supportsDirectoryPicker();
}

function folderKindForMedia(kind: LocalMediaKind): LocalFolderKind {
    return kind === "image" ? "image" : "video";
}

export function isLocalMediaKey(storageKey?: string) {
    return Boolean(storageKey?.startsWith(LOCAL_PREFIX));
}

export function parseLocalMediaKey(storageKey: string): { kind: LocalMediaKind; filename: string } | null {
    const match = /^local:(image|video|audio):(.+)$/.exec(storageKey);
    if (!match) return null;
    return { kind: match[1] as LocalMediaKind, filename: match[2] };
}

export function buildLocalMediaKey(kind: LocalMediaKind, filename: string) {
    return `${LOCAL_PREFIX}${kind}:${filename}`;
}

export async function getFolderHandle(kind: LocalMediaKind) {
    return handleStore.getItem<LocalDirectoryHandle>(folderKindForMedia(kind));
}

export async function hasLocalMediaFolder(kind: LocalMediaKind) {
    return Boolean(await getFolderHandle(kind));
}

export async function pickLocalMediaFolder(kind: LocalFolderKind) {
    if (!supportsDirectoryPicker()) throw new Error("当前浏览器不支持选择本地文件夹，请使用 Chrome 或 Edge");
    const handle = await (window as DirectoryPickerWindow).showDirectoryPicker?.({ mode: "readwrite" });
    if (!handle) throw new Error("当前浏览器不支持选择本地文件夹，请使用 Chrome 或 Edge");
    await handleStore.setItem(kind, handle);
    return handle.name;
}

export async function getLocalMediaFolderName(kind: LocalFolderKind) {
    const handle = await handleStore.getItem<LocalDirectoryHandle>(kind);
    return handle?.name || "";
}

export type LocalFolderStats = {
    name: string;
    fileCount: number;
    sampleFiles: string[];
};

export async function getLocalFolderStats(kind: LocalFolderKind): Promise<LocalFolderStats | null> {
    const handle = await handleStore.getItem<LocalDirectoryHandle>(kind);
    if (!handle || !(await ensureWritePermission(handle))) return null;
    const recentFiles = await getRecentLocalMediaFiles(kind);
    const sampleFiles: string[] = [];
    let fileCount = 0;
    try {
        for await (const entry of handle.values()) {
            if (entry.kind !== "file") continue;
            fileCount += 1;
            if (sampleFiles.length < 8) sampleFiles.push(entry.name);
        }
    } catch {
        return { name: handle.name, fileCount: 0, sampleFiles: recentFiles.slice(0, 8) };
    }
    const mergedSamples = [...recentFiles, ...sampleFiles.filter((name) => !recentFiles.includes(name))].slice(0, 8);
    return { name: handle.name, fileCount, sampleFiles: mergedSamples };
}

export function formatLocalFolderPath(folderName: string, filename?: string) {
    const base = folderName ? `${folderName}/` : "";
    return filename ? `${base}${filename}` : base;
}

async function rememberLocalMediaFile(kind: LocalFolderKind, filename: string) {
    const key = `recent-${kind}`;
    const current = (await recentStore.getItem<string[]>(key)) || [];
    await recentStore.setItem(key, [filename, ...current.filter((item) => item !== filename)].slice(0, 12));
}

export async function getRecentLocalMediaFiles(kind: LocalFolderKind) {
    return (await recentStore.getItem<string[]>(`recent-${kind}`)) || [];
}

export async function clearLocalMediaFolder(kind: LocalFolderKind) {
    await handleStore.removeItem(kind);
    await recentStore.removeItem(`recent-${kind}`);
}

async function ensureWritePermission(handle: LocalDirectoryHandle) {
    const current = await handle.queryPermission({ mode: "readwrite" });
    if (current === "granted") return true;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function ensureLocalMediaPermission(kind: LocalMediaKind) {
    const handle = await getFolderHandle(kind);
    if (!handle) return false;
    return ensureWritePermission(handle);
}

export async function ensureAllLocalMediaPermissions() {
    await Promise.all([ensureLocalMediaPermission("image"), ensureLocalMediaPermission("video"), ensureLocalMediaPermission("audio")]);
}

function extensionFromMime(mimeType: string, kind: LocalMediaKind) {
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    return kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3";
}

function buildFilename(kind: LocalMediaKind, source: LocalMediaSource, mimeType: string) {
    return `${source}-${nanoid()}.${extensionFromMime(mimeType, kind)}`;
}

export async function writeLocalMedia(kind: LocalMediaKind, blob: Blob, source: LocalMediaSource = "generated") {
    const handle = await getFolderHandle(kind);
    if (!handle) throw new Error("尚未选择本地文件夹");
    if (!(await ensureWritePermission(handle))) throw new Error("没有文件夹读写权限");
    const filename = buildFilename(kind, source, blob.type || "");
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    await rememberLocalMediaFile(folderKindForMedia(kind), filename);
    const storageKey = buildLocalMediaKey(kind, filename);
    const cached = objectUrls.get(storageKey);
    if (cached) URL.revokeObjectURL(cached);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return { storageKey, filename, url, bytes: blob.size, mimeType: blob.type || "application/octet-stream" };
}

export async function readLocalMediaBlob(storageKey: string) {
    const parsed = parseLocalMediaKey(storageKey);
    if (!parsed) return null;
    const handle = await getFolderHandle(parsed.kind);
    if (!handle || !(await ensureWritePermission(handle))) return null;
    try {
        const fileHandle = await handle.getFileHandle(parsed.filename);
        return fileHandle.getFile();
    } catch {
        return null;
    }
}

export async function resolveLocalMediaUrl(storageKey: string) {
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await readLocalMediaBlob(storageKey);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export function revokeLocalMediaUrl(storageKey: string) {
    const cached = objectUrls.get(storageKey);
    if (cached) URL.revokeObjectURL(cached);
    objectUrls.delete(storageKey);
}

export async function sourceToBlob(source: Blob | string) {
    if (source instanceof Blob) return source;
    if (source.startsWith("data:")) {
        const match = /^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/.exec(source);
        if (!match) throw new Error("无效的图片数据");
        const mime = match[1] || "application/octet-stream";
        const body = match[2];
        if (source.includes(";base64,")) {
            const binary = atob(body);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }
            return new Blob([bytes], { type: mime });
        }
        return new Blob([decodeURIComponent(body)], { type: mime });
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error("读取文件失败");
    return response.blob();
}
