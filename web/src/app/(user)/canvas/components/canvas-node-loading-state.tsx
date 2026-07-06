"use client";

import type { CSSProperties } from "react";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
    progress?: number;
    label?: string;
};

export function CanvasNodeLoadingState({ variant = "default", progress, label }: CanvasNodeLoadingStateProps) {
    const hasProgress = typeof progress === "number";
    const clampedProgress = hasProgress ? Math.max(0, Math.min(100, Math.round(progress))) : null;
    const stage = label || (variant === "video" ? "视频生成中" : variant === "image" ? "图像生成中" : "生成中");

    return (
        <div
            className={`canvas-generation-state canvas-generation-state-${variant}`}
            style={{ "--generation-progress": `${clampedProgress ?? 36}%` } as CSSProperties}
        >
            <div className="canvas-generation-beam" aria-hidden />
            <div className="canvas-generation-center">
                <div className="canvas-generation-spinner" aria-hidden />
                <div className="canvas-generation-stage">{stage}</div>
                <div className="canvas-generation-value">{clampedProgress === null ? "准备中" : `${clampedProgress}%`}</div>
                <div className={`canvas-generation-track ${clampedProgress === null ? "is-indeterminate" : ""}`}>
                    <span className="canvas-generation-fill" />
                </div>
            </div>
        </div>
    );
}
