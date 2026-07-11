"use client";



import { nanoid } from "nanoid";



import { getDataUrlByteSize } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";

import type { ReferenceImage } from "@/types/image";

import {
    checkPromptHubStatus,
    collectPromptHubJobImageUrls,
    fetchPromptHubGenerationCost,
    fetchPromptHubImageModels,
    fetchPromptHubModels,
    pollPromptHubGenerationJob,
    PROMPT_HUB_DEFAULTS,
    submitPromptHubGeneration,
    type PromptHubGenerationJob,
    type PromptHubSession,
} from "@/services/prompt-hub";



export type PromptHubCanvasImageItem = { id: string; dataUrl: string };



export type PromptHubCanvasGenerationStage = { progress: number; stage: string };



export type PromptHubCanvasGenerateOpts = {

    session: PromptHubSession;

    apiBase?: string;

    prompt: string;

    count?: number;

    model: string;

    resolution?: "1k" | "2k" | "4k";

    quality?: "standard" | "high" | "ultra";

    size?: string;

    referenceImages?: ReferenceImage[];

    maxReferences?: number | null;

    signal?: AbortSignal;

    onStage?: (stage: PromptHubCanvasGenerationStage) => void;

};



const REF_MAX_DATA_URL_CHARS = 5_700_000;
const REF_TARGET_BYTES = 4 * 1024 * 1024;
const REF_MAX_SIDE = 2048;

type PromptHubApiErrorPayload = {
    message?: unknown;
    msg?: unknown;
    code?: unknown;
    error?: unknown;
    details?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function compactJson(value: unknown) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    try {
        return JSON.stringify(value).slice(0, 300);
    } catch {
        return "";
    }
}

function promptHubErrorMessage(payload: PromptHubApiErrorPayload | unknown, status: number) {
    if (!isRecord(payload)) return `HTTP ${status}`;
    const error = payload.error;
    const details = isRecord(error) ? error.details : payload.details;
    const message = stringField(payload.message) || stringField(payload.msg) || (isRecord(error) ? stringField(error.message) : stringField(error)) || compactJson(details) || stringField(payload.code);
    return message || `HTTP ${status}`;
}



function loadImageElement(src: string) {

    return new Promise<HTMLImageElement>((resolve, reject) => {

        const img = new Image();

        img.onload = () => resolve(img);

        img.onerror = () => reject(new Error("参考图读取失败"));

        img.src = src;

    });

}



function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number) {

    return new Promise<string>((resolve, reject) => {

        canvas.toBlob((blob) => {

            if (!blob) {

                reject(new Error("参考图压缩失败"));

                return;

            }

            blobToDataUrl(blob).then(resolve, reject);

        }, "image/jpeg", quality);

    });

}



function refDataUrlFitsApi(dataUrl: string) {

    return dataUrl.length <= REF_MAX_DATA_URL_CHARS && getDataUrlByteSize(dataUrl) <= REF_TARGET_BYTES;

}



async function compressRefDataUrlForPromptHub(dataUrl: string) {

    if (refDataUrlFitsApi(dataUrl)) return dataUrl;

    const img = await loadImageElement(dataUrl);

    const sourceW = img.naturalWidth || img.width;

    const sourceH = img.naturalHeight || img.height;

    if (!sourceW || !sourceH) throw new Error("参考图尺寸无效");

    let maxSide = Math.min(REF_MAX_SIDE, Math.max(sourceW, sourceH));

    while (maxSide >= 960) {

        const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));

        const w = Math.max(1, Math.round(sourceW * scale));

        const h = Math.max(1, Math.round(sourceH * scale));

        const canvas = document.createElement("canvas");

        canvas.width = w;

        canvas.height = h;

        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("参考图处理失败");

        ctx.fillStyle = "#fff";

        ctx.fillRect(0, 0, w, h);

        ctx.drawImage(img, 0, 0, w, h);

        for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {

            const next = await canvasToJpegDataUrl(canvas, quality);

            if (refDataUrlFitsApi(next)) return next;

        }

        maxSide = Math.floor(maxSide * 0.78);

    }

    throw new Error("参考图过大，压缩后仍超过卡藏接口限制，请换一张较小的图");

}

function dataUrlMime(dataUrl: string) {
    return dataUrl.match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() || "image/jpeg";
}

function imageExtForMime(mime: string) {
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    return "jpg";
}

function base64UrlDecode(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
}

function promptHubUserId(session: PromptHubSession) {
    const explicit = String(session.user?.id || "").trim();
    if (explicit) return explicit;
    try {
        const payload = JSON.parse(base64UrlDecode(String(session.access_token || "").split(".")[1] || ""));
        return typeof payload?.sub === "string" ? payload.sub.trim() : "";
    } catch {
        return "";
    }
}

