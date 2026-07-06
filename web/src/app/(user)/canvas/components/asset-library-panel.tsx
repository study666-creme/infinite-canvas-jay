"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { App, Button, Empty, Input, Modal, Pagination, Popconfirm, Segmented, Select, Tag } from "antd";
import { Check, CheckSquare, FileText, FolderInput, Image as ImageIcon, Plus, Search, Trash2, UploadCloud, Video, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/image-utils";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { ASSET_FOLDER_DROP_DRAG_TYPE, AssetFolderBar, matchesAssetFolder, type AssetFolderFilter } from "@/components/asset-folder-bar";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export const CANVAS_ASSET_DRAG_TYPE = "application/x-infinite-canvas-asset";

export type InsertAssetPayload =
    { kind: "text"; content: string; title: string } | { kind: "image"; dataUrl: string; title: string; prompt?: string; storageKey?: string } | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number };

type MyAssetsPanelProps = {
    onInsert: (payload: InsertAssetPayload) => void;
    compact?: boolean;
};

type ImageDraft = UploadedImage & { fileName?: string };
type CreateKind = "text" | "image";

const BULK_UNCATEGORIZED_VALUE = "__uncategorized__";

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
];

export function assetToInsertPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") {
        return { kind: "text", content: asset.data.content, title: asset.title };
    }
    if (asset.kind === "video") {
        return { kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height };
    }
    return { kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title, prompt: asset.metadata?.prompt as string | undefined };
}

export function serializeAssetDragPayload(payload: InsertAssetPayload) {
    return JSON.stringify(payload);
}

export function parseAssetDragPayload(value: string): InsertAssetPayload | null {
    if (!value) return null;
    try {
        const payload = JSON.parse(value) as Record<string, unknown>;
        const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : "未命名资产";
        if (payload.kind === "text" && typeof payload.content === "string") return { kind: "text", content: payload.content, title };
        if (payload.kind === "image" && typeof payload.dataUrl === "string") {
            return {
                kind: "image",
                dataUrl: payload.dataUrl,
                title,
                prompt: typeof payload.prompt === "string" ? payload.prompt : undefined,
                storageKey: typeof payload.storageKey === "string" ? payload.storageKey : undefined,
            };
        }
        if (payload.kind === "video" && typeof payload.url === "string") {
            return {
                kind: "video",
                url: payload.url,
                title,
                storageKey: typeof payload.storageKey === "string" ? payload.storageKey : undefined,
                width: typeof payload.width === "number" ? payload.width : undefined,
                height: typeof payload.height === "number" ? payload.height : undefined,
            };
        }
        return null;
    } catch {
        return null;
    }
}

