import type { AiConfig } from "@/stores/use-config-store";
import { resolveVideoPlayback, type VideoPlaybackInput } from "@/services/api/video";

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata", timeoutMs = 20000): Promise<void> {
    if (eventName === "loadedmetadata" && video.readyState >= 1 && Number.isFinite(video.duration)) {
        return Promise.resolve();
    }
    if (eventName === "loadeddata" && video.readyState >= 2) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("视频加载超时"));
        }, timeoutMs);

        const onReady = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(new Error("视频加载失败"));
        };

        const cleanup = () => {
            window.clearTimeout(timeout);
            video.removeEventListener(eventName, onReady);
            video.removeEventListener("error", onError);
        };

        video.addEventListener(eventName, onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}

function seekVideoToLastFrame(video: HTMLVideoElement): Promise<void> {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
        return video.readyState >= 2 ? Promise.resolve() : waitForVideoEvent(video, "loadeddata");
    }

    const target = Math.max(0, duration - 0.05);
    if (Math.abs(video.currentTime - target) < 0.02 && video.readyState >= 2) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("定位最后一帧超时"));
        }, 15000);

        const onSeeked = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(new Error("无法定位到最后一帧"));
        };

        const cleanup = () => {
            window.clearTimeout(timeout);
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
        };

        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });

        try {
            video.pause();
            video.currentTime = target;
        } catch (error) {
            cleanup();
            reject(error instanceof Error ? error : new Error("无法定位到最后一帧"));
        }
    });
}

function videoFrameToDataUrl(video: HTMLVideoElement): string {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
        throw new Error("无法读取视频画面尺寸");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("无法创建画布");
    }

    context.drawImage(video, 0, 0, width, height);

    try {
        return canvas.toDataURL("image/png");
    } catch {
        throw new Error("无法导出画面，请确认视频来源允许截帧");
    }
}

export async function captureLastFrameFromVideoElement(video: HTMLVideoElement): Promise<string> {
    if (video.readyState < 1) {
        await waitForVideoEvent(video, "loadedmetadata");
    }
    if (video.readyState < 2) {
        await waitForVideoEvent(video, "loadeddata");
    }
    await seekVideoToLastFrame(video);
    return videoFrameToDataUrl(video);
}

export async function captureLastFrameFromPlaybackSource(input: VideoPlaybackInput & { config: AiConfig }): Promise<string> {
    const result = await resolveVideoPlayback(input);
    if (result.kind === "error") {
        throw new Error(result.message);
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = result.url;

    try {
        await waitForVideoEvent(video, "loadedmetadata");
        if (video.readyState < 2) {
            await waitForVideoEvent(video, "loadeddata");
        }
        return await captureLastFrameFromVideoElement(video);
    } finally {
        video.removeAttribute("src");
        video.load();
        if (result.url.startsWith("blob:")) {
            URL.revokeObjectURL(result.url);
        }
    }
}
