"use client";

import { useState } from "react";
import { App, Button, Input, Modal, Popconfirm } from "antd";
import { Folder, Pencil, Plus, Trash2 } from "lucide-react";

import { useAssetStore, type AssetFolder } from "@/stores/use-asset-store";

export type AssetFolderFilter = "all" | "uncategorized" | string;

type AssetFolderBarProps = {
    value: AssetFolderFilter;
    onChange: (value: AssetFolderFilter) => void;
    className?: string;
};

export function AssetFolderBar({ value, onChange, className = "" }: AssetFolderBarProps) {
    const { message } = App.useApp();
    const folders = useAssetStore((state) => state.folders);
    const addFolder = useAssetStore((state) => state.addFolder);
    const renameFolder = useAssetStore((state) => state.renameFolder);
    const removeFolder = useAssetStore((state) => state.removeFolder);
    const [createOpen, setCreateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [editingFolder, setEditingFolder] = useState<AssetFolder | null>(null);
    const [editingName, setEditingName] = useState("");

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

    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            <FolderChip active={value === "all"} label="全部" onClick={() => onChange("all")} />
            <FolderChip active={value === "uncategorized"} label="未分类" onClick={() => onChange("uncategorized")} />
            {folders.map((folder) => (
                <div key={folder.id} className="group flex items-center gap-0.5">
                    <FolderChip active={value === folder.id} label={folder.name} onClick={() => onChange(folder.id)} />
                    <button
                        type="button"
                        className="grid size-6 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-stone-700 group-hover:opacity-100 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                        aria-label={`重命名 ${folder.name}`}
                        onClick={() => {
                            setEditingFolder(folder);
                            setEditingName(folder.name);
                        }}
                    >
                        <Pencil className="size-3" />
                    </button>
                    <Popconfirm title={`删除分类「${folder.name}」？资产将移至未分类`} okText="删除" cancelText="取消" onConfirm={() => removeFolder(folder.id)}>
                        <button
                            type="button"
                            className="grid size-6 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/30"
                            aria-label={`删除 ${folder.name}`}
                        >
                            <Trash2 className="size-3" />
                        </button>
                    </Popconfirm>
                </div>
            ))}
            <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                新建分类
            </Button>

            <Modal title="新建资产分类" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createFolder} okText="创建" cancelText="取消" destroyOnHidden>
                <Input value={newFolderName} placeholder="例如：角色参考、场景资产" onChange={(event) => setNewFolderName(event.target.value)} onPressEnter={createFolder} />
            </Modal>

            <Modal title="重命名分类" open={Boolean(editingFolder)} onCancel={() => setEditingFolder(null)} onOk={saveRename} okText="保存" cancelText="取消" destroyOnHidden>
                <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} onPressEnter={saveRename} />
            </Modal>
        </div>
    );
}

function FolderChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition ${
                active
                    ? "border-cyan-300 bg-cyan-300 text-stone-950 shadow-sm shadow-cyan-950/15"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-500"
            }`}
            onClick={onClick}
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
