"use client";

import { useConfigStore } from "@/stores/use-config-store";

import { hasLocalMediaFolder, type LocalMediaKind } from "@/services/local-media-store";

export async function shouldUseLocalMedia(kind: LocalMediaKind) {
    const config = useConfigStore.getState().config;
    const enabled = kind === "image" ? config.autoExportImage : config.autoExportVideo;
    if (!enabled) return false;
    return hasLocalMediaFolder(kind);
}
