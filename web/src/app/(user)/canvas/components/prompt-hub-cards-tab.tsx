"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Input, Pagination, Select, Spin, message } from "antd";
import { Search } from "lucide-react";

import { uploadImage } from "@/services/image-storage";
import {
    listPromptHubCards,
    listPromptHubGroups,
    listPromptHubTags,
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
    tags,
    loading,
    onClick,
}: {
    title: string;
    cover: string;
    promptPreview: string;
    tags?: string[];
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
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">缩略图加载中…</div>
            )}
            <div className="space-y-1 p-2.5">
                <div className="line-clamp-1 text-xs font-medium text-stone-800 dark:text-stone-200">{title || "未命名卡片"}</div>
                {promptPreview ? (
                    <div className="line-clamp-3 text-[10px] leading-4 text-stone-500 dark:text-stone-400">{promptPreview}</div>
                ) : (
                    <div className="text-[10px] text-stone-400">暂无提示词</div>
                )}
                {tags?.length ? (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                        {tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                {tag}
                            </span>
                        ))}
                    </div>
                ) : null}
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
    const [searchDraft, setSearchDraft] = useState("");
    const [group, setGroup] = useState<string>("");
    const [tag, setTag] = useState<string>("");
    const [groups, setGroups] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [cards, setCards] = useState<PromptHubCardListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [insertingId, setInsertingId] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            const active = await getSession();
            if (!active) {
                setGroups([]);
                setTags([]);
                return;
            }
            try {
                const [g, t] = await Promise.all([
                    listPromptHubGroups(active, { apiBase }),
                    listPromptHubTags(active, { apiBase }),
                ]);
                setGroups(g);
                setTags(t);
            } catch {
                /* 筛选可选，失败不阻塞列表 */
            }
        })();
    }, [apiBase, getSession, session?.access_token]);

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
                group: group || undefined,
                tag: tag || undefined,
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
    }, [apiBase, getSession, group, keyword, page, tag]);

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

    const groupOptions = [
        { value: "", label: "全部分组" },
        { value: "uncategorized", label: "未分类" },
        ...groups.map((g) => ({ value: g, label: g })),
    ];
    const tagOptions = [{ value: "", label: "全部标签" }, ...tags.map((t) => ({ value: t, label: t }))];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索标题或提示词"
                    value={searchDraft}
                    allowClear
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onPressEnter={() => {
                        setPage(1);
                        setKeyword(searchDraft);
                    }}
                />
                <Select
                    size="small"
                    className="min-w-[120px]"
                    value={group}
                    options={groupOptions}
                    onChange={(value) => {
                        setPage(1);
                        setGroup(value);
                    }}
                />
                <Select
                    size="small"
                    className="min-w-[120px]"
                    value={tag}
                    options={tagOptions}
                    onChange={(value) => {
                        setPage(1);
                        setTag(value);
                    }}
                />
                <Button
                    size="small"
                    loading={loading}
                    onClick={() => {
                        setPage(1);
                        setKeyword(searchDraft);
                    }}
                >
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
                            tags={card.tags}
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
