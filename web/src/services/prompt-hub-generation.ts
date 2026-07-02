"use client";



import { nanoid } from "nanoid";



import { imageToDataUrl } from "@/services/image-storage";

import type { ReferenceImage } from "@/types/image";

import {

    checkPromptHubStatus,

    fetchPromptHubGenerationCost,

    fetchPromptHubImageModels,

    pollPromptHubGenerationJob,

    PROMPT_HUB_DEFAULTS,

    submitPromptHubGeneration,

    type PromptHubSession,

} from "@/services/prompt-hub";



export type PromptHubCanvasImageItem = { id: string; dataUrl: string };



export type PromptHubCanvasGenerateOpts = {

    session: PromptHubSession;

    apiBase?: string;

    prompt: string;

    count?: number;

    model: string;

    resolution?: "1k" | "2k" | "4k";

    quality?: "standard" | "high" | "ultra";

    referenceImages?: ReferenceImage[];

    signal?: AbortSignal;

};



function normalizeApiBase(apiBase?: string) {

    return String(apiBase || PROMPT_HUB_DEFAULTS.apiBase).replace(/\/$/, "");

}



function formatFetchError(error: unknown, stage: string) {

    const raw = error instanceof Error ? error.message : String(error || "未知错误");

    if (/failed to fetch|networkerror|load failed/i.test(raw)) {

        return `${stage}：无法连接卡藏 API（${normalizeApiBase()}），请检查网络或稍后重试`;

    }

    return raw;

}



async function referenceImagesToRefUrls(references: ReferenceImage[]) {

    const urls: string[] = [];

    for (const image of references.slice(0, 8)) {

        const dataUrl = await imageToDataUrl(image);

        if (dataUrl) urls.push(dataUrl);

    }

    return urls;

}



function blobToDataUrl(blob: Blob) {

    return new Promise<string>((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result || ""));

        reader.onerror = () => reject(new Error("读取图片失败"));

        reader.readAsDataURL(blob);

    });

}



async function downloadImageViaImg(url: string, signal?: AbortSignal) {

    return new Promise<string>((resolve, reject) => {

        const img = new Image();

        img.crossOrigin = "anonymous";

        const cleanup = () => {

            img.onload = null;

            img.onerror = null;

            signal?.removeEventListener("abort", onAbort);

        };

        const onAbort = () => {

            cleanup();

            reject(new Error("已取消生成"));

        };

        signal?.addEventListener("abort", onAbort, { once: true });

        img.onload = () => {

            cleanup();

            try {

                const canvas = document.createElement("canvas");

                canvas.width = img.naturalWidth;

                canvas.height = img.naturalHeight;

                canvas.getContext("2d")!.drawImage(img, 0, 0);

                resolve(canvas.toDataURL("image/png"));

            } catch {

                reject(new Error("图片跨域，无法读取像素"));

            }

        };

        img.onerror = () => {

            cleanup();

            reject(new Error("加载卡藏生成图失败"));

        };

        img.src = url;

    });

}



async function downloadImageAsDataUrl(url: string, signal?: AbortSignal) {

    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {

        try {

            const res = await fetch(url, { mode: "cors", credentials: "omit", signal });

            if (!res.ok) throw new Error(`下载卡藏生成图失败 (${res.status})`);

            return await blobToDataUrl(await res.blob());

        } catch (error) {

            lastError = error;

            if (signal?.aborted) throw error;

        }

    }

    try {

        return await downloadImageViaImg(url, signal);

    } catch (error) {

        throw new Error(formatFetchError(lastError || error, "下载生成图"));

    }

}



/** 优先走鉴权代理，避免浏览器直接 fetch CDN 出现 Failed to fetch */

