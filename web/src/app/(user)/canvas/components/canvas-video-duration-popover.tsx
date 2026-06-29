"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Clock } from "lucide-react";

import { CreditSymbol, durationOptionCreditCost } from "@/constant/credits";
import { canvasVideoDurationOptions } from "@/lib/video-duration-options";
import { videoSecondsLabel } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { normalizeSeedanceDuration } from "@/lib/seedance-video";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type Props = {
    config: AiConfig;
    onConfigChange: (key: "videoSeconds", value: string) => void;
};

export function CanvasVideoDurationPopover({ config, onConfigChange }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const duration = String(normalizeSeedanceDuration(config.videoSeconds));
    const options = useMemo(() => canvasVideoDurationOptions(), []);

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

    const panel =
        open && buttonRect ? (
            <DurationPortal
                buttonRect={buttonRect}
                panelRef={panelRef}
                theme={theme}
                config={config}
                duration={duration}
                options={options}
                onSelect={(value) => {
                    onConfigChange("videoSeconds", value);
                    setOpen(false);
                }}
            />
        ) : null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="inline-flex h-10 min-w-[56px] shrink-0 items-center justify-center rounded-xl border px-3 text-sm transition hover:opacity-90"
                style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen((current) => !current)}
            >
                {videoSecondsLabel(duration)}
            </button>
            {panel}
        </>
    );
}

function DurationPortal({
    buttonRect,
    panelRef,
    theme,
    config,
    duration,
    options,
    onSelect,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    duration: string;
    options: Array<{ value: string; label: string }>;
    onSelect: (value: string) => void;
}) {
    const width = 220;
    const gap = 8;
    const margin = 12;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left));
    const estimatedHeight = Math.min(window.innerHeight - margin * 2, options.length * 44 + 16);
    const top = Math.max(margin, buttonRect.top - gap - estimatedHeight);

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[1200] overflow-y-auto rounded-2xl border py-1 shadow-2xl"
            style={{ left, top, width, maxHeight: estimatedHeight, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
        >
            {options.map((option) => {
                const selected = duration === option.value;
                const credits = durationOptionCreditCost(config.model, config.modelPricing, option.value);
                return (
                    <button
                        key={option.value}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:opacity-90"
                        style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: selected ? theme.toolbar.activeText : theme.node.text }}
                        onClick={() => onSelect(option.value)}
                    >
                        <Clock className="size-4 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1">{option.label}</span>
                        {credits ? (
                            <span className="inline-flex items-center gap-1 text-xs tabular-nums opacity-80">
                                <CreditSymbol className="size-3" />
                                {credits.toLocaleString()}
                            </span>
                        ) : null}
                        {selected ? <Check className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />}
                    </button>
                );
            })}
        </div>,
        document.body,
    );
}
