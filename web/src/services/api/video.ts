import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { deleteStoredMedia, getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { buildApiUrl, modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id?: string; request_id?: string; task_id?: string; status?: string; state?: string; error?: { message?: string } | string | null; video?: { url?: string } | null; url?: string; video_url?: string; output?: unknown; result?: unknown; data?: unknown; content?: unknown };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type XaiVideoTask = {
    request_id?: string;
    id?: string;
    status?: string;
    error?: { code?: string; message?: string } | string | null;
    video?: { url?: string; duration?: number } | null;
    progress?: number;
};
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type RequestOptions = { signal?: AbortSignal; onProgress?: (progress: VideoGenerationProgress) => void };

const VIDEO_REQUEST_TIMEOUT_MS = 300_000;

export type VideoGenerationProgress = {
    phase: "creating" | "queued" | "processing" | "downloading";
    percent: number;
    message: string;
};

export type VideoGenerationProvider = "openai" | "seedance" | "xai";
export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string; taskId?: string; provider?: VideoGenerationProvider; model?: string };
export type VideoGenerationTask = { id: string; provider: VideoGenerationProvider; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };
type VideoGenerationStart = { status: "task"; task: VideoGenerationTask } | { status: "completed"; result: VideoGenerationResult };

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    options?.onProgress?.({ phase: "creating", percent: 6, message: "提交任务" });
    const started = await createVideoGenerationStart(config, prompt, references, videoReferences, audioReferences, options);
    if (started.status === "completed") {
        options?.onProgress?.({ phase: "downloading", percent: 96, message: "保存视频" });
        return started.result;
    }
    const task = started.task;
    options?.onProgress?.({ phase: "queued", percent: 12, message: "排队中" });
    const delayMs = task.provider === "seedance" ? 5000 : 2500;
    const maxAttempts = 120;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") {
            options?.onProgress?.({ phase: "downloading", percent: 96, message: "保存视频" });
            return state.result;
        }
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === maxAttempts - 1) throw new Error(`${task.provider === "seedance" ? "Seedance " : ""}视频生成超时，请稍后重试`);
        const percent = Math.min(92, 12 + Math.round(((attempt + 1) / maxAttempts) * 80));
        options?.onProgress?.({ phase: "processing", percent, message: task.provider === "seedance" ? "Seedance 生成中" : "视频生成中" });
        await delay(delayMs, options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const started = await createVideoGenerationStart(config, prompt, references, videoReferences, audioReferences, options);
    if (started.status === "task") return started.task;
    if (started.result.taskId && started.result.provider && started.result.model) {
        return { id: started.result.taskId, provider: started.result.provider, model: started.result.model };
    }
    throw new Error("视频接口直接返回了视频结果，但没有返回可轮询任务 ID");
}

async function createVideoGenerationStart(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationStart> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (isSeedanceVideoConfig(requestConfig)) {
        return { status: "task", task: await createSeedanceTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options) };
    }
    if (isXaiVideoModel(selectedModel) && isOfficialXaiBaseUrl(requestConfig.baseUrl)) {
        if (videoReferences.length || audioReferences.length) {
            throw new Error("Grok Imagine 视频接口暂不支持画布参考视频或参考音频，请移除参考素材");
        }
        return { status: "task", task: await createXaiVideoTask(requestConfig, selectedModel, prompt, references, options) };
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考素材");
    }
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "seedance") return pollSeedanceTask(requestConfig, task, options);
    if (task.provider === "xai") return pollXaiVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
}

export async function storeGeneratedVideo(result: VideoGenerationResult, config?: AiConfig): Promise<UploadedFile> {
    const mimeType = result.mimeType || "video/mp4";

    if (result.blob?.size) {
        return uploadMediaFile(normalizeVideoBlob(result.blob, mimeType), "video");
    }

    if (config?.baseUrl.trim() && config.apiKey.trim()) {
        if (result.taskId && result.provider && result.model) {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    const blob = normalizeVideoBlob(await downloadTaskContentBlob(config, { id: result.taskId, provider: result.provider, model: result.model }), mimeType);
                    if (blob.size) return uploadMediaFile(blob, "video");
                } catch {
                    if (attempt === 2) break;
                    await delay(1200);
                }
            }
        }

        if (result.url) {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    const blob = normalizeVideoBlob(await downloadRemoteVideoBlob(config, result.url), mimeType);
                    if (blob.size) return uploadMediaFile(blob, "video");
                } catch {
                    if (attempt === 2) break;
                    await delay(1200);
                }
            }
        }
    }

    if (result.url) {
        return { url: result.url, storageKey: "", bytes: 0, mimeType, width: 1280, height: 720 };
    }

    throw new Error("视频接口没有返回可播放的视频");
}

