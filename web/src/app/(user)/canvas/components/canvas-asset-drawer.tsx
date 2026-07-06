"use client";

import { useEffect, useState } from "react";
import { Button, Tabs } from "antd";
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

export function CanvasAssetDrawer({ open, onClose, onInsert }: CanvasAssetDrawerProps) {
    const [tab, setTab] = useState("assets");
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        if (open) setTab("assets");
    }, [open]);

    return (
        <aside
            data-canvas-no-zoom
            className={`pointer-events-none absolute inset-y-0 left-0 z-[80] w-[min(420px,calc(100vw-24px))] transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheelCapture={(event) => event.stopPropagation()}
        >
            <div
                className="pointer-events-auto flex h-full min-h-0 flex-col border-r px-4 py-4 shadow-2xl backdrop-blur-xl"
                style={{
                    background: `${theme.toolbar.panel}f7`,
                    borderColor: theme.toolbar.border,
                    color: theme.node.text,
                }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold">我的资产</div>
                        <div className="mt-0.5 text-xs opacity-55">点击插入，或拖到画布指定位置</div>
                    </div>
                    <Button type="text" aria-label="关闭我的资产" icon={<X className="size-4" />} onClick={onClose} />
                </div>
                <Tabs
                    className="mt-3 flex min-h-0 flex-1 flex-col [&_.ant-tabs-content]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content-holder]:flex-1 [&_.ant-tabs-tabpane]:h-full"
                    activeKey={tab}
                    onChange={setTab}
                    items={[
                        { key: "assets", label: "我的资产", children: <MyAssetsPanel compact onInsert={onInsert} /> },
                        { key: "prompt-hub", label: "卡片库", children: <PromptHubCardsTab compact /> },
                    ]}
                />
            </div>
        </aside>
    );
}
