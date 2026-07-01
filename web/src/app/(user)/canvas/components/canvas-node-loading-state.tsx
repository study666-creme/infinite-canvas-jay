"use client";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
    progress?: number;
    label?: string;
};

export function CanvasNodeLoadingState({ progress }: CanvasNodeLoadingStateProps) {
    const hasProgress = typeof progress === "number";
    const clampedProgress = hasProgress ? Math.max(0, Math.min(100, Math.round(progress))) : null;

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-black/28 backdrop-blur-[1px]">
            <div className="absolute inset-0 flex items-center justify-center">
                {clampedProgress !== null ? (
                    <span className="text-[13px] font-medium tabular-nums tracking-wide text-white/72">{clampedProgress}%</span>
                ) : (
                    <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                )}
            </div>
        </div>
    );
}