export type VideoPlaybackResult = { kind: "url"; url: string } | { kind: "file"; url: string; file: UploadedFile } | { kind: "error"; message: string };

export type VideoPlaybackInput = {
    config: AiConfig;
    content?: string;
    storageKey?: string;
    mimeType?: string;
    taskId?: string;
    provider?: VideoGenerationProvider;
    model?: string;
    ignoreStorageKey?: boolean;
};

async function isPlayableMediaUrl(url: string) {
    if (!url.startsWith("blob:") && !url.startsWith("data:")) return true;
    try {
        const response = await fetch(url);
        if (!response.ok) return false;
        const blob = await response.blob();
        return blob.size > 0;
    } catch {
        return false;
    }
}

export async function resolveVideoPlayback(input: VideoPlaybackInput): Promise<VideoPlaybackResult> {
    const { config, content = "", storageKey, mimeType = "video/mp4", taskId, provider, model, ignoreStorageKey = false } = input;
    const requestConfig = model ? resolveModelRequestConfig(config, model) : config;
    const hasApi = Boolean(requestConfig.baseUrl.trim() && requestConfig.apiKey.trim());

    if (storageKey && !ignoreStorageKey) {
        const blob = await getMediaBlob(storageKey);
        if (blob?.size) {
            if (await looksLikeVideoBlob(blob)) {
                return { kind: "url", url: URL.createObjectURL(normalizeVideoBlob(blob, mimeType)) };
            }
            await deleteStoredMedia([storageKey]);
        } else {
            const resolved = await resolveMediaUrl(storageKey, "");
            if (resolved && !/^https?:\/\//i.test(resolved)) {
                return { kind: "url", url: resolved };
            }
        }
    }

    if (content.startsWith("blob:") || content.startsWith("data:")) {
        if (content.startsWith("data:") && hasApi) {
            try {
                const file = await uploadMediaFile(normalizeVideoBlob(await blobFromDataUrl(content), mimeType), "video");
                return { kind: "file", url: file.url, file };
            } catch {
                if (await isPlayableMediaUrl(content)) {
                    return { kind: "url", url: content };
                }
            }
        }
        if (await isPlayableMediaUrl(content)) {
            return { kind: "url", url: content };
        }
        if (taskId && provider && model && hasApi) {
            try {
                const blob = normalizeVideoBlob(await downloadTaskContentBlob(requestConfig, { id: taskId, provider, model }), mimeType);
                const file = await uploadMediaFile(blob, "video");
                return { kind: "file", url: file.url, file };
            } catch {
                // Fall through.
            }
        }
        return { kind: "error", message: "视频缓存已失效，请重新上传或生成视频后再选帧" };
    }

    if (taskId && provider && model && hasApi) {
        try {
            const blob = normalizeVideoBlob(await downloadTaskContentBlob(requestConfig, { id: taskId, provider, model }), mimeType);
            const file = await uploadMediaFile(blob, "video");
            return { kind: "file", url: file.url, file };
        } catch {
            // Fall through to remote URL proxy.
        }
    }

    if (/^https?:\/\//i.test(content) && hasApi) {
        try {
            const blob = normalizeVideoBlob(await downloadRemoteVideoBlob(requestConfig, content), mimeType);
            const file = await uploadMediaFile(blob, "video");
            return { kind: "file", url: file.url, file };
        } catch (error) {
            const message = error instanceof Error ? error.message : "视频代理下载失败";
            if (/404|405|not found|not allowed/i.test(message)) {
                return { kind: "url", url: content };
            }
            if (/failed to fetch|network error/i.test(message)) {
                return { kind: "error", message: "无法连接视频网关，请确认 Base URL 在本机可访问（127.0.0.1 仅在本机浏览器有效）" };
            }
            return { kind: "error", message };
        }
    }

    if (content) {
        return { kind: "error", message: "无法播放远程视频，请检查 API 配置或重启 jimeng 服务" };
    }

    return { kind: "error", message: "没有可播放的视频地址" };
}

function normalizeVideoBlob(blob: Blob, mimeType = "video/mp4") {
    if (!blob.size) return blob;
    if (!blob.type || blob.type === "application/octet-stream" || blob.type.includes("json")) {
        return new Blob([blob], { type: mimeType.includes("video") ? mimeType : "video/mp4" });
    }
    return blob;
}

async function blobFromDataUrl(dataUrl: string) {
    const response = await fetch(dataUrl);
    return response.blob();
}

export async function downloadTaskContentBlob(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions) {
    if (task.provider === "xai") {
        const state = await pollXaiVideoTask(config, task, options);
        if (state.status !== "completed" || !state.result.url) throw new Error("Grok 视频任务尚未返回可下载地址");
        return downloadRemoteVideoBlob(config, state.result.url, options);
    }
    const url = task.provider === "seedance" ? seedanceContentApiUrl(config, task.id) : aiApiUrl(config, `/videos/${task.id}/content`);
    const response = await axios.get<Blob>(url, { headers: aiHeaders(config), responseType: "blob", signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS });
    await assertVideoBlob(response.data);
    if (!response.data.size) throw new Error("视频内容为空，请稍后重试");
    return response.data;
}

