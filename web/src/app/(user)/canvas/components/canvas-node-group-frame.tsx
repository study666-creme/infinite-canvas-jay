"use client";

import { Layers } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { NodeGroupBounds } from "../utils/canvas-node-groups";

type CanvasNodeGroupFrameProps = {
    bounds: NodeGroupBounds;
    selected: boolean;
    onPointerDown: (event: React.PointerEvent, rootId: string) => void;
};

export function CanvasNodeGroupFrame({ bounds, selected, onPointerDown }: CanvasNodeGroupFrameProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div
            className="pointer-events-none absolute"
            style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                zIndex: selected ? 8 : 2,
            }}
        >
            <div
                className="pointer-events-none absolute inset-0 rounded-[28px] border"
                style={{
                    borderColor: selected ? theme.node.activeStroke : `${theme.node.stroke}cc`,
                    background: selected ? `${theme.node.panel}66` : `${theme.node.panel}40`,
                    boxShadow: selected ? `0 0 0 1px ${theme.node.activeStroke}55` : "0 12px 32px rgba(15,23,42,.10)",
                }}
            />
            <button
                type="button"
                data-group-drag-handle
                className="pointer-events-auto absolute left-3 top-2.5 inline-flex h-7 max-w-[calc(100%-24px)] cursor-grab items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium backdrop-blur-sm transition hover:opacity-90 active:cursor-grabbing"
                style={{
                    borderColor: selected ? `${theme.node.activeStroke}88` : theme.node.stroke,
                    background: `${theme.toolbar.panel}ee`,
                    color: theme.node.text,
                }}
                onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    onPointerDown(event, bounds.rootId);
                }}
            >
                <Layers className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">组合 · {bounds.memberIds.length}</span>
            </button>
        </div>
    );
}
