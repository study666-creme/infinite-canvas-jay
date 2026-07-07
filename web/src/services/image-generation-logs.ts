"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { UploadedImage } from "@/services/image-storage";

type ImageGenerationLogInput = {
    prompt: string;
    model: string;
    config: Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;
    references?: ReferenceImage[];
    images: UploadedImage[];
    durationMs?: number;
};

const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export async function appendImageGenerationLogFromCanvas(input: ImageGenerationLogInput) {
    const images = input.images.filter((image) => image?.url && image.storageKey);
    if (!images.length) return;

    const count = images.length;
    const durationMs = Math.max(0, Number(input.durationMs) || 0);
    const perImageMs = count > 0 ? durationMs / count : durationMs;
    const now = Date.now();
    const model = input.model || input.config.imageModel || input.config.model || "";
    const config = {
        model,
        imageModel: input.config.imageModel || model,
        quality: input.config.quality || "",
        size: input.config.size || "",
        count: String(count),
    };

    const log = {
        id: nanoid(),
        createdAt: now,
        title: input.prompt.slice(0, 12) || "Canvas Image",
        prompt: input.prompt,
        time: new Date(now).toLocaleString("zh-CN", { hour12: false }),
        model,
        config,
        references: (input.references || []).map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        durationMs,
        successCount: count,
        failCount: 0,
        imageCount: count,
        size: config.size,
        quality: config.quality,
        status: "\u6210\u529f",
        images: images.map((image) => ({
            id: nanoid(),
            dataUrl: "",
            storageKey: image.storageKey,
            durationMs: perImageMs,
            width: image.width,
            height: image.height,
            bytes: image.bytes,
            mimeType: image.mimeType,
        })),
        thumbnails: [],
        source: "canvas",
    };

    await logStore.setItem(log.id, log);
}
