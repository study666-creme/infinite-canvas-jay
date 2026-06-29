"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Input, Pagination, Spin, message } from "antd";
import { Search } from "lucide-react";

import { uploadImage } from "@/services/image-storage";
import {
    listPromptHubCards,
    preparePromptHubCardForCanvas,
    type PromptHubCardListItem,
} from "@/services/prompt-hub";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";
import type { InsertAssetPayload } from "./asset-picker-modal";

const PAGE_SIZE = 12;

type Props = {
    onInsert: (payload: InsertAssetPayload) => void;
};

function PickerCard({
    title,
    cover,
    promptPreview,
    loading,
    onClick,
}: {
    title: string;
    cover: string;
    promptPreview: string;
    loading?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={loading}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md disabled:cursor-wait disabled:opacity-70 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
            onClick={onClick}
        >
            {cover ? (
                <img src={cover} alt={title} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">无缩略图</div>
            )}
            <div className="space-y-1 p-2.5">
                <div className="line-clamp-1 text-xs font-medium text-stone-800 dark:text-stone-200">{title || "未命名卡片"}</div>
                {promptPreview ? <div className="line-clamp-2 text-[10px] leading-4 text-stone-500 dark:text-stone-400">{promptPreview}</div> : null}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/55 group-hover:opacity-100">
                {loading ? "插入中…" : "插入图片+提示词"}
            </div>
        </button>
    );
}

export function PromptHubCardsTab({ onInsert }: Props) {
    const session = usePromptHubStore((state) => state.session);
    const apiBase = usePromptHubStore((state) => state.apiBase);
    const getSession = usePromptHubStore((state) => state.getSession);
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [cards, setCards] = useState<PromptHubCardListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [insertingId, setInsertingId] = useState<string | null>(null);

    const loadCards = useCallback(async () => {
        const active = await getSession();
        if (!active) {
            setCards([]);
            setTotal(0);
            return;
        }
        setLoading(true);
        try {
            const result = await listPromptHubCards(active, {
                apiBase,
                page,
                limit: PAGE_SIZE,
                q: keyword.trim() || undefined,
            });
            setCards(result.cards);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载卡片库失败");
            setCards([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [apiBase, getSession, keyword, page]);

    useEffect(() => {
        void loadCards();
    }, [loadCards]);

    const handleInsert = async (card: PromptHubCardListItem) => {
        const active = await getSession();
        if (!active) {
            message.warning("请先在设置 → Prompt Hub 连接账号");
            return;
        }
        setInsertingId(card.id);
        try {
            const prepared = await preparePromptHubCardForCanvas(card, active, { apiBase });
            const uploaded = await uploadImage(prepared.blob, { source: "upload" });
            onInsert({
                kind: "image",
                dataUrl: uploaded.url,
                storageKey: uploaded.storageKey,
                title: prepared.title,
                prompt: prepared.prompt,
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "插入失败");
        } finally {
            setInsertingId(null);
        }
    };

    if (!session?.access_token) {
        return (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未连接 Prompt Hub" />
                <p className="max-w-md text-xs leading-5 text-stone-500">请打开右上角设置 → Prompt Hub，用卡藏账号登录后再从卡片库插入。</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-64"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索标题或提示词"
                    value={keyword}
                    allowClear
                    onChange={(e) => {
                        setPage(1);
                        setKeyword(e.target.value);
                    }}
                    onPressEnter={() => void loadCards()}
                />
                <Button size="small" loading={loading} onClick={() => void loadCards()}>
                    搜索
                </Button>
                <span className="text-xs text-stone-500">共 {total} 张有图卡片</span>
            </div>

            {loading && !cards.length ? (
                <div className="flex min-h-[280px] items-center justify-center">
                    <Spin />
                </div>
            ) : cards.length ? (
                <div className="grid grid-cols-4 gap-3">
                    {cards.map((card) => (
                        <PickerCard
                            key={card.id}
                            title={card.title || card.prompt.slice(0, 24) || "未命名"}
                            cover={card.thumbUrl}
                            promptPreview={card.prompt}
                            loading={insertingId === card.id}
                            onClick={() => void handleInsert(card)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的卡片" className="py-12" />
            )}

            {total > PAGE_SIZE ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} />
                </div>
            ) : null}
        </div>
    );
}
