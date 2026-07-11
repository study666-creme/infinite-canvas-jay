"use client";

import type { ReactNode } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";

export function JimengSectionTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-[13px] font-medium" style={{ color }}>
            {children}
        </div>
    );
}

export function JimengRatioGrid({
    options,
    value,
    theme,
    onChange,
    columns = 6,
}: {
    options: Array<{ value: string; label: string; width: number; height: number }>;
    value: string;
    theme: CanvasTheme;
    onChange: (value: string) => void;
    columns?: number;
}) {
    return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {options.map((item) => {
                const selected = value === item.value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[11px] transition hover:opacity-90"
                        style={{
                            borderColor: selected ? theme.toolbar.activeBg : theme.node.stroke,
                            background: selected ? theme.toolbar.activeBg : "transparent",
                            color: selected ? theme.toolbar.activeText : theme.node.text,
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => onChange(item.value)}
                    >
                        <RatioIcon width={item.width} height={item.height} color={selected ? theme.toolbar.activeText : theme.node.text} />
                        <span className="leading-none">{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export function JimengPillRow({
    options,
    value,
    theme,
    onChange,
    columns = 3,
}: {
    options: Array<{ value: string; label: string; disabled?: boolean }>;
    value: string;
    theme: CanvasTheme;
    onChange: (value: string) => void;
    columns?: number;
}) {
    return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {options.map((item) => {
                const selected = value === item.value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        disabled={item.disabled}
                        className="h-10 cursor-pointer rounded-xl border text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                        style={{
                            borderColor: selected ? theme.toolbar.activeBg : theme.node.stroke,
                            background: selected ? theme.toolbar.activeBg : "transparent",
                            color: selected ? theme.toolbar.activeText : theme.node.text,
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => onChange(item.value)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

export function JimengToolbarButton({
    theme,
    children,
    onClick,
    className = "",
    disabled = false,
    title,
}: {
    theme: CanvasTheme;
    children: ReactNode;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            title={title}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
            style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export function JimengSummaryText({ parts }: { parts: string[] }) {
    return <span className="truncate text-sm tabular-nums">{parts.filter(Boolean).join(" | ")}</span>;
}

function RatioIcon({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) {
        return (
            <span className="grid h-7 w-8 place-items-center text-[10px] opacity-60" style={{ color }}>
                A
            </span>
        );
    }
    const ratio = width / Math.max(1, height);
    const boxWidth = ratio >= 1 ? 24 : Math.max(10, 24 * ratio);
    const boxHeight = ratio >= 1 ? Math.max(10, 24 / ratio) : 24;
    return (
        <span className="grid h-7 w-8 place-items-center">
            <span className="rounded-[3px] border-2" style={{ width: boxWidth, height: boxHeight, borderColor: color }} />
        </span>
    );
}

export function ratioPreviewSize(ratio: string) {
    if (ratio === "9:16") return { width: 9, height: 16, label: "9:16" };
    if (ratio === "1:1") return { width: 1, height: 1, label: "1:1" };
    if (ratio === "4:3") return { width: 4, height: 3, label: "4:3" };
    if (ratio === "3:4") return { width: 3, height: 4, label: "3:4" };
    if (ratio === "21:9") return { width: 21, height: 9, label: "21:9" };
    if (ratio === "adaptive") return { width: 0, height: 0, label: "自适应" };
    if (ratio === "auto") return { width: 0, height: 0, label: "自动" };
    if (ratio === "16:9") return { width: 16, height: 9, label: "16:9" };
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
    if (match) {
        const width = Number(match[1]);
        const height = Number(match[2]);
        if (width > 0 && height > 0) return { width, height, label: ratio };
    }
    return { width: 16, height: 9, label: ratio };
}
