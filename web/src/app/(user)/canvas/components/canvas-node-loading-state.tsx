"use client";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
    progress?: number;
    label?: string;
};

export function CanvasNodeLoadingState({ variant = "default", progress, label }: CanvasNodeLoadingStateProps) {
    const tone = variant === "video" ? "video" : variant === "image" ? "image" : "default";
    const displayLabel = label || (variant === "video" ? "视频生成中" : variant === "image" ? "图片生成中" : "生成中");
    const hasProgress = typeof progress === "number";
    const clampedProgress = hasProgress ? Math.max(4, Math.min(100, progress)) : undefined;

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <div className={`canvas-black-glass canvas-black-glass-${tone}`} />
            <div className="canvas-black-glass-vignette absolute inset-0" />
            <div className={`canvas-black-glass-fog canvas-black-glass-fog-${tone} absolute inset-0`}>
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-a canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-b canvas-black-glass-mist-${tone}`} />
            </div>
            <div className="canvas-black-glass-sweep absolute inset-0" />
            <div className={`canvas-black-glass-edge canvas-black-glass-edge-${tone}`} />
            <div className={`canvas-generation-progress-center canvas-generation-progress-${tone}`}>
                {hasProgress ? <div className="canvas-generation-progress-center-value">{clampedProgress}%</div> : <div className="canvas-generation-progress-center-spinner" />}
                <div className="canvas-generation-progress-center-label">{displayLabel}</div>
                <div className={`canvas-generation-progress-track canvas-generation-progress-track-center ${hasProgress ? "" : "is-indeterminate"}`}>
                    {hasProgress ? <div className="canvas-generation-progress-fill" style={{ width: `${clampedProgress}%` }} /> : <div className="canvas-generation-progress-fill canvas-generation-progress-fill-indeterminate" />}
                </div>
            </div>
            <div className={`canvas-generation-progress-overlay canvas-generation-progress-${tone}`}>
                <div className="canvas-generation-progress-row">
                    <span className="canvas-generation-progress-label">{displayLabel}</span>
                    <span className="canvas-generation-progress-percent">{hasProgress ? `${clampedProgress}%` : "…"}</span>
                </div>
                <div className={`canvas-generation-progress-track ${hasProgress ? "" : "is-indeterminate"}`}>
                    {hasProgress ? <div className="canvas-generation-progress-fill" style={{ width: `${clampedProgress}%` }} /> : <div className="canvas-generation-progress-fill canvas-generation-progress-fill-indeterminate" />}
                </div>
            </div>
        </div>
    );
}
