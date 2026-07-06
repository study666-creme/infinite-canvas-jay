"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { Empty, Input, Pagination, Tag } from "antd";
import { FileText, Image as ImageIcon, Search, Video } from "lucide-react";

import { cn } from "@/lib/utils";
import { AssetFolderBar, matchesAssetFolder, type AssetFolderFilter } from "@/components/asset-folder-bar";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export const CANVAS_ASSET_DRAG_TYPE = "application/x-infinite-canvas-asset";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string }
    | { kind: "image"; dataUrl: string; title: string; prompt?: string; storageKey?: string }
    | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number };

type MyAssetsPanelProps = {
    onInsert: (payload: InsertAssetPayload) => void;
    compact?: boolean;
};

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
    const assets = useAssetStore((state) => state.assets);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [folderFilter, setFolderFilter] = useState<AssetFolderFilter>("all");
    const [page, setPage] = useState(1);
    const pageSize = compact ? 10 : 8;

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video")
            .filter((asset) => kindFilter === "all" || asset.kind === kindFilter)
            .filter((asset) => matchesAssetFolder(asset.folderId, folderFilter))
            .filter((asset) => !query || [asset.title, ...(asset.tags || [])].join(" ").toLowerCase().includes(query));
    }, [assets, folderFilter, keyword, kindFilter]);

    const visible = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filtered.length, pageSize]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <AssetFolderBar
                value={folderFilter}
                onChange={(value) => {
                    setFolderFilter(value);
                    setPage(1);
                }}
            />
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className={compact ? "min-w-0 flex-1" : "w-56"}
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
                <div className="flex flex-wrap gap-1.5">
                    {kindOptions.map((option) => (
                        <Tag.CheckableTag
                            key={option.value}
                            checked={kindFilter === option.value}
                            className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")}
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

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                {visible.length ? (
                    <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-4 gap-3"}>
                        {visible.map((asset) => (
                            <AssetCard key={asset.id} asset={asset} onInsert={() => onInsert(assetToInsertPayload(asset))} />
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
        </div>
    );
}

function AssetCard({ asset, onInsert }: { asset: Asset; onInsert: () => void }) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const payload = assetToInsertPayload(asset);

    const handleDragStart = (event: ReactDragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(CANVAS_ASSET_DRAG_TYPE, serializeAssetDragPayload(payload));
        event.dataTransfer.setData("text/plain", asset.title);
    };

    return (
        <button
            type="button"
            draggable
            className="group relative min-w-0 cursor-grab overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md active:cursor-grabbing dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
            onClick={onInsert}
            onDragStart={handleDragStart}
            title="点击插入，或拖到画布指定位置"
        >
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
        </button>
    );
}
