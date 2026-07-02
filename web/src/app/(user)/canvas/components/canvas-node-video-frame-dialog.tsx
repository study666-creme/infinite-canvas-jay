"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal, Slider } from "antd";
import { Check, X } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";
import { captureFrameFromVideoElement, getDefaultLastFrameTime, resolveVideoPlayUrl, seekVideoToTime } from "../utils/canvas-video-frame";

type CanvasNodeVideoFrameDialogProps = {
    node: CanvasNodeData | null;
    open: boolean;
    initialPlayUrl?: string;
    onClose: () => void;
    onConfirm: (dataUrl: string) => void;
};

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return "00:00";
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const remain = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

async function verifyPlayUrl(url: string) {
    if (!url) return false;
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

export function CanvasNodeVideoFrameDialog({ node, open, initialPlayUrl = "", onClose, onConfirm }: CanvasNodeVideoFrameDialogProps) {
    const config = useConfigStore((state) => state.config);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const videoRef = useRef<HTMLVideoElement>(null);
    const ownedObjectUrlRef = useRef("");
    const [playUrl, setPlayUrl] = useState("");
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [previewUrl, setPreviewUrl] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const revokeOwnedObjectUrl = useCallback(() => {
        if (ownedObjectUrlRef.current.startsWith("blob:")) {
            URL.revokeObjectURL(ownedObjectUrlRef.current);
        }
        ownedObjectUrlRef.current = "";
    }, []);

    const refreshPreview = useCallback(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !video.videoWidth) return;
        try {
            setPreviewUrl(captureFrameFromVideoElement(video));
        } catch {
            setPreviewUrl("");
        }
    }, []);

    const seekTo = useCallback(
        async (time: number, updatePreview = true) => {
            const video = videoRef.current;
            if (!video || phase !== "ready") return;
            await seekVideoToTime(video, time);
            setCurrentTime(video.currentTime);
            if (updatePreview) refreshPreview();
        },
        [phase, refreshPreview],
    );

    useEffect(() => {
        if (!open || !node?.metadata?.content) return;

        let cancelled = false;
        setPhase("loading");
        setError("");
        setDuration(0);
        setCurrentTime(0);
        setPreviewUrl("");
        setPlayUrl("");
        revokeOwnedObjectUrl();

        void (async () => {
            try {
                const cached = initialPlayUrl.trim();
                if (cached && (await verifyPlayUrl(cached))) {
                    if (!cancelled) setPlayUrl(cached);
                    return;
                }

                const result = await resolveVideoPlayUrl({
                    config,
                    content: node.metadata?.content,
                    storageKey: node.metadata?.storageKey,
                    mimeType: node.metadata?.mimeType,
                    taskId: node.metadata?.videoTaskId,
                    provider: node.metadata?.videoProvider,
                    model: node.metadata?.model,
                });
                if (cancelled) {
                    if (result.url.startsWith("blob:") && result.url !== cached) URL.revokeObjectURL(result.url);
                    return;
                }
                if (result.url.startsWith("blob:")) {
                    ownedObjectUrlRef.current = result.url;
                }
                setPlayUrl(result.url);
            } catch (cause) {
                if (!cancelled) {
                    setPhase("error");
                    setError(cause instanceof Error ? cause.message : "视频加载失败");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [config, initialPlayUrl, node?.id, node?.metadata?.content, node?.metadata?.mimeType, node?.metadata?.model, node?.metadata?.storageKey, node?.metadata?.videoProvider, node?.metadata?.videoTaskId, open, revokeOwnedObjectUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!open || !playUrl || !video) return;
        setPhase("loading");
        setError("");
        video.src = playUrl;
        video.load();
    }, [open, playUrl]);

    useEffect(() => {
        if (!open) {
            const video = videoRef.current;
            if (video) {
                video.pause();
                video.removeAttribute("src");
                video.load();
            }
            revokeOwnedObjectUrl();
            setPlayUrl("");
            setPhase("loading");
            setError("");
            setDuration(0);
            setCurrentTime(0);
            setPreviewUrl("");
            setSubmitting(false);
        }
    }, [open, revokeOwnedObjectUrl]);

    const handleLoadedMetadata = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;
        const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
        setDuration(nextDuration);
        setPhase("ready");
        try {
            const lastTime = getDefaultLastFrameTime(nextDuration);
            await seekVideoToTime(video, lastTime);
            setCurrentTime(video.currentTime);
            refreshPreview();
        } catch (cause) {
            setPhase("error");
            setError(cause instanceof Error ? cause.message : "无法定位到最后一帧");
        }
    }, [refreshPreview]);

    const handleConfirm = async () => {
        const video = videoRef.current;
        if (!video || phase !== "ready") return;
        setSubmitting(true);
        setError("");
        try {
            await seekVideoToTime(video, currentTime);
            onConfirm(captureFrameFromVideoElement(video));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "截帧失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title="选择视频画面" open={open && Boolean(node?.metadata?.content)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="relative overflow-hidden rounded-xl border bg-black" style={{ borderColor: theme.node.stroke, minHeight: 220 }}>
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            preload="auto"
                            className="block max-h-[52vh] w-full object-contain"
                            onLoadedMetadata={() => void handleLoadedMetadata()}
                            onError={() => {
                                setPhase("error");
                                setError("浏览器无法加载该视频，请确认视频已保存到本地缓存");
                            }}
                        />
                        {phase === "loading" ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm opacity-80" style={{ color: theme.node.text }}>
                                正在加载视频...
                            </div>
                        ) : null}
                        {phase === "error" ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm text-red-400">{error || "视频加载失败"}</div>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <div className="text-xs opacity-55" style={{ color: theme.node.text }}>
                            预览
                        </div>
                        <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/80">
                            {previewUrl ? (
                                <img src={previewUrl} alt="当前画面预览" className="max-h-40 w-full object-contain" />
                            ) : (
                                <span className="text-xs opacity-45" style={{ color: theme.node.text }}>
                                    拖动时间轴选择画面
                                </span>
                            )}
                        </div>
                        <div className="text-xs opacity-70" style={{ color: theme.node.text }}>
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border px-4 py-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                    <Slider
                        min={0}
                        max={Math.max(duration, 0.001)}
                        step={0.01}
                        value={Math.min(currentTime, duration || 0)}
                        disabled={phase !== "ready"}
                        tooltip={{ formatter: (value) => formatTime(value || 0) }}
                        onChange={(value) => {
                            if (typeof value !== "number") return;
                            setCurrentTime(value);
                        }}
                        onChangeComplete={(value) => {
                            if (typeof value !== "number") return;
                            void seekTo(value);
                        }}
                    />
                    <div className="mt-1 flex items-center justify-between text-xs opacity-55" style={{ color: theme.node.text }}>
                        <span>默认停在最后一帧，可拖动选择任意时刻</span>
                        <button
                            type="button"
                            className="underline-offset-2 hover:underline disabled:opacity-40"
                            disabled={phase !== "ready"}
                            onClick={() => void seekTo(getDefaultLastFrameTime(duration))}
                        >
                            跳到最后一帧
                        </button>
                    </div>
                </div>

                {error && phase === "ready" ? <div className="text-sm text-red-400">{error}</div> : null}

                <div className="flex items-center justify-end gap-2">
                    <Button icon={<X className="size-4" />} onClick={onClose}>
                        取消
                    </Button>
                    <Button type="primary" icon={<Check className="size-4" />} loading={submitting} disabled={phase !== "ready" || !previewUrl} onClick={() => void handleConfirm()}>
                        生成图片节点
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
