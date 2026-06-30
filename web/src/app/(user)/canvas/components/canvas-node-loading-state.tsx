"use client";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
};

export function CanvasNodeLoadingState({ variant = "default" }: CanvasNodeLoadingStateProps) {
    const tone = variant === "video" ? "video" : variant === "image" ? "image" : "default";

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <div className={`canvas-black-glass canvas-black-glass-${tone}`} />
            <div className="canvas-black-glass-vignette absolute inset-0" />
            <div className={`canvas-black-glass-fog canvas-black-glass-fog-${tone} absolute inset-0`}>
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-a canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-b canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-c canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-d canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-e canvas-black-glass-mist-${tone}`} />
            </div>
            <div className="canvas-black-glass-sweep absolute inset-0" />
            <div className={`canvas-black-glass-edge canvas-black-glass-edge-${tone}`} />
        </div>
    );
}