async function dataUrlToBlob(dataUrl: string) {
    const res = await fetch(dataUrl);
    if (!res.ok) throw new Error("参考图读取失败");
    return res.blob();
}

async function uploadPromptHubReferenceImage(session: PromptHubSession, dataUrl: string, opts: { apiBase?: string; signal?: AbortSignal }) {
    const userId = promptHubUserId(session);
    if (!userId) throw new Error("参考图上传失败：Prompt Hub 登录信息缺少用户 ID，请重新登录 Prompt Hub");

    const apiBase = normalizeApiBase(opts.apiBase);
    const mime = dataUrlMime(dataUrl);
    const ext = imageExtForMime(mime);
    const blob = await dataUrlToBlob(dataUrl);
    const path = `${userId}/imagegen/canvas/${nanoid()}.${ext}`;
    const uploadUrl = `${apiBase}/api/v1/media/upload?path=${encodeURIComponent(path)}`;
    const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": mime,
        },
        body: blob,
        signal: opts.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        const message = promptHubErrorMessage(data, res.status);
        throw new Error(`参考图上传失败：${message}`);
    }
    const ref = data?.data?.ref;
    if (typeof ref !== "string" || !ref.trim()) throw new Error("参考图上传失败：Prompt Hub 未返回图片引用");
    return ref.trim();
}



async function referenceImagesToRefUrls(session: PromptHubSession, references: ReferenceImage[], opts: { apiBase?: string; signal?: AbortSignal; onStage?: (stage: PromptHubCanvasGenerationStage) => void }) {

    const urls: string[] = [];
    const selectedReferences = references.slice(0, 8);

    for (let index = 0; index < selectedReferences.length; index += 1) {
        const image = selectedReferences[index];
        opts.onStage?.({ progress: 12 + Math.round((index / Math.max(selectedReferences.length, 1)) * 14), stage: `上传参考图 ${index + 1}/${selectedReferences.length}` });

        const dataUrl = await imageToDataUrl(image);

        if (dataUrl) {
            const compressed = await compressRefDataUrlForPromptHub(dataUrl);
            urls.push(await uploadPromptHubReferenceImage(session, compressed, opts));
            opts.onStage?.({ progress: 12 + Math.round(((index + 1) / Math.max(selectedReferences.length, 1)) * 14), stage: `参考图已上传 ${urls.length}/${selectedReferences.length}` });
        }

    }

    if (selectedReferences.length && !urls.length) {
        throw new Error("参考图上传失败：没有读到可上传的图片，请检查连接的图片节点是否仍存在");
    }

    return urls;

}

