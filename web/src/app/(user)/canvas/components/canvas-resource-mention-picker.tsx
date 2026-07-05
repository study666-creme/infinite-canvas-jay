"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AtSign, FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { JimengToolbarButton } from "@/components/jimeng-settings-primitives";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { hideReferenceHoverPreview, showReferenceHoverPreview } from "./canvas-reference-hover-preview";

type Props = {
    references: CanvasResourceReference[];
    onSelect: (reference: CanvasResourceReference) => void;
    disabled?: boolean;
};

export function CanvasResourceMentionPicker({ references, onSelect, disabled = false }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const candidates = useMemo(() => references.filter((item) => item.active), [references]);
    const isDisabled = disabled || !candidates.length;

    useEffect(() => {
        if (!open) return;
        const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    }, [open]);

    const selectReference = (reference: CanvasResourceReference) => {
        onSelect(reference);
        setOpen(false);
        setActiveIndex(0);
    };

    const menu =
        open && buttonRef.current && candidates.length
            ? createPortal(
                  <MentionPickerMenu
                      panelRef={panelRef}
                      anchorRect={buttonRef.current.getBoundingClientRect()}
                      references={candidates}
                      activeIndex={activeIndex}
                      theme={theme}
                      onSelect={selectReference}
                  />,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                disabled={isDisabled}
                title={isDisabled ? "请先连接参考图/视频/音频" : "选择参考素材"}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                    if (isDisabled) return;
                    setOpen((current) => !current);
                    setActiveIndex(0);
                }}
            >
                <AtSign className="size-4" />
            </button>
            {menu}
        </>
    );
}

function MentionPickerMenu({
    panelRef,
    anchorRect,
    references,
    activeIndex,
    theme,
    onSelect,
}: {
    panelRef: React.RefObject<HTMLDivElement | null>;
    anchorRect: DOMRect;
    references: CanvasResourceReference[];
    activeIndex: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelect: (reference: CanvasResourceReference) => void;
}) {
    const menuWidth = 280;
    const maxMenuHeight = 280;
    const gap = 8;
    const margin = 12;
    const left = Math.max(margin, Math.min(window.innerWidth - menuWidth - margin, anchorRect.left + anchorRect.width / 2 - menuWidth / 2));
    const showAbove = anchorRect.bottom + gap + maxMenuHeight > window.innerHeight - margin;
    const top = showAbove ? Math.max(margin, anchorRect.top - gap - maxMenuHeight) : anchorRect.bottom + gap;

    const stopCanvasInteraction = (event: ReactPointerEvent | ReactMouseEvent) => event.stopPropagation();

    return (
        <div
            ref={panelRef}
            className="fixed z-[1200] max-h-72 w-[280px] overflow-y-auto rounded-2xl border p-1.5 shadow-2xl backdrop-blur-md"
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="px-2 py-1.5 text-[11px] opacity-55">选择要插入的参考素材</div>
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onMouseEnter={(event) => showReferenceHoverPreview(reference, event.clientX, event.clientY)}
                    onMouseLeave={() => hideReferenceHoverPreview()}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-12 rounded-lg object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-12 rounded-lg bg-black object-cover" muted preload="metadata" playsInline />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}
