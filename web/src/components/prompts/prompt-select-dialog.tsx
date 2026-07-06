"use client";

import { Check, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal } from "antd";

import { AssetFolderBar, matchesAssetFolder, type AssetFolderFilter } from "@/components/asset-folder-bar";
import { useAssetStore } from "@/stores/use-asset-store";

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const { message } = App.useApp();
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [keyword, setKeyword] = useState("");
    const [folderFilter, setFolderFilter] = useState<AssetFolderFilter>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftPrompt, setDraftPrompt] = useState("");

    const promptAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((asset) => asset.kind === "text")
            .filter((asset) => matchesAssetFolder(asset.folderId, folderFilter))
            .filter((asset) => !query || [asset.title, asset.data.content, ...(asset.tags || [])].join(" ").toLowerCase().includes(query));
    }, [assets, folderFilter, keyword]);

    const selectPrompt = (prompt: string) => {
        onSelect(prompt);
        onOpenChange(false);
    };

    const createPrompt = () => {
        const content = draftPrompt.trim();
        if (!content) {
            message.warning("请输入提示词内容");
            return;
        }
        const folderId = folderFilter !== "all" && folderFilter !== "uncategorized" ? folderFilter : null;
        addAsset({
            kind: "text",
            title: draftTitle.trim() || content.slice(0, 32) || "未命名提示词",
            coverUrl: "",
            tags: [],
            folderId,
            source: "我的资产",
            data: { content },
            metadata: { source: "user-prompt-library" },
        });
        setDraftTitle("");
        setDraftPrompt("");
        setCreateOpen(false);
        message.success("提示词已加入我的资产");
    };

    return (
        <>
            <Modal title="提示词库" open={open} onCancel={() => onOpenChange(false)} footer={null} width={960} centered>
                <div data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-3">
                        <Input
                            className="min-w-[260px] flex-1"
                            size="large"
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value)}
                            placeholder="搜索我的提示词资产"
                            allowClear
                        />
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新增提示词
                        </Button>
                    </div>
                    <div className="mt-5">
                        <AssetFolderBar value={folderFilter} onChange={setFolderFilter} />
                    </div>
                    <div className="thin-scrollbar mt-6 max-h-[520px] overflow-y-auto pr-2" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                        {promptAssets.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {promptAssets.map((asset) => (
                                    <button
                                        key={asset.id}
                                        type="button"
                                        className="group flex min-h-44 flex-col rounded-xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
                                        onClick={() => selectPrompt(asset.data.content)}
                                    >
                                        <div className="line-clamp-2 text-sm font-semibold text-stone-900 dark:text-stone-100">{asset.title}</div>
                                        <div className="mt-3 line-clamp-5 flex-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{asset.data.content}</div>
                                        <div className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 dark:bg-stone-100 dark:text-stone-900">
                                            <Check className="size-3.5" />
                                            使用此提示词
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有提示词资产" className="py-12" />
                        )}
                    </div>
                </div>
            </Modal>

            <Modal title="新增提示词" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createPrompt} okText="加入我的资产" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <Input value={draftTitle} placeholder="标题，可留空" onChange={(event) => setDraftTitle(event.target.value)} />
                    <Input.TextArea value={draftPrompt} placeholder="粘贴或输入提示词内容" autoSize={{ minRows: 6, maxRows: 12 }} onChange={(event) => setDraftPrompt(event.target.value)} />
                    <div className="text-xs text-stone-500">会保存到当前选中的资产分类；选择“全部”或“未分类”时保存为未分类。</div>
                </div>
            </Modal>
        </>
    );
}
