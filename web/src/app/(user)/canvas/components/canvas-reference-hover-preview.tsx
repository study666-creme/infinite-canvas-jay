"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type PreviewState = {
    reference: CanvasResourceReference;
    x: number;
    y: number;
    aspectRatio: number;
};

const PREVIEW_MAX = 280;
const PREVIEW_SOURCE_ATTR = "data-reference-hover-preview-source";

let imperativePreview: PreviewState | null = null;
let imperativeListeners = new Set<(preview: PreviewState | null) => void>();
let imperativeTimer = 0 as ReturnType<typeof setTimeout> | 0;
const aspectRatioCache = new Map<string, number>();

function notifyImperativePreview() {
    imperativeListeners.forEach((listener) => listener(imperativePreview));
}

function resolvePreviewAspectRatio(reference: CanvasResourceReference) {
    const cacheKey = `${reference.kind}:${reference.previewUrl || reference.id}`;
    const cached = aspectRatioCache.get(cacheKey);
    if (cached) return cached;
    if (reference.kind === "audio" || reference.kind === "text") return 1;
    return 4 / 3;
}

function preloadPreviewAspectRatio(reference: CanvasResourceReference) {
    if (!reference.previewUrl || reference.kind === "audio" || reference.kind === "text") return;
    const cacheKey = `${reference.kind}:${reference.previewUrl}`;
    if (aspectRatioCache.has(cacheKey)) return;
    if (reference.kind === "image") {
        const img = new Image();
        img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            aspectRatioCache.set(cacheKey, img.naturalWidth / img.naturalHeight);
            if (imperativePreview?.reference.previewUrl === reference.previewUrl) notifyImperativePreview();
        };
        img.src = reference.previewUrl;
        return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        aspectRatioCache.set(cacheKey, video.videoWidth / video.videoHeight);
        if (imperativePreview?.reference.previewUrl === reference.previewUrl) notifyImperativePreview();
    };
    video.src = reference.previewUrl;
}

function buildPreviewBox(aspectRatio: number, kind: CanvasResourceReference["kind"]) {
    if (kind === "audio") return { width: 240, height: 120 };
    const ratio = Math.max(0.35, Math.min(3.2, aspectRatio || 1));
    if (ratio >= 1) {
        const width = PREVIEW_MAX;
        return { width, height: Math.max(120, Math.round(width / ratio)) };
    }
    const height = PREVIEW_MAX;
    return { width: Math.max(120, Math.round(height * ratio)), height };
}

export function showReferenceHoverPreview(reference: CanvasResourceReference, x: number, y: number, delayMs = 120) {
    if (imperativeTimer) {
        clearTimeout(imperativeTimer);
        imperativeTimer = 0;
    }
    if (!reference.previewUrl && reference.kind !== "text") {
        hideReferenceHoverPreview();
        return;
    }
    preloadPreviewAspectRatio(reference);
    imperativeTimer = setTimeout(() => {
        imperativeTimer = 0;
        imperativePreview = {
            reference,
            x,
            y,
            aspectRatio: resolvePreviewAspectRatio(reference),
        };
        notifyImperativePreview();
    }, delayMs);
}

export function hideReferenceHoverPreview() {
    if (imperativeTimer) {
        clearTimeout(imperativeTimer);
        imperativeTimer = 0;
    }
    imperativePreview = null;
    notifyImperativePreview();
}

export function attachReferenceHoverPreview(element: HTMLElement, reference: CanvasResourceReference | undefined) {
    if (!reference) return;
    element.setAttribute(PREVIEW_SOURCE_ATTR, "true");
    const show = (event: MouseEvent) => showReferenceHoverPreview(reference, event.clientX, event.clientY);
    const hide = () => hideReferenceHoverPreview();
    element.addEventListener("mouseenter", show);
    element.addEventListener("mouseleave", hide);
    element.addEventListener("mousedown", hide);
    element.addEventListener("click", hide);
    return () => {
        element.removeAttribute(PREVIEW_SOURCE_ATTR);
        element.removeEventListener("mouseenter", show);
        element.removeEventListener("mouseleave", hide);
        element.removeEventListener("mousedown", hide);
        element.removeEventListener("click", hide);
    };
}