export async function downloadRemoteVideoBlob(config: AiConfig, remoteUrl: string, options?: RequestOptions) {
    const response = await axios.get<Blob>(buildApiUrl(config.baseUrl, `/media/fetch?url=${encodeURIComponent(remoteUrl)}`), {
        headers: aiHeaders(config),
        responseType: "blob",
        signal: options?.signal,
        timeout: VIDEO_REQUEST_TIMEOUT_MS,
    });
    await assertVideoBlob(response.data);
    if (!response.data.size) throw new Error("远程视频内容为空");
    return response.data;
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationStart> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS })).data);
        const id = extractVideoId(created);
        const status = extractVideoStatus(created);
        const url = extractVideoUrl(created);
        if (url && (!id || !status || isVideoSuccessStatus(status))) {
            return { status: "completed", result: { url, taskId: id, provider: "openai", model, mimeType: "video/mp4" } };
        }
        if (id) return { status: "task", task: { id, provider: "openai", model } };
        throw new Error("视频接口没有返回任务 ID 或视频 URL");
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function createXaiVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const payload: Record<string, unknown> = {
        model: modelOptionName(model),
        prompt,
        duration: normalizeXaiVideoDuration(config.videoSeconds),
        aspect_ratio: normalizeXaiAspectRatio(config.size),
        resolution: normalizeXaiResolution(config.vquality, model),
    };
    const firstReference = references[0];
    if (firstReference) {
        payload.image = { url: await imageToDataUrl(firstReference) };
    }
    try {
        const created = unwrapXaiVideoTask((await axios.post<ApiEnvelope<XaiVideoTask>>(aiApiUrl(config, "/videos/generations"), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS })).data);
        const id = created.request_id || created.id;
        if (!id) throw new Error("Grok 视频接口没有返回 request_id");
        return { id, provider: "xai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Grok 视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS })).data);
        const status = extractVideoStatus(video);
        if (isVideoSuccessStatus(status)) {
            const url = extractVideoUrl(video);
            return { status: "completed", result: { url, taskId: task.id, provider: task.provider, model: task.model, mimeType: "video/mp4" } };
        }
        if (status === "failed" || status === "cancelled" || status === "expired") return { status: "failed", error: videoTaskError(video) || "视频生成失败" };
        const url = extractVideoUrl(video);
        if (url && !status) return { status: "completed", result: { url, taskId: task.id, provider: task.provider, model: task.model, mimeType: "video/mp4" } };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function pollXaiVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapXaiVideoTask((await axios.get<ApiEnvelope<XaiVideoTask>>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS })).data);
        const status = String(state.status || "").toLowerCase();
        if (isVideoSuccessStatus(status)) {
            const url = extractVideoUrl(state);
            if (!url) return { status: "failed", error: "Grok 视频任务完成但没有返回视频 URL" };
            return { status: "completed", result: { url, taskId: task.id, provider: task.provider, model: task.model, mimeType: "video/mp4" } };
        }
        if (status === "failed" || status === "cancelled" || status === "expired") return { status: "failed", error: xaiTaskError(state) || `Grok 视频生成${status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Grok 视频任务查询失败"));
    }
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model: modelOptionName(model),
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, modelOptionName(model)),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal, timeout: VIDEO_REQUEST_TIMEOUT_MS })).data);
        if (state.status === "succeeded") {
            const url = state.content?.video_url;
            if (!url) return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
            return {
                status: "completed",
                result: { url, taskId: task.id, provider: task.provider, model: task.model, mimeType: "video/mp4" },
            };
        }
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: state.error?.message || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

function seedanceContentApiUrl(config: AiConfig, taskId: string) {
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks/${encodeURIComponent(taskId)}/content`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    return blobToDataUrl(blob);
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持视频生成，请使用 OpenAI 格式渠道");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function extractVideoId(payload: unknown): string | undefined {
    return firstStringAt(payload, ["id", "request_id", "task_id", "video.id", "video.request_id", "data.id", "data.request_id", "data.task_id", "result.id", "result.request_id", "result.task_id"]);
}

function extractVideoStatus(payload: unknown) {
    return (firstStringAt(payload, ["status", "state", "task_status", "data.status", "data.state", "result.status", "result.state", "video.status"]) || "").toLowerCase();
}