async function downloadJobImageAsDataUrl(

    session: PromptHubSession,

    jobId: string,

    opts: { apiBase?: string; signal?: AbortSignal; fallbackUrl?: string | null },

) {

    const apiBase = normalizeApiBase(opts.apiBase);

    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {

        try {

            const res = await fetch(`${apiBase}/api/v1/generate/jobs/${encodeURIComponent(jobId)}/image`, {

                headers: { Authorization: `Bearer ${session.access_token}` },

                signal: opts.signal,

            });

            if (!res.ok) {

                const hint = res.status === 404 ? "（图片可能尚未归档到 R2）" : "";

                throw new Error(`下载卡藏生成图失败 (${res.status})${hint}`);

            }

            return await blobToDataUrl(await res.blob());

        } catch (error) {

            lastError = error;

            if (opts.signal?.aborted) throw error;

        }

    }

    const fallback = String(opts.fallbackUrl || "").trim();

    if (fallback.startsWith("http")) {

        return downloadImageAsDataUrl(fallback, opts.signal);

    }

    throw new Error(formatFetchError(lastError, "下载生成图"));

}



async function runOnePromptHubJob(opts: PromptHubCanvasGenerateOpts, refImageUrls?: string[]) {

    const submitted = await submitPromptHubGeneration(opts.session, {

        prompt: opts.prompt,

        model: opts.model,

        resolution: opts.resolution,

        quality: opts.quality,

        refImageUrls,

        apiBase: opts.apiBase,

        signal: opts.signal,

    });

    if (!submitted?.jobId) throw new Error("卡藏未返回任务 ID");

    const job = await pollPromptHubGenerationJob(opts.session, submitted.jobId, {

        apiBase: opts.apiBase,

        signal: opts.signal,

    });

    const dataUrl = await downloadJobImageAsDataUrl(opts.session, submitted.jobId, {

        apiBase: opts.apiBase,

        signal: opts.signal,

        fallbackUrl: job.imageUrl,

    });

    return {

        items: [{ id: nanoid(), dataUrl }] satisfies PromptHubCanvasImageItem[],

        creditsRemaining: job.creditsRemaining ?? submitted.creditsRemaining,

    };

}



/** 画布生图：走卡藏 /api/v1/generate，积分在服务端扣除 */

export async function requestPromptHubCanvasImages(opts: PromptHubCanvasGenerateOpts): Promise<PromptHubCanvasImageItem[]> {

    const count = Math.max(1, Math.min(8, Math.floor(opts.count || 1)));

    const refImageUrls = opts.referenceImages?.length

        ? await referenceImagesToRefUrls(opts.referenceImages)

        : undefined;



    if (count === 1) {

        const { items } = await runOnePromptHubJob(opts, refImageUrls);

        if (!items.length) throw new Error("卡藏接口没有返回图片");

        return items;

    }



    const merged: PromptHubCanvasImageItem[] = [];

    const errors: string[] = [];

    for (let i = 0; i < count; i += 1) {

        if (opts.signal?.aborted) throw new Error("已取消生成");

        try {

            const { items } = await runOnePromptHubJob(opts, refImageUrls);

            merged.push(...items);

        } catch (error) {

            errors.push(formatFetchError(error, `第 ${i + 1} 张`));

        }

    }

    if (!merged.length) {

        throw new Error(errors.join("；") || "卡藏接口没有返回图片");

    }

    return merged.slice(0, count);

}



export async function loadPromptHubGenerationAccount(

    session: PromptHubSession,

    opts: { apiBase?: string } = {},

) {

    const [status, models] = await Promise.all([

        checkPromptHubStatus(session, opts),

        fetchPromptHubImageModels(session, opts),

    ]);

    const credits = Number(status?.data?.credits);

    const selectable = models.filter((m) => m.selectable !== false);

    return {

        credits: Number.isFinite(credits) ? credits : null,

        models: selectable,

        defaultModel: selectable[0]?.id || "gpt-image-2",

    };

}



export async function quotePromptHubGenerationCost(

    session: PromptHubSession,

    model: string,

    resolution: "1k" | "2k" | "4k" = "1k",

    opts: { apiBase?: string } = {},

) {

    const data = await fetchPromptHubGenerationCost(session, { model, resolution, apiBase: opts.apiBase });

    return Number(data?.credits ?? data?.cost ?? 0);

}