export function CanvasReferenceHoverPreview({ preview }: { preview: PreviewState | null }) {
    const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);

    useEffect(() => {
        setMeasuredRatio(null);
        if (!preview?.reference.previewUrl) return;
        preloadPreviewAspectRatio(preview.reference);
        const cacheKey = `${preview.reference.kind}:${preview.reference.previewUrl}`;
        const cached = aspectRatioCache.get(cacheKey);
        if (cached) setMeasuredRatio(cached);
    }, [preview?.reference.id, preview?.reference.kind, preview?.reference.previewUrl]);

    if (!preview) return null;
    const { reference, x, y } = preview;
    if (!reference.previewUrl && reference.kind !== "text") return null;
    const aspectRatio = measuredRatio || preview.aspectRatio;
    const { width, height } = buildPreviewBox(aspectRatio, reference.kind);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, x + 16));
    const top = Math.max(12, Math.min(window.innerHeight - height - 12, y - height / 2));

    return createPortal(
        <div
            className="pointer-events-none fixed z-[1300] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
            style={{ left, top, width, height, borderColor: "rgba(255,255,255,.18)", background: "rgba(15,23,42,.92)" }}
        >
            <ReferencePreviewLarge reference={reference} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-2.5 pt-8">
                <div className="truncate text-xs font-semibold text-white">{reference.label}</div>
                <div className="truncate text-[11px] text-white/70">{reference.title}</div>
            </div>
        </div>,
        document.body,
    );
}

export function CanvasReferenceHoverPreviewHost() {
    const [preview, setPreview] = useState<PreviewState | null>(imperativePreview);

    useEffect(() => {
        const listener = (next: PreviewState | null) => setPreview(next ? { ...next } : null);
        imperativeListeners.add(listener);
        return () => {
            imperativeListeners.delete(listener);
            if (!imperativeListeners.size) hideReferenceHoverPreview();
        };
    }, []);

    useEffect(() => {
        const hide = () => hideReferenceHoverPreview();
        const hideWhenPointerLeavesSource = (event: PointerEvent) => {
            if (!imperativePreview) return;
            const target = event.target;
            if (target instanceof Element && target.closest(`[${PREVIEW_SOURCE_ATTR}]`)) return;
            hideReferenceHoverPreview();
        };
        window.addEventListener("pointermove", hideWhenPointerLeavesSource, true);
        window.addEventListener("pointerdown", hide, true);
        window.addEventListener("blur", hide);
        window.addEventListener("resize", hide);
        window.addEventListener("scroll", hide, true);
        document.addEventListener("visibilitychange", hide);
        return () => {
            window.removeEventListener("pointermove", hideWhenPointerLeavesSource, true);
            window.removeEventListener("pointerdown", hide, true);
            window.removeEventListener("blur", hide);
            window.removeEventListener("resize", hide);
            window.removeEventListener("scroll", hide, true);
            document.removeEventListener("visibilitychange", hide);
        };
    }, []);

    return <CanvasReferenceHoverPreview preview={preview} />;
}

function ReferencePreviewLarge({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) {
        return <img src={reference.previewUrl} alt="" className="size-full object-contain" />;
    }
    if (reference.kind === "video" && reference.previewUrl) {
        return <video src={reference.previewUrl} className="size-full bg-black object-contain" muted preload="metadata" playsInline />;
    }
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <div className="grid size-full place-items-center bg-black/25 px-4 text-center text-sm text-white/80">
            <Icon className="mb-2 size-8 opacity-70" />
            <span>{reference.text || reference.title}</span>
        </div>
    );
}
