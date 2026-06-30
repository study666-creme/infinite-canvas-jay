"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { ClipboardPaste, Copy, FolderPlus, ImageIcon, Layers, Music2, Plus, Save, Trash2, Type, Upload, Video, Wand2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "../types";

type CanvasContextMenuProps = {
    menu: ContextMenuState;
    selectedCount?: number;
    canGroup?: boolean;
    canUngroup?: boolean;
    canPaste: boolean;
    onClose: () => void;
    onUpload: () => void;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onPaste: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    onCopy?: () => void;
    onDuplicate?: () => void;
    onDelete: () => void;
    onSaveToPromptHub?: () => void;
    showSaveToPromptHub?: boolean;
    onSaveToAssetLibrary?: () => void;
    showSaveToAssetLibrary?: boolean;
};

export function CanvasNodeContextMenu({
    menu,
    selectedCount = 0,
    canGroup = false,
    canUngroup = false,
    canPaste,
    onClose,
    onUpload,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddConfig,
    onPaste,
    onGroup,
    onUngroup,
    onCopy,
    onDuplicate,
    onDelete,
    onSaveToPromptHub,
    showSaveToPromptHub = false,
    onSaveToAssetLibrary,
    showSaveToAssetLibrary = false,
}: CanvasContextMenuProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (event.button === 2) return;
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            if (target instanceof Element && target.closest("[data-canvas-context-menu]")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            data-canvas-context-menu
            className="fixed z-[80] min-w-[168px] overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "canvas" ? (
                <>
                    {canGroup ? (
                        <>
                            <MenuButton icon={<Layers className="size-4" />} label={`成组 (${selectedCount})`} onClick={onGroup} />
                            <MenuDivider />
                        </>
                    ) : null}
                    {canUngroup ? <MenuButton icon={<Layers className="size-4 rotate-180" />} label="取消成组" onClick={onUngroup} /> : null}
                    {canUngroup ? <MenuDivider /> : null}
                    <MenuButton icon={<Upload className="size-4" />} label="上传素材" onClick={onUpload} />
                    <MenuDivider />
                    <MenuButton icon={<ImageIcon className="size-4" />} label="新建图片节点" onClick={onAddImage} />
                    <MenuButton icon={<Video className="size-4" />} label="新建视频节点" onClick={onAddVideo} />
                    <MenuButton icon={<Music2 className="size-4" />} label="新建音频节点" onClick={onAddAudio} />
                    <MenuButton icon={<Type className="size-4" />} label="新建文本节点" onClick={onAddText} />
                    <MenuButton icon={<Wand2 className="size-4" />} label="新建生成配置" onClick={onAddConfig} />
                    <MenuDivider />
                    <MenuButton icon={<ClipboardPaste className="size-4" />} label="粘贴" disabled={!canPaste} onClick={onPaste} />
                </>
            ) : null}

            {menu.type === "node" ? (
                <>
                    {canGroup ? <MenuButton icon={<Layers className="size-4" />} label={`成组 (${selectedCount})`} onClick={onGroup} /> : null}
                    {canUngroup ? <MenuButton icon={<Layers className="size-4 rotate-180" />} label="取消成组" onClick={onUngroup} /> : null}
                    {(canGroup || canUngroup) ? <MenuDivider /> : null}
                    {showSaveToAssetLibrary ? <MenuButton icon={<FolderPlus className="size-4" />} label="保存到画布资产库" onClick={onSaveToAssetLibrary} /> : null}
                    {showSaveToPromptHub ? <MenuButton icon={<Save className="size-4" />} label="存为 Prompt Hub 卡片" onClick={onSaveToPromptHub} /> : null}
                    {onCopy ? <MenuButton icon={<Copy className="size-4" />} label="复制" onClick={onCopy} /> : null}
                    {onDuplicate ? <MenuButton icon={<Plus className="size-4" />} label="创建副本" onClick={onDuplicate} /> : null}
                    <MenuButton icon={<ClipboardPaste className="size-4" />} label="粘贴" disabled={!canPaste} onClick={onPaste} />
                    <MenuDivider />
                    <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
                </>
            ) : null}

            {menu.type === "connection" ? <MenuButton icon={<Trash2 className="size-4" />} label="删除连线" onClick={onDelete} danger /> : null}
        </div>
    );
}

function MenuDivider() {
    return <div className="my-1 h-px bg-white/8" />;
}

function MenuButton({ icon, label, onClick, danger = false, disabled = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
            style={{ color: danger ? "#f87171" : theme.node.text }}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
