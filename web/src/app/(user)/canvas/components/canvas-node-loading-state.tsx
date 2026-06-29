"use client";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
};

export function CanvasNodeLoadingState({ variant = "default" }: CanvasNodeLoadingStateProps) {
    const tone = variant === "video" ? "video" : variant === "image" ? "image" : "default";

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <div className={`canvas-black-glass canvas-black-glass-${tone}`} />
            <div className="canvas-black-glass-fog absolute inset-0">
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-a canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-b canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-c canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-d canvas-black-glass-mist-${tone}`} />
                <div className={`canvas-black-glass-mist canvas-black-glass-mist-e canvas-black-glass-mist-${tone}`} />
            </div>
            <div className={`canvas-black-glass-aurora canvas-black-glass-aurora-${tone}`} />
            <div className="canvas-black-glass-grid absolute inset-0 opacity-[0.22]" />
            <div className={`canvas-black-glass-sheen canvas-black-glass-sheen-${tone}`} />
            <div className="canvas-black-glass-sweep canvas-black-glass-sweep-primary absolute inset-0" />
            <div className="canvas-black-glass-sweep canvas-black-glass-sweep-secondary absolute inset-0" />
            <div className={`canvas-black-glass-beam canvas-black-glass-beam-${tone}`} />
            <div className={`canvas-black-glass-beam canvas-black-glass-beam-${tone} canvas-black-glass-beam-delayed`} />
            <div className={`canvas-black-glass-scan canvas-black-glass-scan-${tone}`} />
            <div className={`canvas-black-glass-edge canvas-black-glass-edge-${tone}`} />
            <div className="canvas-black-glass-vignette absolute inset-0" />
            <div className="canvas-black-glass-haze absolute inset-0" />
            <div className="canvas-black-glass-noise absolute inset-0 opacity-[0.18]" />
        </div>
    );
}