export async function uploadPromptHubReferenceImages(
    session: PromptHubSession,
    references: ReferenceImage[],
    opts: { apiBase?: string; signal?: AbortSignal; onStage?: (stage: PromptHubCanvasGenerationStage) => void } = {},
) {
    return referenceImagesToRefUrls(session, references, opts);
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



async function downloadJobImageByIndex(
    session: PromptHubSession,
    jobId: string,
    index: number,
    opts: { apiBase?: string; signal?: AbortSignal; fallbackUrl?: string | null },
) {
    const apiBase = normalizeApiBase(opts.apiBase);
    const suffix = index > 0 ? `?index=${index}` : "";
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const res = await fetch(`${apiBase}/api/v1/generate/jobs/${encodeURIComponent(jobId)}/image${suffix}`, {
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
    throw new Error(formatFetchError(lastError, `下载第 ${index + 1} 张`));
}

async function downloadAllJobImages(
    session: PromptHubSession,
    jobId: string,
    job: PromptHubGenerationJob,
    opts: { apiBase?: string; signal?: AbortSignal; onStage?: (stage: PromptHubCanvasGenerationStage) => void },
) {
    const urls = collectPromptHubJobImageUrls(job);
    if (!urls.length) throw new Error("卡藏接口没有返回图片");

    const items: PromptHubCanvasImageItem[] = [];
    const errors: string[] = [];
    for (let index = 0; index < urls.length; index += 1) {
        if (opts.signal?.aborted) throw new Error("已取消生成");
        opts.onStage?.({ progress: Math.min(94, 84 + Math.round((index / Math.max(urls.length, 1)) * 10)), stage: `下载结果 ${index + 1}/${urls.length}` });
        try {
            const dataUrl = await downloadJobImageByIndex(session, jobId, index, {
                apiBase: opts.apiBase,
                signal: opts.signal,
                fallbackUrl: urls[index],
            });
            items.push({ id: nanoid(), dataUrl });
            opts.onStage?.({ progress: Math.min(96, 84 + Math.round(((index + 1) / Math.max(urls.length, 1)) * 10)), stage: `结果已下载 ${items.length}/${urls.length}` });
        } catch (error) {
            errors.push(formatFetchError(error, `第 ${index + 1} 张`));
        }
    }
    if (!items.length) {
        throw new Error(errors.join("；") || "卡藏接口没有返回图片");
    }
    return items;
}

async function runOnePromptHubJob(opts: PromptHubCanvasGenerateOpts, refImageUrls?: string[], jobCount = 1) {
    opts.onStage?.({ progress: 30, stage: refImageUrls?.length ? "提交参考图生成任务" : "提交生成任务" });
    const submitted = await submitPromptHubGeneration(opts.session, {
        prompt: opts.prompt,
        model: opts.model,
        resolution: opts.resolution,
        quality: opts.quality,
        size: opts.size,
        count: jobCount > 1 ? jobCount : undefined,
        refImageUrls,
        apiBase: opts.apiBase,
        signal: opts.signal,
    });
    if (!submitted?.jobId) throw new Error("卡藏未返回任务 ID");
    opts.onStage?.({ progress: 36, stage: "任务已提交，等待结果" });
    const job = await pollPromptHubGenerationJob(opts.session, submitted.jobId, {
        apiBase: opts.apiBase,
        signal: opts.signal,
        onPoll: (attempt, currentJob) => {
            const statusText = currentJob?.status === "completed" ? "生成已完成" : currentJob?.status === "failed" ? "生成失败" : "生成中";
            opts.onStage?.({ progress: Math.min(82, 38 + attempt * 2), stage: statusText });
        },
    });
    opts.onStage?.({ progress: 84, stage: "下载生成结果" });
    const items = await downloadAllJobImages(opts.session, submitted.jobId, job, {
        apiBase: opts.apiBase,
        signal: opts.signal,
        onStage: opts.onStage,
    });
    return {
        items,
        creditsRemaining: job.creditsRemaining ?? submitted.creditsRemaining,
    };
}

/** 画布生图：走卡藏 /api/v1/generate，积分在服务端扣除 */
export async function requestPromptHubCanvasImages(opts: PromptHubCanvasGenerateOpts): Promise<PromptHubCanvasImageItem[]> {
    const count = Math.max(1, Math.min(8, Math.floor(opts.count || 1)));
    opts.onStage?.({ progress: 8, stage: opts.referenceImages?.length ? "准备参考图" : "准备提交任务" });
    const references = typeof opts.maxReferences === "number"
        ? (opts.referenceImages || []).slice(0, Math.max(0, opts.maxReferences))
        : opts.referenceImages;
    const refImageUrls = references?.length
        ? await referenceImagesToRefUrls(opts.session, references, { apiBase: opts.apiBase, signal: opts.signal, onStage: opts.onStage })
        : undefined;

    if (count === 1) {
        const { items } = await runOnePromptHubJob(opts, refImageUrls);
        if (!items.length) throw new Error("卡藏接口没有返回图片");
        return items;
    }

    const merged: PromptHubCanvasImageItem[] = [];
    const errors: string[] = [];

    try {
        const batch = await runOnePromptHubJob(opts, refImageUrls, count);
        merged.push(...batch.items);
    } catch (error) {
        errors.push(formatFetchError(error, "批量生成"));
    }

    while (merged.length < count) {
        if (opts.signal?.aborted) throw new Error("已取消生成");
        if (errors.length >= count && merged.length === 0) break;
        if (errors.length >= count * 2) break;
        try {
            const { items } = await runOnePromptHubJob(opts, refImageUrls);
            if (!items.length) {
                errors.push("接口返回空结果");
                continue;
            }
            merged.push(...items);
        } catch (error) {
            errors.push(formatFetchError(error, `第 ${merged.length + 1} 张`));
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

    const [status, imageModels, models] = await Promise.all([

        checkPromptHubStatus(session, opts),

        fetchPromptHubImageModels(session, opts),

        fetchPromptHubModels(session, opts).catch(() => []),

    ]);

    const credits = Number(status?.data?.credits);

    const selectable = imageModels.filter((model) => model.selectable !== false && model.uiFamily !== "midjourney");

    return {

        credits: Number.isFinite(credits) ? credits : null,

        models: selectable,

        catalogModels: models,

        defaultModel: selectable.find((model) => model.id === "image2")?.id || selectable[0]?.id || "image2",

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

