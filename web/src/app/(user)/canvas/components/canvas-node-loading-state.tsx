"use client";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
    referencePreviews?: string[];
};

export function CanvasNodeLoadingState({ variant = "default", referencePreviews = [] }: CanvasNodeLoadingStateProps) {
    const tone = variant === "video" ? "video" : variant === "image" ? "image" : "default";
    const previews = referencePreviews.filter(Boolean).slice(0, 3);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            {previews.length ? (
                <div className="absolute inset-0 scale-110 opacity-70">
                    {previews.map((preview, index) => (
                        <div
                            key={`${preview}-${index}`}
                            className={`canvas-glass-ref canvas-glass-ref-${index}`}
                            style={{
                                backgroundImage: `url("${preview}")`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                            }}
                        />
                    ))}
                </div>
            ) : null}

            <div className={`canvas-glass-base canvas-glass-base-${tone}`} />
            <div className={`canvas-glass-mesh canvas-glass-mesh-${tone}`} />
            <div className={`canvas-glass-blob canvas-glass-blob-a canvas-glass-blob-${tone}`} />
            <div className={`canvas-glass-blob canvas-glass-blob-b canvas-glass-blob-${tone}`} />
            <div className={`canvas-glass-blob canvas-glass-blob-c canvas-glass-blob-${tone}`} />
            <div className={`canvas-glass-blob canvas-glass-blob-d canvas-glass-blob-${tone}`} />
            <div className={`canvas-glass-blob canvas-glass-blob-e canvas-glass-blob-${tone}`} />
            <div className="canvas-glass-shimmer absolute inset-0" />
            <div className="canvas-glass-noise absolute inset-0 opacity-[0.18]" />
            <div className="absolute inset-0 backdrop-blur-[52px] backdrop-saturate-[1.85] backdrop-brightness-[1.08] bg-white/[0.045]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,.1),transparent_62%)]" />
            <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(255,255,255,.06)]" />
        </div>
    );
}
