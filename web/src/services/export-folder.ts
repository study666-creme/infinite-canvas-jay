"use client";

import type { AiConfig } from "@/stores/use-config-store";
import {
    clearLocalMediaFolder,
    formatLocalFolderPath,
    getLocalFolderStats,
    getLocalMediaFolderName,
    hasLocalMediaFolder,
    localMediaSupported,
    pickLocalMediaFolder,
    sourceToBlob,
    writeLocalMedia,
    type LocalFolderKind,
    type LocalMediaKind,
    type LocalMediaSource,
} from "@/services/local-media-store";

export type { LocalFolderKind, LocalFolderStats } from "@/services/local-media-store";

export function exportFolderSupported() {
    return localMediaSupported();
}

export async function pickExportFolder(kind: LocalFolderKind) {
    return pickLocalMediaFolder(kind);
}

export async function getExportFolderName(kind: LocalFolderKind) {
    return getLocalMediaFolderName(kind);
}

export async function clearExportFolder(kind: LocalFolderKind) {
    await clearLocalMediaFolder(kind);
}

export async function getExportFolderStats(kind: LocalFolderKind) {
    return getLocalFolderStats(kind);
}

export async function hasExportFolder(kind: LocalMediaKind) {
    return hasLocalMediaFolder(kind);
}

/** @deprecated Generation/upload now writes to local folder directly via uploadImage/uploadMediaFile */
export async function autoExportGeneratedMedia(kind: "image" | "video", source: Blob | string, config: Pick<AiConfig, "autoExportImage" | "autoExportVideo">, mimeType?: string) {
    const enabled = kind === "image" ? config.autoExportImage : config.autoExportVideo;
    if (!enabled || !(await hasLocalMediaFolder(kind))) return false;
    const blob = await sourceToBlob(source);
    await writeLocalMedia(kind, blob.type ? blob : new Blob([blob], { type: mimeType || blob.type }), "generated");
    return true;
}
