"use client";

import { AtSign, Image as ImageIcon, Music2, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasVideoReferenceAsset } from "../utils/canvas-video-references";
import { hideReferenceHoverPreview, showReferenceHoverPreview } from "./canvas-reference-hover-preview";

type Variant = "panel" | "node" | "overlay";

type Props = {
    references: CanvasVideoReferenceAsset[];
    variant?: Variant;
    className?: string;
    onInsertReference?: (label: string) => void;
    onRemoveReference?: (nodeId: string, label: string) => void;
    activeLabels?: string[];
};

export function CanvasVideoReferenceStrip({ references, variant = "panel", className = "", onInsertReference, onRemoveReference, activeLabels = [] }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    if (!references.length) return null;

    const activeLabelSet = new Set(activeLabels);
    const clickable = Boolean(onInsertReference);
    const removable = Boolean(onRemoveReference);
    const isPanel = variant === "panel";
    const isNode = variant === "node";
    const isOverlay = variant === "overlay";

    return (
        <div className={`flex min-w-0 items-center ${isNode ? "justify-center gap-1.5 px-1" : "gap-2 overflow-x-auto pb-0.5"} ${className}`}>
            {references.map((reference, index) => {
                const isActive = !activeLabels.length || activeLabelSet.has(reference.label);
                const tileSize = isOverlay ? "size-11" : isNode ? "size-14" : "size-[72px]";
                return (
                    <div
                        key={`${reference.nodeId}-${reference.label}`}
                        className={`group relative shrink-0 overflow-hidden rounded-2xl transition duration-200 ${tileSize} ${isNode && index > 0 ? "-ml-3" : ""}`}
                        style={{
                            boxShadow: isActive
                                ? isNode
                                    ? `0 10px 28px ${theme.accent.soft}, 0 0 0 1.5px ${theme.accent.solid}`
                                    : `0 8px 24px ${theme.accent.soft}, 0 0 0 1.5px ${theme.accent.solid}`
                                : isNode
                                  ? "0 8px 20px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.08)"
                                  : "0 6px 18px rgba(0,0,0,.16), 0 0 0 1px rgba(255,255,255,.06)",
                            opacity: isActive ? 1 : 0.72,
                            zIndex: references.length - index,
                        }}
                    >
                        <button
                            type="button"
                            data-reference-hover-preview-source
                            className={`relative size-full overflow-hidden ${clickable ? "cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]" : "cursor-default"}`}
                            title={clickable ? `点击插入 ${reference.label}` : reference.title}
                            onPointerDown={(event) => {
                                hideReferenceHoverPreview();
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onMouseEnter={(event) =>
                                showReferenceHoverPreview(
                                    {
                                        id: reference.nodeId,
                                        nodeId: reference.nodeId,
                                        kind: reference.kind,
                                        label: reference.label,
                                        title: reference.title,
                                        previewUrl: reference.previewUrl,
                                        active: true,
                                    },
                                    event.clientX,
                                    event.clientY,
                                )
                            }
                            onMouseLeave={() => hideReferenceHoverPreview()}
                            onClick={() => {
                                hideReferenceHoverPreview();
                                onInsertReference?.(reference.label);
                            }}
                            disabled={!clickable}
                        >
                            <ReferencePreview reference={reference} />
                            {!isPanel ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-1.5 pb-1.5 pt-5">
                                    <span className="block truncate text-[10px] font-medium tracking-wide text-white/95">{reference.label}</span>
                                </div>
                            ) : null}
                            {clickable && !removable ? (
                                <span
                                    className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded-full opacity-0 shadow-lg transition group-hover:opacity-100"
                                    style={{ background: theme.accent.solid, color: theme.accent.contrast }}
                                >
                                    <AtSign className="size-3" />
                                </span>
                            ) : null}
                        </button>
                        {removable ? (
                            <button
                                type="button"
                                className="absolute right-1 top-1 z-20 grid size-5 place-items-center rounded-full bg-black/58 text-white/92 shadow-md backdrop-blur-sm transition hover:bg-black/78"
                                title={`断开 ${reference.label}`}
                                onPointerDown={(event) => {
                                    hideReferenceHoverPreview();
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                onClick={(event) => {
                                    hideReferenceHoverPreview();
                                    event.stopPropagation();
                                    onRemoveReference?.(reference.nodeId, reference.label);
                                }}
                            >
                                <X className="size-3" strokeWidth={2.5} />
                            </button>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

function ReferencePreview({ reference }: { reference: CanvasVideoReferenceAsset }) {
    if (reference.kind === "image" && reference.previewUrl) {
        return <img src={reference.previewUrl} alt={reference.title} className="size-full object-cover" />;
    }
    if (reference.kind === "video" && reference.previewUrl) {
        return <video src={reference.previewUrl} className="size-full bg-black object-cover" muted preload="metadata" />;
    }
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : ImageIcon;
    return (
        <span className="grid size-full place-items-center bg-black/20">
            <Icon className="size-4 opacity-70" />
        </span>
    );
}
