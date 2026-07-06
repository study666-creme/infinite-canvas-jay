"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { App, Button, Input, Modal, Popconfirm } from "antd";
import { Folder, Pencil, Plus, Trash2 } from "lucide-react";

import { useAssetStore, type AssetFolder } from "@/stores/use-asset-store";

export type AssetFolderFilter = "all" | "uncategorized" | string;
export const ASSET_FOLDER_DROP_DRAG_TYPE = "application/x-infinite-canvas-asset-ids";

type AssetFolderBarProps = {
    value: AssetFolderFilter;
    onChange: (value: AssetFolderFilter) => void;
    className?: string;
    buttonClassName?: string;
    onDropAssets?: (assetIds: string[], folderId: string | null) => void;
};

export function AssetFolderBar({ value, onChange, className = "", buttonClassName = "", onDropAssets }: AssetFolderBarProps) {
    const { message } = App.useApp();
    const folders = useAssetStore((state) => state.folders);
    const addFolder = useAssetStore((state) => state.addFolder);
    const renameFolder = useAssetStore((state) => state.renameFolder);
    const removeFolder = useAssetStore((state) => state.removeFolder);
    const [createOpen, setCreateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [editingFolder, setEditingFolder] = useState<AssetFolder | null>(null);
    const [editingName, setEditingName] = useState("");
    const railRef = useRef<HTMLDivElement | null>(null);
    const [activeFrame, setActiveFrame] = useState({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });

    const syncActiveFrame = useCallback(() => {
        const rail = railRef.current;
        const active = rail?.querySelector<HTMLElement>("[data-folder-chip-active='true']");
        if (!rail || !active) {
            setActiveFrame((current) => (current.opacity ? { ...current, opacity: 0 } : current));
            return;
        }

        const railRect = rail.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const next = {
            left: activeRect.left - railRect.left + rail.scrollLeft,
            top: activeRect.top - railRect.top + rail.scrollTop,
            width: activeRect.width,
            height: activeRect.height,
            opacity: 1,
        };

        setActiveFrame((current) =>
            Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5 && Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5 && current.opacity === next.opacity
                ? current
                : next,
        );
    }, []);

    useLayoutEffect(() => {
        syncActiveFrame();
        const rail = railRef.current;
        if (!rail) return;

        const observer = new ResizeObserver(syncActiveFrame);
        observer.observe(rail);
        Array.from(rail.children).forEach((child) => observer.observe(child));
        window.addEventListener("resize", syncActiveFrame);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", syncActiveFrame);
        };
    }, [folders, syncActiveFrame, value]);

    const createFolder = () => {
        const name = newFolderName.trim();
        if (!name) {
            message.warning("请输入分类名称");
            return;
        }

        const existing = folders.find((folder) => folder.name.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
            setCreateOpen(false);
            setNewFolderName("");
            onChange(existing.id);
            message.info(`分类「${existing.name}」已存在，已切换到该分类`);
            return;
        }

        const id = addFolder(name);
        setCreateOpen(false);
        setNewFolderName("");
        onChange(id);
        message.success(`分类「${name}」已创建，已切换到该分类`);
    };

    const saveRename = () => {
        if (!editingFolder) return;
        const name = editingName.trim();
        if (!name) {
            message.warning("请输入分类名称");
            return;
        }
        if (folders.some((folder) => folder.id !== editingFolder.id && folder.name.trim().toLowerCase() === name.toLowerCase())) {
            message.warning("分类名称已存在");
            return;
        }
        renameFolder(editingFolder.id, name);
        setEditingFolder(null);
        setEditingName("");
        message.success("分类已重命名");
    };

    const handleDropAssets = (target: AssetFolderFilter, assetIds: string[]) => {
        if (!onDropAssets || target === "all" || !assetIds.length) return;
        onDropAssets(assetIds, target === "uncategorized" ? null : target);
    };

    return (
        <div className={`canvas-asset-folder-scope flex flex-wrap items-center gap-2 ${className}`}>
            <div ref={railRef} className="canvas-asset-folder-rail thin-scrollbar">
                <span
                    aria-hidden
                    className="canvas-asset-folder-glider"
                    style={{
                        opacity: activeFrame.opacity,
                        transform: `translate3d(${activeFrame.left}px, ${activeFrame.top}px, 0)`,
                        width: activeFrame.width,
                        height: activeFrame.height,
                    }}
                />
                <FolderChip active={value === "all"} label="全部" onClick={() => onChange("all")} />
                <FolderChip active={value === "uncategorized"} label="未分类" dropValue="uncategorized" onDropAssets={handleDropAssets} onClick={() => onChange("uncategorized")} />
                {folders.map((folder) => (
                    <div key={folder.id} className="group flex items-center gap-0.5">
                        <FolderChip active={value === folder.id} label={folder.name} dropValue={folder.id} onDropAssets={handleDropAssets} onClick={() => onChange(folder.id)} />
                        <button
                            type="button"
                            className="canvas-asset-folder-icon-button"
                            aria-label={`重命名 ${folder.name}`}
                            onClick={() => {
                                setEditingFolder(folder);
                                setEditingName(folder.name);
                            }}
                        >
                            <Pencil className="size-3" />
                        </button>
                        <Popconfirm title={`删除分类「${folder.name}」？资产将移至未分类`} okText="删除" cancelText="取消" onConfirm={() => removeFolder(folder.id)}>
                            <button type="button" className="canvas-asset-folder-icon-button danger" aria-label={`删除 ${folder.name}`}>
                                <Trash2 className="size-3" />
                            </button>
                        </Popconfirm>
                    </div>
                ))}
            </div>
            <Button size="small" className={buttonClassName} icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                新建分类
            </Button>

            <Modal className={buttonClassName ? "canvas-asset-modal" : undefined} title="新建资产分类" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createFolder} okText="创建" cancelText="取消" destroyOnHidden>
                <Input value={newFolderName} placeholder="例如：角色参考、场景资产" onChange={(event) => setNewFolderName(event.target.value)} onPressEnter={createFolder} />
            </Modal>

            <Modal className={buttonClassName ? "canvas-asset-modal" : undefined} title="重命名分类" open={Boolean(editingFolder)} onCancel={() => setEditingFolder(null)} onOk={saveRename} okText="保存" cancelText="取消" destroyOnHidden>
                <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} onPressEnter={saveRename} />
            </Modal>
        </div>
    );
}

