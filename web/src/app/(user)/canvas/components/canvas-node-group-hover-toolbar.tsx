"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { App, Input, Modal } from "antd";
import { ChevronDown, Grid3x3, Pencil, Ungroup } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { DEFAULT_GROUP_COLOR, GROUP_COLOR_PALETTE, type NodeGroupBounds } from "../utils/canvas-node-groups";
import type { ViewportTransform } from "../types";

type Props = {
    bounds: NodeGroupBounds | null;
    viewport: ViewportTransform;
    selected: boolean;
    onClose: () => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    onColorChange?: (rootId: string, color: string) => void;
    onArrangeLayout?: (rootId: string) => void;
    onRename?: (rootId: string, name: string) => void;
    onUngroup?: (rootId: string) => void;
    onMenuOpenChange?: (open: boolean) => void;
};

function hexToRgba(hex: string, alpha: number) {
    if (hex.startsWith("rgba(") || hex.startsWith("rgb(")) return hex;
    const normalized = hex.replace("#", "");
    const value = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
    const int = Number.parseInt(value, 16);
    if (Number.isNaN(int)) return `rgba(203, 213, 225, ${alpha})`;
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function stopCanvasPointer(event: React.MouseEvent) {
    event.stopPropagation();
}

export function CanvasNodeGroupHoverToolbar({
    bounds,
    viewport,
    selected,
    onClose,
    onPointerEnter,
    onPointerLeave,
    onColorChange,
    onArrangeLayout,
    onRename,
    onUngroup,
    onMenuOpenChange,
}: Props) {
    const { modal } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [layoutOpen, setLayoutOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameDraft, setRenameDraft] = useState("");
    const menuOpenRef = useRef(false);

    useEffect(() => {
        setPaletteOpen(false);
        setLayoutOpen(false);
        setRenameOpen(false);
    }, [bounds?.rootId]);

    useEffect(() => {
        const open = paletteOpen || layoutOpen || renameOpen;
        menuOpenRef.current = open;
        onMenuOpenChange?.(open);
    }, [layoutOpen, onMenuOpenChange, paletteOpen, renameOpen]);

    useEffect(() => {
        if (!bounds) return;
        const close = (event: PointerEvent) => {
            if (event.button === 2) return;
            if (menuOpenRef.current) return;
            const target = event.target;
            if (target instanceof Element && target.closest("[data-canvas-group-toolbar]")) return;
            if (target instanceof Element && target.closest("[data-group-frame]")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [bounds, onClose]);

    if (!bounds) return null;

    const accent = bounds.color || DEFAULT_GROUP_COLOR;
    const left = viewport.x + (bounds.x + bounds.width / 2) * viewport.k;
    const top = viewport.y + bounds.y * viewport.k - 14;

    const openRename = () => {
        setPaletteOpen(false);
        setLayoutOpen(false);
        setRenameDraft(bounds.name);
        setRenameOpen(true);
    };

    const saveRename = () => {
        const next = renameDraft.trim();
        if (!next) return;
        onRename?.(bounds.rootId, next.slice(0, 32));
        setRenameOpen(false);
    };

    const confirmUngroup = () => {
        modal.confirm({
            title: "确认解组？",
            content: `将解散「${bounds.name}」，组内节点不会被删除。`,
            okText: "解组",
            cancelText: "取消",
            centered: true,
            onOk: () => onUngroup?.(bounds.rootId),
        });
    };

    return (
        <>
            <div
                data-canvas-group-toolbar
                className="absolute z-[72] flex max-w-[96vw] -translate-x-1/2 -translate-y-full flex-nowrap items-center gap-0.5 rounded-full border px-1 py-0.5 backdrop-blur-md transition duration-200"
                style={{
                    left,
                    top,
                    background: `${theme.toolbar.panel}f2`,
                    borderColor: selected ? hexToRgba(accent, 0.55) : `${theme.toolbar.border}88`,
                    color: theme.node.text,
                    boxShadow: selected ? `0 0 0 1px ${hexToRgba(accent, 0.35)}, 0 12px 32px rgba(15,23,42,.18)` : "0 8px 24px rgba(0,0,0,.24)",
                }}
                onMouseDown={stopCanvasPointer}
                onPointerDown={stopCanvasPointer}
                onPointerEnter={onPointerEnter}
                onPointerLeave={onPointerLeave}
            >
                <ToolbarButton label={bounds.name} icon={<Pencil className="size-3.5 opacity-70" />} accent={accent} onClick={openRename} />

                <ToolbarDivider theme={theme} />

                <ToolbarButton
                    label="颜色"
                    accent={accent}
                    active={paletteOpen}
                    onClick={() => {
                        setLayoutOpen(false);
                        setPaletteOpen((open) => !open);
                    }}
                />
                {onColorChange && paletteOpen ? (
                    <div
                        className="absolute left-1/2 top-[calc(100%+8px)] z-30 grid w-[168px] -translate-x-1/2 grid-cols-4 gap-1.5 rounded-xl border p-2 shadow-2xl backdrop-blur-md"
                        style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}
                        onMouseDown={stopCanvasPointer}
                    >
                        {GROUP_COLOR_PALETTE.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className="grid size-7 place-items-center rounded-lg transition hover:scale-105"
                                title="切换组合颜色"
                                onMouseDown={stopCanvasPointer}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onColorChange(bounds.rootId, color);
                                    setPaletteOpen(false);
                                }}
                            >
                                <span
                                    className="size-5 rounded-full ring-1 ring-black/10"
                                    style={{
                                        background: color,
                                        boxShadow: color === accent ? `0 0 0 2px ${theme.toolbar.panel}, 0 0 0 3px ${color}` : undefined,
                                    }}
                                />
                            </button>
                        ))}
                    </div>
                ) : null}

                <ToolbarDivider theme={theme} />

                <ToolbarButton
                    label="整理布局"
                    icon={<Grid3x3 className="size-3.5" />}
                    trailing={<ChevronDown className={`size-3 opacity-55 transition ${layoutOpen ? "rotate-180" : ""}`} />}
                    onClick={() => {
                        setPaletteOpen(false);
                        setLayoutOpen((open) => !open);
                    }}
                />
                {onArrangeLayout && layoutOpen ? (
                    <div
                        className="absolute left-1/2 top-[calc(100%+8px)] z-30 min-w-[132px] -translate-x-1/2 rounded-xl border p-1 shadow-2xl backdrop-blur-md"
                        style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}
                        onMouseDown={stopCanvasPointer}
                    >
                        <MenuAction label="自动整理" onClick={() => { onArrangeLayout(bounds.rootId); setLayoutOpen(false); }} />
                    </div>
                ) : null}

                <ToolbarDivider theme={theme} />

                <ToolbarButton label="解组" icon={<Ungroup className="size-3.5" />} onClick={confirmUngroup} />
            </div>

            <Modal title="重命名组合" open={renameOpen} centered destroyOnHidden okText="保存" cancelText="取消" onCancel={() => setRenameOpen(false)} onOk={saveRename}>
                <Input maxLength={32} value={renameDraft} placeholder="输入组合名称" onChange={(event) => setRenameDraft(event.target.value)} onPressEnter={saveRename} />
            </Modal>
        </>
    );
}

function ToolbarButton({
    label,
    icon,
    trailing,
    accent,
    active,
    onClick,
}: {
    label: string;
    icon?: ReactNode;
    trailing?: ReactNode;
    accent?: string;
    active?: boolean;
    onClick: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            className="inline-flex h-8 max-w-[120px] items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition hover:opacity-90"
            style={{ color: theme.node.text, background: active ? theme.toolbar.activeBg : "transparent" }}
            onMouseDown={stopCanvasPointer}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            {label === "颜色" && accent ? <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: accent }} /> : icon}
            <span className="truncate">{label}</span>
            {trailing}
        </button>
    );
}

function ToolbarDivider({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return <span className="mx-0.5 h-4 w-px shrink-0" style={{ background: theme.toolbar.border }} />;
}

function MenuAction({ label, onClick }: { label: string; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-xs transition hover:opacity-90"
            style={{ color: theme.node.text }}
            onMouseDown={stopCanvasPointer}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            {label}
        </button>
    );
}