function extractVideoUrl(payload: unknown): string | undefined {
    if (isVideoUrlValue(payload)) return payload.trim();
    const direct = firstStringAt(payload, ["video.url", "url", "video_url", "download_url", "output.url", "result.url", "result.video_url", "data.url", "data.video_url", "data.video.url", "content.url", "content.video_url", "file.url"]);
    if (isVideoUrlValue(direct)) return direct;
    if (Array.isArray(payload)) {
        for (const item of payload) {
            const url = extractVideoUrl(item);
            if (url) return url;
        }
        return undefined;
    }
    if (!isRecord(payload)) return undefined;
    for (const key of ["data", "result", "results", "output", "outputs", "video", "videos", "content", "contents"]) {
        const url = extractVideoUrl(payload[key]);
        if (url) return url;
    }
    return undefined;
}

function isVideoSuccessStatus(status: string) {
    return status === "completed" || status === "succeeded" || status === "done" || status === "success";
}

function firstStringAt(payload: unknown, paths: string[]) {
    for (const path of paths) {
        const value = valueAtPath(payload, path);
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
}

function valueAtPath(payload: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
        if (Array.isArray(current)) return current.map((item) => (isRecord(item) ? item[key] : undefined)).find((value) => value !== undefined);
        return isRecord(current) ? current[key] : undefined;
    }, payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object");
}

function isVideoUrlValue(value: unknown): value is string {
    return typeof value === "string" && /^(https?:|blob:|data:video\/)/i.test(value.trim());
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapXaiVideoTask(payload: ApiEnvelope<XaiVideoTask>) {
    return unwrapEnvelope(payload, "Grok 视频接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function isXaiVideoModel(model: string) {
    return modelOptionName(model).toLowerCase().includes("grok-imagine-video");
}

function isOfficialXaiBaseUrl(baseUrl: string) {
    try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        return hostname === "api.x.ai" || hostname.endsWith(".x.ai");
    } catch {
        return false;
    }
}

function normalizeXaiVideoDuration(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return Math.max(1, Math.min(15, seconds));
}

function normalizeXaiAspectRatio(value: string) {
    if (["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"].includes(value)) return value;
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return "16:9";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "16:9";
    const ratio = width / height;
    const options = [
        { value: "1:1", ratio: 1 },
        { value: "16:9", ratio: 16 / 9 },
        { value: "9:16", ratio: 9 / 16 },
        { value: "4:3", ratio: 4 / 3 },
        { value: "3:4", ratio: 3 / 4 },
        { value: "3:2", ratio: 3 / 2 },
        { value: "2:3", ratio: 2 / 3 },
    ];
    return options.reduce((best, item) => (Math.abs(item.ratio - ratio) < Math.abs(best.ratio - ratio) ? item : best), options[0]).value;
}

function normalizeXaiResolution(value: string, model: string) {
    const normalized = normalizeVideoResolution(value);
    if (normalized === "1080p" && !modelOptionName(model).toLowerCase().includes("1.5")) return "720p";
    return ["480p", "720p", "1080p"].includes(normalized) ? normalized : "480p";
}

function xaiTaskError(state: XaiVideoTask) {
    if (!state.error) return "";
    if (typeof state.error === "string") return state.error;
    return [state.error.code, state.error.message].filter(Boolean).join("：");
}

function videoTaskError(state: unknown) {
    if (!isRecord(state)) return "";
    const error = state.error;
    if (!error) return "";
    if (typeof error === "string") return error;
    return isRecord(error) && typeof error.message === "string" ? error.message : "";
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { code?: string; message?: string } | string; msg?: string; code?: number }>(error)) {
        if (!error.response && (error.code === "ECONNABORTED" || /timeout/i.test(error.message))) return "视频请求超时，上游可能仍在生成；请稍后刷新任务或重试写回画布";
        const responseData = error.response?.data;
        return responseData?.msg || (typeof responseData?.error === "string" ? responseData.error : responseData?.error?.message) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!(await looksLikeVideoBlob(blob))) {
        const preview = await blob.slice(0, 120).text().catch(() => "");
        if (preview.trim().startsWith("{") || preview.trim().startsWith("[")) {
            try {
                const payload = JSON.parse(preview) as { code?: number; msg?: string; error?: { message?: string } };
                if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
                if (payload.error?.message) throw new Error(payload.error.message);
            } catch (error) {
                if (error instanceof Error && error.message !== "Unexpected token") throw error;
            }
        }
        throw new Error("下载内容不是有效视频文件，请确认 jimeng 服务已重启");
    }
}

async function looksLikeVideoBlob(blob: Blob) {
    if (!blob.size || blob.size < 256) return false;
    const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (header.length >= 8 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) return true;
    if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return true;
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return true;
    const textStart = String.fromCharCode(header[0], header[1], header[2], header[3]).trim();
    if (textStart.startsWith("{") || textStart.startsWith("[") || textStart.startsWith("<!")) return false;
    return blob.size > 4096;
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地素材失败"));
        reader.readAsDataURL(blob);
    });
}
