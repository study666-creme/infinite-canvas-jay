"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { imageJimengSummaryParts, ImageSettingsPanel, normalizeJimengQualityValue } from "@/components/image-settings-panel";
import { JimengSummaryText } from "@/components/jimeng-settings-primitives";
import { canvasThemes } from "@/lib/canvas-theme";
import { parsePromptHubModelId, promptHubImageAspectRatios, promptHubImageResolutions } from "@/services/prompt-hub-models";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    variant?: "default" | "jimeng";
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, placement = "topLeft", variant = "jimeng" }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const promptHubModels = usePromptHubStore((state) => state.imageModels);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const jimeng = variant === "jimeng";
    const promptHubModelId = parsePromptHubModelId(config.model);
    const promptHubModel = promptHubModelId ? promptHubModels.find((model) => model.id === promptHubModelId) : null;
    const aspectRatios = promptHubImageAspectRatios(promptHubModel);
    const resolutions = promptHubImageResolutions(promptHubModel);
    const summaryParts = jimeng ? imageJimengSummaryParts(config, { aspectRatios, resolutions }) : [];

    useEffect(() => {
        if (!promptHubModel) return;
        const resolution = normalizeJimengQualityValue(config.quality || "");
        if (resolutions.length && !resolutions.includes(resolution)) {
            onConfigChange("quality", resolutions[0]);
        }
        if (aspectRatios.length && !aspectRatios.includes(config.size)) {
            onConfigChange("size", aspectRatios.includes("auto") ? "auto" : aspectRatios[0]);
        }
    }, [aspectRatios, config.quality, config.size, onConfigChange, promptHubModel, resolutions]);

    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            updateOpen(false);
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

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} variant={variant} aspectRatios={aspectRatios} resolutions={resolutions} /> : null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="inline-flex h-10 min-w-[120px] max-w-[220px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm transition hover:opacity-90"
                style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => updateOpen(!open)}
            >
                <JimengSummaryText parts={summaryParts.length ? summaryParts : ["设置"]} />
            </button>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
    variant,
    aspectRatios,
    resolutions,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    variant: CanvasImageSettingsPopoverProps["variant"];
    aspectRatios: string[];
    resolutions: string[];
}) {
    const width = Math.min(420, window.innerWidth - 24);
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
            <ImageSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} variant={variant} className="space-y-4" showTitle={false} aspectRatios={aspectRatios} resolutions={resolutions} />
        </div>,
        document.body,
    );
}
