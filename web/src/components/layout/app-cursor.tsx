"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CursorMode = "default" | "link" | "drag" | "text";

function cursorModeFromTarget(target: EventTarget | null): CursorMode {
    if (!(target instanceof Element)) return "default";
    if (target.closest("input, textarea, [contenteditable='true'], [role='textbox'], .cm-editor")) return "text";
    if (target.closest("[data-resize-handle], [data-group-frame-body], [class*='cursor-grab'], [class*='cursor-grabbing'], [class*='cursor-move'], [class*='cursor-crosshair'], [class*='cursor-ew-resize'], [class*='cursor-ns-resize'], [class*='cursor-col-resize'], [class*='cursor-row-resize'], [class*='cursor-nwse-resize'], [class*='cursor-nesw-resize']")) return "drag";
    if (target.closest("button:not(:disabled), a[href], summary, select, [role='button'], [data-connection-handle], [data-canvas-interactive], .ant-btn:not(.ant-btn-disabled), .ant-select:not(.ant-select-disabled), .ant-dropdown-trigger, .ant-tabs-tab, .canvas-asset-card")) return "link";
    return "default";
}

function applyMode(root: HTMLElement, mode: CursorMode) {
    root.classList.toggle("is-link", mode === "link");
    root.classList.toggle("is-drag", mode === "drag");
    root.classList.toggle("is-text", mode === "text");
}

export function AppCursor() {
    const themeName = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeName];
    const rootRef = useRef<HTMLDivElement | null>(null);
    const pointerRef = useRef<HTMLDivElement | null>(null);
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncEnabled = () => setEnabled(finePointer.matches && !reducedMotion.matches);
        syncEnabled();
        finePointer.addEventListener("change", syncEnabled);
        reducedMotion.addEventListener("change", syncEnabled);
        return () => {
            finePointer.removeEventListener("change", syncEnabled);
            reducedMotion.removeEventListener("change", syncEnabled);
        };
    }, []);

    useEffect(() => {
        if (!enabled) {
            document.documentElement.classList.remove("has-app-cursor");
            return;
        }

        const root = rootRef.current;
        const pointer = pointerRef.current;
        if (!root || !pointer) return;

        document.documentElement.classList.add("has-app-cursor");
        let targetX = window.innerWidth / 2;
        let targetY = window.innerHeight / 2;

        const show = () => root.classList.add("is-visible");
        const hide = () => root.classList.remove("is-visible");
        const setMode = (mode: CursorMode) => {
            applyMode(root, mode);
        };

        const move = (event: PointerEvent) => {
            if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
            targetX = event.clientX;
            targetY = event.clientY;
            pointer.style.transform = `translate3d(${targetX - 4}px, ${targetY - 3}px, 0)`;
            setMode(cursorModeFromTarget(event.target));
            show();
        };

        const down = () => {
            root.classList.add("is-down");
        };
        const up = (event: PointerEvent) => {
            root.classList.remove("is-down");
            setMode(cursorModeFromTarget(event.target));
        };

        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerdown", down, { passive: true });
        window.addEventListener("pointerup", up, { passive: true });
        window.addEventListener("pointercancel", up, { passive: true });
        document.addEventListener("mouseleave", hide);
        document.addEventListener("mouseenter", show);

        return () => {
            document.documentElement.classList.remove("has-app-cursor");
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerdown", down);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            document.removeEventListener("mouseleave", hide);
            document.removeEventListener("mouseenter", show);
        };
    }, [enabled]);

    if (!enabled) return null;

    return (
        <div
            ref={rootRef}
            className="app-cursor"
            aria-hidden="true"
            style={
                {
                    "--app-cursor-accent": theme.accent.solid,
                    "--app-cursor-soft": theme.accent.soft,
                    "--app-cursor-contrast": theme.accent.contrast,
                    "--app-cursor-edge": themeName === "dark" ? "rgba(255,255,255,.62)" : "rgba(29,29,31,.44)",
                    "--app-cursor-fill": themeName === "dark" ? "rgba(245,245,247,.94)" : "rgba(29,29,31,.92)",
                    "--app-cursor-shadow": themeName === "dark" ? "rgba(0,0,0,.45)" : "rgba(31,29,26,.22)",
            } as CSSProperties
            }
        >
            <div ref={pointerRef} className="app-cursor-pointer">
                <svg className="app-cursor-arrow" viewBox="0 0 28 32" focusable="false">
                    <path className="app-cursor-arrow-shell" d="M4.3 3.1 23.2 18.4l-8.1 1.1-4.4 8.8L4.3 3.1Z" />
                    <path className="app-cursor-arrow-core" d="M6.9 8.1 18 17.1l-5.1.7-2.8 5.7L6.9 8.1Z" />
                </svg>
                <span className="app-cursor-textbar" />
            </div>
        </div>
    );
}
