"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasTextFullscreenOverlayProps = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: ReactNode;
};

export function CanvasTextFullscreenOverlay({ open, title = "全屏编辑", onClose, children }: CanvasTextFullscreenOverlayProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [onClose, open]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[3000] flex items-center justify-center p-4 md:p-10"
            style={{ background: "rgba(0,0,0,.78)" }}
            onMouseDown={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) onClose();
            }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div
                className="flex h-[min(92vh,920px)] w-[min(96vw,980px)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="truncate text-sm font-medium">{title}</span>
                    <button
                        type="button"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition hover:opacity-90"
                        style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}
                        onClick={onClose}
                    >
                        <Minimize2 className="size-3.5" />
                        点击收起
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-4 md:p-5">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
