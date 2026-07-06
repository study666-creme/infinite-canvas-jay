"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button, Segmented } from "antd";
import { X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { MyAssetsPanel, type InsertAssetPayload } from "./asset-library-panel";
import { PromptHubCardsTab } from "./prompt-hub-cards-tab";

type CanvasAssetDrawerProps = {
    open: boolean;
    onClose: () => void;
    onInsert: (payload: InsertAssetPayload) => void;
};

const DRAWER_WIDTH_STORAGE_KEY = "infinite-canvas:asset-drawer-width";
const MIN_DRAWER_WIDTH = 360;
const DEFAULT_DRAWER_WIDTH = 520;
const MAX_DRAWER_WIDTH = 920;

function clampDrawerWidth(value: number) {
    const viewportMax = typeof window === "undefined" ? MAX_DRAWER_WIDTH : Math.max(MIN_DRAWER_WIDTH, window.innerWidth - 32);
    return Math.min(Math.max(value, MIN_DRAWER_WIDTH), Math.min(MAX_DRAWER_WIDTH, viewportMax));
}

export function CanvasAssetDrawer({ open, onClose, onInsert }: CanvasAssetDrawerProps) {
    const [tab, setTab] = useState("assets");
    const [drawerWidth, setDrawerWidth] = useState(() => {
        if (typeof window === "undefined") return DEFAULT_DRAWER_WIDTH;
        const saved = Number(window.localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY));
        return Number.isFinite(saved) && saved > 0 ? clampDrawerWidth(saved) : DEFAULT_DRAWER_WIDTH;
    });
    const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        if (open) setTab("assets");
    }, [open]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(drawerWidth));
    }, [drawerWidth]);

    useEffect(() => {
        const clampOnResize = () => setDrawerWidth((value) => clampDrawerWidth(value));
        window.addEventListener("resize", clampOnResize);
        return () => window.removeEventListener("resize", clampOnResize);
    }, []);

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            resizeStartRef.current = { x: event.clientX, width: drawerWidth };
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";

            const handleMove = (moveEvent: PointerEvent) => {
                const start = resizeStartRef.current;
                if (!start) return;
                setDrawerWidth(clampDrawerWidth(start.width + moveEvent.clientX - start.x));
            };

            const stopResize = () => {
                resizeStartRef.current = null;
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", stopResize);
                window.removeEventListener("pointercancel", stopResize);
            };

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", stopResize);
            window.addEventListener("pointercancel", stopResize);
        },
        [drawerWidth],
    );

    return (
        <aside
            data-canvas-no-zoom
            className={`canvas-asset-drawer pointer-events-none absolute inset-y-0 left-0 z-[80] transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
            style={{ width: drawerWidth, maxWidth: "calc(100vw - 24px)" }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheelCapture={(event) => event.stopPropagation()}
        >
            <div
                className="pointer-events-auto relative flex h-full min-h-0 flex-col border-r px-4 py-4 shadow-2xl backdrop-blur-xl"
                style={{
                    background: `${theme.toolbar.panel}f7`,
                    borderColor: theme.toolbar.border,
                    color: theme.node.text,
                }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[15px] font-semibold tracking-normal">我的资产</div>
                        <div className="mt-0.5 text-xs opacity-55">资产与 Prompt Hub 卡片</div>
                    </div>
                    <Button type="text" className="canvas-asset-ghost-button" aria-label="关闭我的资产" icon={<X className="size-4" />} onClick={onClose} />
                </div>
                <Segmented
                    block
                    className="canvas-asset-segmented mt-4"
                    value={tab}
                    options={[
                        { label: "我的资产", value: "assets" },
                        { label: "卡片库", value: "prompt-hub" },
                    ]}
                    onChange={(value) => setTab(String(value))}
                />
                <div className="min-h-0 flex-1 pt-4">{tab === "assets" ? <MyAssetsPanel compact onInsert={onInsert} /> : <PromptHubCardsTab compact />}</div>
                <button type="button" aria-label="调整我的资产侧边栏宽度" className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-r-lg transition hover:bg-blue-400/30" onPointerDown={startResize} />
            </div>
        </aside>
    );
}
