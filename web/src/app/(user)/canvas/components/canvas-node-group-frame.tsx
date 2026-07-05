"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

import { DEFAULT_GROUP_COLOR, type NodeGroupBounds } from "../utils/canvas-node-groups";

type CanvasNodeGroupBackdropProps = {
    bounds: NodeGroupBounds;
    selected: boolean;
    onMouseDown: (event: ReactMouseEvent, rootId: string) => void;
    onPointerEnter?: (rootId: string) => void;
    onPointerLeave?: () => void;
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

function stopCanvasPointer(event: ReactPointerEvent | ReactMouseEvent) {
    event.stopPropagation();
}

export function CanvasNodeGroupBackdrop({ bounds, selected, onMouseDown, onPointerEnter, onPointerLeave }: CanvasNodeGroupBackdropProps) {
    const accent = bounds.color || DEFAULT_GROUP_COLOR;

    return (
        <div
            data-group-frame="backdrop"
            className="absolute"
            style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                zIndex: selected ? 6 : 1,
            }}
            onPointerEnter={() => onPointerEnter?.(bounds.rootId)}
            onPointerLeave={() => onPointerLeave?.()}
        >
            <div
                data-group-frame-body
                className="absolute inset-0 cursor-grab rounded-[28px] border transition-[box-shadow,background,border-color] duration-200 active:cursor-grabbing"
                style={{
                    borderColor: selected ? hexToRgba(accent, 0.82) : hexToRgba(accent, 0.38),
                    background: selected ? hexToRgba(accent, selected && accent === DEFAULT_GROUP_COLOR ? 0.14 : 0.16) : hexToRgba(accent, 0.08),
                    boxShadow: selected
                        ? `0 0 0 1px ${hexToRgba(accent, 0.55)}, 0 0 28px ${hexToRgba(accent, 0.22)}, inset 0 1px 0 rgba(255,255,255,.08)`
                        : `0 10px 28px ${hexToRgba(accent, 0.08)}`,
                }}
                onPointerDown={stopCanvasPointer}
                onMouseDown={(event) => {
                    stopCanvasPointer(event);
                    onMouseDown(event, bounds.rootId);
                }}
            />
        </div>
    );
}
