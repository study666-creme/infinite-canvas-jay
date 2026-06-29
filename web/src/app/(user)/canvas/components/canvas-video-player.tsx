"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { resolveVideoPlayback, type VideoPlaybackResult } from "@/services/api/video";
import type { UploadedFile } from "@/services/file-storage";

import { CanvasNodeLoadingState } from "./canvas-node-loading-state";

type CanvasVideoPlayerProps = {
    content?: string;
    storageKey?: string;
    mimeType?: string;
    taskId?: string;
    provider?: "openai" | "seedance";
    model?: string;
    onPersisted?: (file: UploadedFile) => void;
};

export function CanvasVideoPlayer({ content = "", storageKey, mimeType = "video/mp4", taskId, provider, model, onPersisted }: CanvasVideoPlayerProps) {
    const config = useConfigStore((state) => state.config);
    const [playUrl, setPlayUrl] = useState("");
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
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

    const hydratePlayableUrl = useCallback(
        async (options?: { ignoreStorageKey?: boolean; resetRetry?: boolean }) => {
            if (hydratingRef.current) return;
            hydratingRef.current = true;

            if (options?.resetRetry) retryCountRef.current = 0;
            setPhase("loading");
            setError("");

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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="max-w-[90%] text-xs leading-5 text-red-300/90">{error}</div>
                    <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-xs text-white/85 backdrop-blur-sm transition hover:bg-white/10"
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
                src={playUrl}
                controls
                playsInline
                preload="auto"
                className="pointer-events-auto h-full w-full bg-black object-contain"
                data-canvas-no-zoom
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onLoadedData={() => {
                    setPhase("ready");
                    commitPersistedFile();
                }}
                onError={handleVideoError}
            />
        </div>
    );
}
