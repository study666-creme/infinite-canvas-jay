"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { JimengSummaryText, JimengToolbarButton } from "@/components/jimeng-settings-primitives";
import { VideoSettingsPanel, videoJimengRatioLabel, videoJimengResolutionLabel, videoResolutionLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { isSeedanceVideoConfig } from "@/lib/seedance-video";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    variant?: "default" | "jimeng";
};

export function CanvasVideoSettingsPopover({ config, onConfigChange, buttonClassName, placement = "topLeft", variant = "jimeng" }: CanvasVideoSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const jimeng = variant === "jimeng";
    const summaryParts = jimeng
        ? isSeedanceVideoConfig(config)
            ? [videoJimengRatioLabel(config.size), videoJimengResolutionLabel(config.vquality, config)]
            : [videoSizeLabel(config.size), videoResolutionLabel(config.vquality)]
        : [];

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const panel = open && buttonRect ? <VideoSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} variant={variant} /> : null;

    if (jimeng) {
        return (
            <>
                <button
                    ref={buttonRef}
                    type="button"
                    className="inline-flex h-10 min-w-[120px] max-w-[220px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm transition hover:opacity-90"
                    style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setOpen((current) => !current)}
                >
                    <JimengSummaryText parts={summaryParts} />
                </button>
                {panel}
            </>
        );
    }

    return (
        <>
            <span ref={buttonRef as never} className="inline-flex min-w-0">
                <JimengToolbarButton theme={theme} className={buttonClassName} onClick={() => setOpen((current) => !current)}>
                    <JimengSummaryText parts={summaryParts.length ? summaryParts : ["设置"]} />
                </JimengToolbarButton>
            </span>
            {panel}
        </>
    );
}

function VideoSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
    variant,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    variant: CanvasVideoSettingsPopoverProps["variant"];
}) {
    const width = 420;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <VideoSettingsPanel
                config={config}
                onConfigChange={(key, value) => onConfigChange(key, value)}
                theme={theme}
                variant={variant}
                sections={isSeedanceVideoConfig(config) && variant === "jimeng" ? "ratio-resolution" : "all"}
                className="space-y-4"
                showTitle={false}
            />
        </div>,
        document.body,
    );
}