function FolderChip({
    active,
    label,
    dropValue,
    onClick,
    onDropAssets,
}: {
    active: boolean;
    label: string;
    dropValue?: AssetFolderFilter;
    onClick: () => void;
    onDropAssets?: (target: AssetFolderFilter, assetIds: string[]) => void;
}) {
    const [dragActive, setDragActive] = useState(false);
    const canDrop = Boolean(dropValue && onDropAssets);

    const hasAssetDrag = (event: ReactDragEvent<HTMLButtonElement>) => Array.from(event.dataTransfer.types).includes(ASSET_FOLDER_DROP_DRAG_TYPE);
    const readAssetIds = (event: ReactDragEvent<HTMLButtonElement>) => {
        try {
            const value = event.dataTransfer.getData(ASSET_FOLDER_DROP_DRAG_TYPE);
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
        } catch {
            return [];
        }
    };

    return (
        <button
            type="button"
            data-folder-chip-active={active ? "true" : undefined}
            className={`canvas-asset-folder-chip ${active ? "is-active" : ""} ${dragActive ? "is-drag-over" : ""}`}
            onClick={onClick}
            onDragEnter={(event) => {
                if (!canDrop || !hasAssetDrag(event)) return;
                event.preventDefault();
                setDragActive(true);
            }}
            onDragOver={(event) => {
                if (!canDrop || !hasAssetDrag(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
                setDragActive(false);
                if (!canDrop || !dropValue || !hasAssetDrag(event)) return;
                event.preventDefault();
                onDropAssets?.(dropValue, readAssetIds(event));
            }}
        >
            <Folder className="size-3.5" />
            <span className="max-w-[120px] truncate">{label}</span>
        </button>
    );
}

export function matchesAssetFolder(assetFolderId: string | null | undefined, filter: AssetFolderFilter) {
    if (filter === "all") return true;
    if (filter === "uncategorized") return !assetFolderId;
    return assetFolderId === filter;
}
