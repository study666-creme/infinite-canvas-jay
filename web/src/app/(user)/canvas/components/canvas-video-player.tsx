"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { downloadRemoteVideoBlob, downloadTaskContentBlob } from "@/services/api/video";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";

type CanvasVideoPlayerProps = {
    content?: string;
    storageKey?: string;
    mimeType?: string;
    taskId?: string;
    provider?: "openai" | "seedance";
    model?: string;
};

export function CanvasVideoPlayer({ content = "", storageKey, mimeType = "video/mp4", taskId, provider, model }: CanvasVideoPlayerProps) {
    const config = useConfigStore((state) => state.config);
    const [playUrl, setPlayUrl] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const retryCountRef = useRef(0);

    const hydratePlayableUrl = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            if (storageKey) {
                const resolved = await resolveMediaUrl(storageKey, content);
                if (resolved) {
                    setPlayUrl(resolved);
                    return;
                }
            }

            if (content.startsWith("blob:") || content.startsWith("data:")) {
                setPlayUrl(content);
                return;
            }

            if (taskId && provider && model && config.baseUrl.trim() && config.apiKey.trim()) {
                const blob = await downloadTaskContentBlob(config, { id: taskId, provider, model });
                const saved = await uploadMediaFile(blob, "video");
                setPlayUrl(saved.url);
                return;
            }

            if (/^https?:\/\//i.test(content) && config.baseUrl.trim() && config.apiKey.trim()) {
                try {
                    const blob = await downloadRemoteVideoBlob(config, content);
                    const saved = await uploadMediaFile(blob, "video");
                    setPlayUrl(saved.url);
                    return;
                } catch {
                    // Fall through to direct URL attempt below.
                }
            }

            if (content) {
                setPlayUrl(content);
                return;
            }

            setError("没有可播放的视频地址");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "视频加载失败");
        } finally {
            setLoading(false);
        }
    }, [config.apiKey, config.baseUrl, content, model, provider, storageKey, taskId]);

    useEffect(() => {
        retryCountRef.current = 0;
        void hydratePlayableUrl();
    }, [hydratePlayableUrl]);

    if (loading && !playUrl) {
        return <div className="grid h-full w-full place-items-center rounded-[18px] bg-black/80 text-xs text-white/55">视频加载中…</div>;
    }

    if (error && !playUrl) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[18px] bg-black/85 px-6 text-center">
                <div className="text-xs leading-5 text-red-300">{error}</div>
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 text-xs text-white/85 transition hover:bg-white/12"
                    onClick={(event) => {
                        event.stopPropagation();
                        retryCountRef.current = 0;
                        void hydratePlayableUrl();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <RefreshCw className="size-3.5" />
                    重新加载
                </button>
            </div>
        );
    }

    return (
        <video
            key={playUrl}
            src={playUrl}
            controls
            playsInline
            preload="metadata"
            className="pointer-events-auto h-full w-full rounded-[18px] bg-black object-contain"
            data-canvas-no-zoom
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onError={() => {
                if (retryCountRef.current >= 2) {
                    setError("浏览器无法播放该视频，请确认 API 代理已更新并重启 jimeng 服务");
                    setPlayUrl("");
                    return;
                }
                retryCountRef.current += 1;
                void hydratePlayableUrl();
            }}
        />
    );
}
