"use client";

type CanvasNodeLoadingStateProps = {
    variant?: "image" | "video" | "default";
    referencePreviews?: string[];
};

export function CanvasNodeLoadingState({ variant = "default", referencePreviews = [] }: CanvasNodeLoadingStateProps) {
    const tone = variant === "video" ? "video" : variant === "image" ? "image" : "default";
    const previews = referencePreviews.filter(Boolean).slice(0, 2);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            {previews.length ? (
                <div className="absolute inset-0 opacity-[0.22]">
                    {previews.map((preview, index) => (
                        <div
                            key={`${preview}-${index}`}
                            className="absolute inset-0 scale-110"
                            style={{
                                backgroundImage: `url("${preview}")`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                filter: "blur(28px) saturate(1.2)",
                            }}
                        />
                    ))}
                </div>
            ) : null}

            <div className={`canvas-black-glass canvas-black-glass-${tone}`} />
            <div className="canvas-black-glass-grid absolute inset-0 opacity-[0.35]" />
            <div className={`canvas-black-glass-sheen canvas-black-glass-sheen-${tone}`} />
            <div className="canvas-black-glass-sweep absolute inset-0" />
            <div className={`canvas-black-glass-beam canvas-black-glass-beam-${tone}`} />
            <div className="canvas-black-glass-vignette absolute inset-0" />
            <div className="canvas-black-glass-noise absolute inset-0 opacity-[0.14]" />
        </div>
    );
}
