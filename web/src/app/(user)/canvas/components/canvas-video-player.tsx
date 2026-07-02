"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Play, RefreshCw } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { resolveVideoPlayback, type VideoPlaybackResult } from "@/services/api/video";
import type { UploadedFile } from "@/services/file-storage";

import { captureLastFrameFromVideoElement } from "../utils/canvas-video-frame";

import { CanvasNodeLoadingState } from "./canvas-node-loading-state";

type CanvasVideoPlayerProps = {
    content?: string;
    storageKey?: string;
    mimeType?: string;
    taskId?: string;
    provider?: "openai" | "seedance";
    model?: string;
    variant?: "node" | "preview";
    onPersisted?: (file: UploadedFile) => void;
    onHandleReady?: (handle: CanvasVideoPlayerHandle | null) => void;
};

export type CanvasVideoPlayerHandle = {
    togglePlayback: () => void;
    captureLastFrame: () => Promise<string>;
    getPlayUrl: () => string;
};

export const CanvasVideoPlayer = forwardRef<CanvasVideoPlayerHandle, CanvasVideoPlayerProps>(function CanvasVideoPlayer(
    { content = "", storageKey, mimeType = "video/mp4", taskId, provider, model, variant = "node", onPersisted, onHandleReady },
    ref,
) {
    const isPreview = variant === "preview";
    const config = useConfigStore((state) => state.config);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playUrl, setPlayUrl] = useState("");
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
    const [paused, setPaused] = useState(true);
    const [error, setError] = useState("");
    const ignoreStorageRef = useRef(false);
    const retryCountRef = useRef(0);
    const persistedRef = useRef(false);
    const pendingFileRef = useRef<UploadedFile | null>(null);
    const skipStorageKeyRef = useRef<string | undefined>();
    const objectUrlRef = useRef("");
    const hydratingRef = useRef(false);

    const revokeObjectUrl = useCallback(() => {
        if (objectUrlRef.current.startsWith("blob:")) {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = "";
    }, []);

    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video || !playUrl) return;
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
    }, [playUrl]);

    const captureLastFrame = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !playUrl) {
            throw new Error("视频未就绪");
        }
        const previousTime = video.currentTime;
        const wasPaused = video.paused;
        try {
            return await captureLastFrameFromVideoElement(video);
        } finally {
            try {
                video.currentTime = previousTime;
                if (!wasPaused) {
                    void video.play().catch(() => undefined);
                }
            } catch {
                // Ignore restore failures after capture.
            }
        }
    }, [playUrl]);

    const playerHandle = useCallback(
        (): CanvasVideoPlayerHandle => ({
            togglePlayback,
            captureLastFrame,
            getPlayUrl: () => playUrl,
        }),
        [captureLastFrame, playUrl, togglePlayback],
    );

    useImperativeHandle(ref, playerHandle, [playerHandle]);

    useEffect(() => {
        if (phase !== "ready" || !playUrl) {
            onHandleReady?.(null);
            return;
        }
        if (isPreview) return;
        onHandleReady?.(playerHandle());
        return () => onHandleReady?.(null);
    }, [isPreview, onHandleReady, phase, playUrl, playerHandle]);

    const hydratePlayableUrl = useCallback(
        async (options?: { ignoreStorageKey?: boolean; resetRetry?: boolean }) => {
            if (hydratingRef.current) return;
            hydratingRef.current = true;

            if (options?.resetRetry) retryCountRef.current = 0;
            setPhase("loading");
            setError("");
            setPaused(true);

            const ignoreStorageKey = options?.ignoreStorageKey ?? ignoreStorageRef.current;

            try {
                const result: VideoPlaybackResult = await resolveVideoPlayback({
                    config,
                    content,
                    storageKey,
                    mimeType,
                    taskId,
                    provider,
                    model,
                    ignoreStorageKey,
                });

                if (result.kind === "error") {
                    setPhase("error");
                    setError(result.message);
                    setPlayUrl("");
                    revokeObjectUrl();
                    return;
                }

                if (result.kind === "file") {
                    pendingFileRef.current = result.file;
                } else {
                    pendingFileRef.current = null;
                }

                if (result.url.startsWith("blob:")) {
                    revokeObjectUrl();
                    objectUrlRef.current = result.url;
                }

                setPlayUrl(result.url);
                ignoreStorageRef.current = false;
            } catch (cause) {
                setPhase("error");
                setError(cause instanceof Error ? cause.message : "视频加载失败");
                setPlayUrl("");
                revokeObjectUrl();
            } finally {
                hydratingRef.current = false;
            }
        },
        [config, content, mimeType, model, provider, revokeObjectUrl, storageKey, taskId],
    );

    useEffect(() => {
        if (storageKey && storageKey === skipStorageKeyRef.current) {
            skipStorageKeyRef.current = undefined;
            return;
        }

        retryCountRef.current = 0;
        persistedRef.current = false;
        pendingFileRef.current = null;
        ignoreStorageRef.current = false;
        setPlayUrl("");
        setPhase("loading");
        setPaused(true);
        void hydratePlayableUrl();
        return () => revokeObjectUrl();
    }, [config.baseUrl, config.apiKey, content, mimeType, model, provider, storageKey, taskId, hydratePlayableUrl, revokeObjectUrl]);

    const commitPersistedFile = useCallback(() => {
        if (persistedRef.current || !pendingFileRef.current) return;
        persistedRef.current = true;
        skipStorageKeyRef.current = pendingFileRef.current.storageKey;
        onPersisted?.(pendingFileRef.current);
        pendingFileRef.current = null;
    }, [onPersisted]);

    const handleReload = useCallback(() => {
        persistedRef.current = false;
        pendingFileRef.current = null;
        ignoreStorageRef.current = true;
        revokeObjectUrl();
        setPlayUrl("");
        void hydratePlayableUrl({ ignoreStorageKey: true, resetRetry: true });
    }, [hydratePlayableUrl, revokeObjectUrl]);

    const handleVideoError = useCallback(() => {
        pendingFileRef.current = null;
        if (retryCountRef.current >= 1) {
            setPhase("error");
            setError("浏览器无法播放该视频，请确认 jimeng 服务已重启并包含 /v1/media/fetch");
            revokeObjectUrl();
            setPlayUrl("");
            return;
        }

        retryCountRef.current += 1;
        ignoreStorageRef.current = true;
        persistedRef.current = false;
        revokeObjectUrl();
        setPlayUrl("");
        void hydratePlayableUrl({ ignoreStorageKey: true });
    }, [hydratePlayableUrl, revokeObjectUrl]);

    if (phase === "loading" && !playUrl) {
        return (
            <div className="relative h-full w-full overflow-hidden rounded-[18px]">
                <CanvasNodeLoadingState variant="video" />
            </div>
        );
    }

    if (phase === "error" && !playUrl) {
        return (
            <div className="relative h-full w-full overflow-hidden rounded-[18px]">
                <CanvasNodeLoadingState variant="video" />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="max-w-[90%] text-xs leading-5 text-red-300/90">{error}</div>
                    <button
                        type="button"
                        className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-xs text-white/85 backdrop-blur-sm transition hover:bg-white/10"
                        onClick={(event) => {
                            event.stopPropagation();
                            handleReload();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <RefreshCw className="size-3.5" />
                        重新加载
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[18px]">
            {phase === "loading" ? (
                <div className="absolute inset-0 z-10">
                    <CanvasNodeLoadingState variant="video" />
                </div>
            ) : null}
            <video
                ref={videoRef}
                src={playUrl}
                playsInline
                preload="auto"
                controls={isPreview}
                className={`h-full w-full bg-black object-contain ${isPreview ? "pointer-events-auto" : "pointer-events-none"}`}
                {...(isPreview ? { "data-canvas-interactive": true, "data-canvas-no-zoom": true } : {})}
                onDoubleClick={(event) => event.stopPropagation()}
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                onLoadedData={() => {
                    setPhase("ready");
                    setPaused(videoRef.current?.paused ?? true);
                    commitPersistedFile();
                }}
                onError={handleVideoError}
            />
            {!isPreview && phase === "ready" ? (
                <button
                    type="button"
                    data-canvas-interactive
                    data-canvas-no-zoom
                    className={`absolute inset-0 flex items-center justify-center transition ${paused ? "bg-black/20" : "bg-transparent hover:bg-black/10"}`}
                    onPointerDown={(event) => {
                        event.stopPropagation();
                        togglePlayback();
                    }}
                    aria-label={paused ? "播放视频" : "暂停视频"}
                >
                    {paused ? (
                        <div className="grid size-12 place-items-center rounded-full border border-white/20 bg-black/45 text-white/90 shadow-lg backdrop-blur-sm">
                            <Play className="ml-0.5 size-5 fill-current" />
                        </div>
                    ) : null}
                </button>
            ) : null}
        </div>
    );
});