export function MyAssetsPanel({ onInsert, compact = false }: MyAssetsPanelProps) {
    const { message } = App.useApp();
    const assets = useAssetStore((state) => state.assets);
    const folders = useAssetStore((state) => state.folders);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const createImageInputRef = useRef<HTMLInputElement>(null);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [folderFilter, setFolderFilter] = useState<AssetFolderFilter>("all");
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkFolderValue, setBulkFolderValue] = useState<string>(BULK_UNCATEGORIZED_VALUE);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createKind, setCreateKind] = useState<CreateKind>("text");
    const [createTitle, setCreateTitle] = useState("");
    const [createContent, setCreateContent] = useState("");
    const [createTags, setCreateTags] = useState<string[]>([]);
    const [createFolderId, setCreateFolderId] = useState<string | null>(null);
    const [createImageDraft, setCreateImageDraft] = useState<ImageDraft | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const pageSize = compact ? 12 : 8;

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video")
            .filter((asset) => kindFilter === "all" || asset.kind === kindFilter)
            .filter((asset) => matchesAssetFolder(asset.folderId, folderFilter))
            .filter((asset) => !query || [asset.title, asset.source || "", asset.note || "", ...(asset.tags || [])].join(" ").toLowerCase().includes(query));
    }, [assets, folderFilter, keyword, kindFilter]);

    const visible = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
    const selectedAssets = useMemo(() => assets.filter((asset) => selectedIds.has(asset.id)), [assets, selectedIds]);
    const folderSelectOptions = useMemo(() => [{ value: BULK_UNCATEGORIZED_VALUE, label: "未分类" }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))], [folders]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filtered.length, pageSize]);

    useEffect(() => {
        const availableIds = new Set(assets.map((asset) => asset.id));
        setSelectedIds((current) => {
            const next = new Set(Array.from(current).filter((id) => availableIds.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [assets]);

    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        window.addEventListener("pointerdown", close);
        window.addEventListener("scroll", close, true);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [contextMenu]);

    const moveAssetsToFolder = useCallback(
        (assetIds: string[], folderId: string | null) => {
            const ids = Array.from(new Set(assetIds)).filter((id) => assets.some((asset) => asset.id === id));
            if (!ids.length) return;
            ids.forEach((id) => updateAsset(id, { folderId }));
            setSelectedIds(new Set());
            message.success(folderId ? `已移动 ${ids.length} 个资产到分类` : `已移动 ${ids.length} 个资产到未分类`);
        },
        [assets, message, updateAsset],
    );

    const deleteSelectedAssets = () => {
        const ids = selectedAssets.map((asset) => asset.id);
        ids.forEach(removeAsset);
        setSelectedIds(new Set());
        message.success(`已删除 ${ids.length} 个资产`);
    };

    const openCreateAsset = useCallback(() => {
        setContextMenu(null);
        setCreateKind("text");
        setCreateTitle("");
        setCreateContent("");
        setCreateTags([]);
        setCreateImageDraft(null);
        setCreateFolderId(folderFilterToFolderId(folderFilter));
        setCreateOpen(true);
    }, [folderFilter]);

    const handleCreateContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, .ant-select, .ant-pagination, .ant-modal, .ant-popconfirm, [data-asset-no-context]")) return;
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
    };

    const uploadCreateImage = useCallback(
        async (file?: File) => {
            if (!file) return;
            if (!file.type.startsWith("image/")) {
                message.warning("请选择图片文件");
                return;
            }
            setUploadingImage(true);
            try {
                const uploaded = await uploadImage(file, { source: "upload" });
                setCreateImageDraft({ ...uploaded, fileName: file.name });
                setCreateKind("image");
                setCreateTitle((value) => value || stripExtension(file.name));
            } catch (error) {
                message.error(error instanceof Error ? error.message : "图片读取失败");
            } finally {
                setUploadingImage(false);
            }
        },
        [message],
    );

    const handleCreateDrop = (event: ReactDragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
        void uploadCreateImage(file);
    };

    const handleCreatePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
        if (!file) return;
        event.preventDefault();
        void uploadCreateImage(file);
    };

    const saveCreatedAsset = () => {
        const title = createTitle.trim();
        const content = createContent.trim();
        if (!title) {
            message.warning("请输入标题");
            return;
        }
        if (createKind === "image") {
            if (!createImageDraft) {
                message.warning("请先添加图片");
                return;
            }
            addAsset({
                kind: "image",
                title,
                coverUrl: createImageDraft.url,
                tags: createTags,
                folderId: createFolderId,
                source: "手动添加",
                data: {
                    dataUrl: createImageDraft.url,
                    storageKey: createImageDraft.storageKey,
                    width: createImageDraft.width,
                    height: createImageDraft.height,
                    bytes: createImageDraft.bytes,
                    mimeType: createImageDraft.mimeType,
                },
                metadata: { source: "manual", prompt: content },
            });
        } else {
            if (!content) {
                message.warning("请输入文本内容");
                return;
            }
            addAsset({
                kind: "text",
                title,
                coverUrl: "",
                tags: createTags,
                folderId: createFolderId,
                source: "手动添加",
                data: { content },
                metadata: { source: "manual" },
            });
        }
        setCreateOpen(false);
        message.success("资产已创建");
    };

    const copyCreateContent = async () => {
        if (!createContent.trim()) return;
        await navigator.clipboard.writeText(createContent);
        message.success("内容已复制");
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-3" onContextMenu={handleCreateContextMenu}>
            <AssetFolderBar
                className="thin-scrollbar max-h-24 overflow-y-auto pr-1"
                buttonClassName="canvas-asset-surface-button"
                value={folderFilter}
                onChange={(value) => {
                    setFolderFilter(value);
                    setPage(1);
                }}
                onDropAssets={moveAssetsToFolder}
            />
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className={compact ? "canvas-asset-search min-w-[150px] flex-1" : "w-56"}
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索资产"
                    value={keyword}
                    allowClear
                    onChange={(event) => {
                        setPage(1);
                        setKeyword(event.target.value);
                    }}
                />
                <Button size="small" className="canvas-asset-surface-button" icon={<Plus className="size-3.5" />} onClick={openCreateAsset}>
                    新建资产
                </Button>
                <div className="flex flex-wrap gap-1.5">
                    {kindOptions.map((option) => (
                        <Tag.CheckableTag
                            key={option.value}
                            checked={kindFilter === option.value}
                            className={cn("prompt-filter-tag canvas-asset-filter-tag", kindFilter === option.value && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(option.value);
                            }}
                        >
                            {option.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>

            {selectedIds.size ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-2 text-xs" data-asset-no-context>
                    <span className="font-medium text-cyan-100">已选 {selectedIds.size} 个</span>
                    <Select size="small" className="min-w-[128px]" value={bulkFolderValue} options={folderSelectOptions} onChange={setBulkFolderValue} />
                    <Button size="small" className="canvas-asset-surface-button" icon={<FolderInput className="size-3.5" />} onClick={() => moveAssetsToFolder(Array.from(selectedIds), folderValueToFolderId(bulkFolderValue))}>
                        移动
                    </Button>
                    <Popconfirm title={`删除 ${selectedIds.size} 个资产？`} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={deleteSelectedAssets}>
                        <Button size="small" danger icon={<Trash2 className="size-3.5" />}>
                            删除
                        </Button>
                    </Popconfirm>
                    <Button size="small" type="text" className="canvas-asset-ghost-button" icon={<X className="size-3.5" />} onClick={() => setSelectedIds(new Set())}>
                        取消
                    </Button>
                </div>
            ) : (
                <div className="flex items-center justify-between gap-2 text-xs text-stone-400">
                    <span>共 {filtered.length} 个资产</span>
                    {visible.length ? (
                        <Button size="small" type="text" className="canvas-asset-ghost-button" icon={<CheckSquare className="size-3.5" />} onClick={() => setSelectedIds(new Set(visible.map((asset) => asset.id)))}>
                            选择本页
                        </Button>
                    ) : null}
                </div>
            )}

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" onWheelCapture={(event) => event.stopPropagation()}>
                {visible.length ? (
                    <div className={compact ? "grid grid-cols-[repeat(auto-fill,minmax(142px,1fr))] gap-3" : "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3"}>
                        {visible.map((asset) => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                selected={selectedIds.has(asset.id)}
                                selectedIds={selectedIds}
                                onInsert={() => onInsert(assetToInsertPayload(asset))}
                                onToggleSelected={() => {
                                    setSelectedIds((current) => {
                                        const next = new Set(current);
                                        if (next.has(asset.id)) next.delete(asset.id);
                                        else next.add(asset.id);
                                        return next;
                                    });
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有资产" className="py-12" />
                )}
            </div>

            {filtered.length > pageSize ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={pageSize} total={filtered.length} onChange={setPage} showSizeChanger={false} />
                </div>
            ) : null}

            {contextMenu ? (
                <div
                    className="fixed z-[140] min-w-36 overflow-hidden rounded-xl border border-white/10 bg-stone-950/95 py-1 text-sm text-stone-100 shadow-2xl backdrop-blur"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/10" onClick={openCreateAsset}>
                        <Plus className="size-4" />
                        <span>新建资产</span>
                    </button>
                </div>
            ) : null}

            <Modal
                title="新建资产"
                open={createOpen}
                width={720}
                onCancel={() => setCreateOpen(false)}
                onOk={saveCreatedAsset}
                okText="保存"
                cancelText="取消"
                destroyOnHidden
                footer={[
                    <Button key="copy" className="canvas-asset-surface-button" disabled={!createContent.trim()} onClick={() => void copyCreateContent()}>
                        复制内容
                    </Button>,
                    <Button key="cancel" onClick={() => setCreateOpen(false)}>
                        取消
                    </Button>,
                    <Button key="save" type="primary" onClick={saveCreatedAsset}>
                        保存
                    </Button>,
                ]}
            >
                <div className="space-y-4" onPaste={handleCreatePaste}>
                    <Segmented
                        value={createKind}
                        options={[
                            { label: "文本", value: "text" },
                            { label: "图片", value: "image" },
                        ]}
                        onChange={(value) => setCreateKind(value as CreateKind)}
                    />
                    <div
                        className={cn(
                            "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center transition",
                            createImageDraft ? "border-cyan-300/60 bg-cyan-300/5" : "border-stone-600 bg-stone-950/30 hover:border-stone-400",
                        )}
                        onClick={() => createImageInputRef.current?.click()}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleCreateDrop}
                    >
                        {createImageDraft ? (
                            <div className="flex w-full items-center gap-4 text-left">
                                <img src={createImageDraft.url} alt="" className="h-28 w-36 rounded-lg object-cover" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{createImageDraft.fileName || "已添加图片"}</div>
                                    <div className="mt-1 text-xs text-stone-400">
                                        {createImageDraft.width}x{createImageDraft.height}
                                        {formatBytes(createImageDraft.bytes) ? ` · ${formatBytes(createImageDraft.bytes)}` : ""}
                                    </div>
                                    <Button
                                        size="small"
                                        className="mt-3"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setCreateImageDraft(null);
                                        }}
                                    >
                                        移除图片
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <UploadCloud className="mb-3 size-8 text-stone-400" />
                                <div className="text-sm font-medium">图片原件</div>
                                <div className="mt-1 text-xs text-stone-500">PNG / JPG / WebP</div>
                            </>
                        )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm font-medium">
                            <span>标题</span>
                            <Input value={createTitle} placeholder="给资产起一个名字" onChange={(event) => setCreateTitle(event.target.value)} />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">
                            <span>分类</span>
                            <Select value={createFolderId || BULK_UNCATEGORIZED_VALUE} options={folderSelectOptions} onChange={(value) => setCreateFolderId(folderValueToFolderId(value))} />
                        </label>
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium">
                        <span>{createKind === "image" ? "提示词/备注" : "文本内容"}</span>
                        <Input.TextArea rows={7} value={createContent} placeholder={createKind === "image" ? "可选：记录这张图的提示词、用途或备注" : "保存提示词、参考文案或创作资料"} onChange={(event) => setCreateContent(event.target.value)} />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        <span>标签</span>
                        <Select mode="tags" value={createTags} tokenSeparators={[",", "，"]} placeholder="输入后回车" onChange={setCreateTags} />
                    </label>
                </div>
                <input
                    ref={createImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(event) => {
                        void uploadCreateImage(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </Modal>
        </div>
    );
}

function AssetCard({ asset, selected, selectedIds, onInsert, onToggleSelected }: { asset: Asset; selected: boolean; selectedIds: Set<string>; onInsert: () => void; onToggleSelected: () => void }) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const payload = assetToInsertPayload(asset);

    const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
        const ids = selectedIds.has(asset.id) ? Array.from(selectedIds) : [asset.id];
        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData(CANVAS_ASSET_DRAG_TYPE, serializeAssetDragPayload(payload));
        event.dataTransfer.setData(ASSET_FOLDER_DROP_DRAG_TYPE, JSON.stringify(ids));
        event.dataTransfer.setData("text/plain", asset.title);
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onInsert();
    };

    return (
        <div
            role="button"
            tabIndex={0}
            draggable
            className={cn(
                "canvas-asset-card group relative min-w-0 cursor-grab overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md active:cursor-grabbing dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500",
                selected && "border-cyan-300 ring-2 ring-cyan-300/50",
            )}
            onClick={onInsert}
            onKeyDown={handleKeyDown}
            onDragStart={handleDragStart}
            title="点击插入，或拖到画布指定位置"
        >
            <button
                type="button"
                className={cn(
                    "absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-full border text-xs shadow-sm backdrop-blur transition",
                    selected ? "border-cyan-300 bg-cyan-300 text-stone-950 opacity-100" : "border-white/50 bg-stone-950/45 text-white opacity-0 hover:bg-stone-900 group-hover:opacity-100",
                )}
                aria-pressed={selected}
                aria-label={selected ? "取消选择资产" : "选择资产"}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelected();
                }}
            >
                {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
            </button>
            {cover ? (
                <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" draggable={false} />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    {asset.kind === "video" ? <Video className="size-8 opacity-45" /> : asset.kind === "image" ? <ImageIcon className="size-8 opacity-45" /> : <FileText className="size-8 opacity-45" />}
                </div>
            )}
            <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 min-w-0 text-xs font-medium text-stone-800 dark:text-stone-200">{asset.title}</span>
                    <Tag className="m-0 shrink-0 text-[10px]">{asset.kind === "image" ? "图片" : asset.kind === "video" ? "视频" : "文本"}</Tag>
                </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/55 group-hover:opacity-100">拖拽或插入</div>
        </div>
    );
}

function folderFilterToFolderId(filter: AssetFolderFilter) {
    return filter === "all" || filter === "uncategorized" ? null : filter;
}

function folderValueToFolderId(value: string) {
    return value === BULK_UNCATEGORIZED_VALUE ? null : value;
}

function stripExtension(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "");
}
