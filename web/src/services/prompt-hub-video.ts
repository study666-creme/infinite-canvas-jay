"use client";

import { nanoid } from "nanoid";

import { getMediaBlob } from "@/services/file-storage";
import { uploadPromptHubReferenceImages, type PromptHubCanvasGenerationStage } from "@/services/prompt-hub-generation";
import {
    downloadPromptHubVideo,
    fetchPromptHubVideoJob,
    PROMPT_HUB_DEFAULTS,
    submitPromptHubVideo,
    type PromptHubSession,
} from "@/services/prompt-hub";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type PromptHubVideoOptions = {
    session: PromptHubSession;
    apiBase?: string;
    model: string;
    prompt: string;
    duration: number;
    ratio: string;
    resolution: string;
    referenceImages?: ReferenceImage[];
    referenceVideos?: ReferenceVideo[];
    referenceAudios?: ReferenceAudio[];
    signal?: AbortSignal;
    onStage?: (stage: PromptHubCanvasGenerationStage) => void;
};

function apiBase(value?: string) {
    return String(value || PROMPT_HUB_DEFAULTS.apiBase).replace(/\/+$/, "");
}

function userId(session: PromptHubSession) {
    if (session.user?.id) return session.user.id;
    try {
        const payload = session.access_token.split(".")[1] || "";
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
        return String(JSON.parse(atob(normalized))?.sub || "");
    } catch {
        return "";
    }
}

function extensionForMime(mime: string) {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("quicktime")) return "mov";
    if (mime.includes("wav")) return "wav";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.startsWith("audio/")) return "m4a";
    return "mp4";
}

function waitForPollingDelay(delay: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const onAbort = () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = window.setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delay);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

async function referenceBlob(reference: ReferenceVideo | ReferenceAudio) {
    if (reference.storageKey) {
        const stored = await getMediaBlob(reference.storageKey);
        if (stored?.size) return stored;
    }
    const response = await fetch(reference.url);
    if (!response.ok) throw new Error(`读取参考素材失败 (${response.status})`);
    return response.blob();
}

async function uploadMediaReference(
    session: PromptHubSession,
    reference: ReferenceVideo | ReferenceAudio,
    kind: "video" | "audio",
    opts: { apiBase?: string; signal?: AbortSignal },
) {
    if (/^https?:\/\//i.test(reference.url) && !reference.storageKey) return reference.url;
    const uid = userId(session);
    if (!uid) throw new Error("登录信息缺少用户 ID，请重新登录");
    const blob = await referenceBlob(reference);
    if (blob.size > 50 * 1024 * 1024) throw new Error(`参考${kind === "video" ? "视频" : "音频"}超过 50MB，请压缩后重试`);
    const mime = blob.type || reference.type || (kind === "video" ? "video/mp4" : "audio/mpeg");
    const path = `${uid}/canvas/${kind}/${nanoid()}.${extensionForMime(mime)}`;
    const response = await fetch(`${apiBase(opts.apiBase)}/api/v1/media/upload?path=${encodeURIComponent(path)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": mime },
        body: blob,
        signal: opts.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || typeof payload.data?.ref !== "string") {
        throw new Error(payload.error?.message || payload.message || `上传参考素材失败 (${response.status})`);
    }
    return payload.data.ref as string;
}

export async function requestPromptHubCanvasVideo(opts: PromptHubVideoOptions) {
    opts.onStage?.({ progress: 8, stage: "准备参考素材" });
    const imageRefs = opts.referenceImages?.length
        ? await uploadPromptHubReferenceImages(opts.session, opts.referenceImages, {
              apiBase: opts.apiBase,
              signal: opts.signal,
              onStage: opts.onStage,
          })
        : [];
    const videoRefs: string[] = [];
    for (const [index, reference] of (opts.referenceVideos || []).entries()) {
        opts.onStage?.({ progress: 18 + index * 3, stage: `上传参考视频 ${index + 1}/${opts.referenceVideos?.length || 0}` });
        videoRefs.push(await uploadMediaReference(opts.session, reference, "video", opts));
    }
    const audioRefs: string[] = [];
    for (const [index, reference] of (opts.referenceAudios || []).entries()) {
        opts.onStage?.({ progress: 27 + index * 3, stage: `上传参考音频 ${index + 1}/${opts.referenceAudios?.length || 0}` });
        audioRefs.push(await uploadMediaReference(opts.session, reference, "audio", opts));
    }

    opts.onStage?.({ progress: 36, stage: "提交视频任务" });
    let job = await submitPromptHubVideo(opts.session, {
        model: opts.model,
        prompt: opts.prompt,
        duration: opts.duration,
        ratio: opts.ratio,
        resolution: opts.resolution,
        referenceImages: imageRefs,
        referenceVideos: videoRefs,
        referenceAudios: audioRefs,
        apiBase: opts.apiBase,
        signal: opts.signal,
    });
    for (let attempt = 0; attempt < 120 && job.status === "processing"; attempt += 1) {
        await waitForPollingDelay(attempt < 4 ? 2500 : 5000, opts.signal);
        job = await fetchPromptHubVideoJob(opts.session, job.jobId, { apiBase: opts.apiBase, signal: opts.signal });
        opts.onStage?.({
            progress: Math.min(92, 40 + Math.round((attempt / 120) * 52)),
            stage: job.progress ? `视频生成中 ${job.progress}%` : "视频生成中",
        });
    }
    if (job.status === "failed") throw new Error(job.errorMessage || "视频生成失败");
    if (job.status !== "completed") throw new Error("视频生成超时，请稍后重试");
    opts.onStage?.({ progress: 96, stage: "下载视频" });
    const blob = await downloadPromptHubVideo(opts.session, job.jobId, { apiBase: opts.apiBase, signal: opts.signal });
    if (!blob.size) throw new Error("视频内容为空");
    return { blob, job };
}
