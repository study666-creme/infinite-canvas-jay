"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Pagination, Select, Spin, message } from "antd";
import { Check, Search } from "lucide-react";

import { uploadImage } from "@/services/image-storage";
import {
    listPromptHubCards,
    listPromptHubGroups,
    listPromptHubTags,
    preparePromptHubCardForCanvas,
    type PromptHubCardListItem,
} from "@/services/prompt-hub";
import { useAssetStore } from "@/stores/use-asset-store";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";

const PAGE_SIZE = 12;

function PickerCard({
    title,
    cover,
    promptPreview,
    tags,
    loading,
    saved,
    textOnly,
    onClick,
}: {
    title: string;
    cover: string;
    promptPreview: string;
    tags?: string[];
    loading?: boolean;
    saved?: boolean;
    textOnly?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={loading || saved}
            className="group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md disabled:cursor-default disabled:opacity-70 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
            onClick={onClick}
        >
            {textOnly ? (
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-50 p-4 text-center text-xs leading-5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    纯提示词卡片
                </div>
            ) : cover ? (
                <img src={cover} alt={title} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">缩略图加载中…</div>
            )}
            <div className="space-y-1 p-2.5">
                <div className="flex items-center gap-1.5">
                    <div className="line-clamp-1 min-w-0 flex-1 text-xs font-medium text-stone-800 dark:text-stone-200">{title || "未命名卡片"}</div>
                    {saved ? <Check className="size-3.5 shrink-0 text-emerald-500" /> : null}
                </div>
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
                {saved ? "已在我的资产" : loading ? "保存中…" : "添加到我的资产"}
            </div>
        </button>
    );
}

export function PromptHubCardsTab({ compact = false }: { compact?: boolean } = {}) {
    const session = usePromptHubStore((state) => state.session);
    const apiBase = usePromptHubStore((state) => state.apiBase);
    const getSession = usePromptHubStore((state) => state.getSession);
    const addAsset = useAssetStore((state) => state.addAsset);
    const assets = useAssetStore((state) => state.assets);
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
    const [savingId, setSavingId] = useState<string | null>(null);

    const savedCardIds = useMemo(() => {
        const ids = new Set<string>();
        assets.forEach((asset) => {
            const id = asset.metadata?.promptHubCardId;
            if (typeof id === "string") ids.add(id);
        });
        return ids;
    }, [assets]);

    useEffect(() => {
        void (async () => {
            const active = await getSession();
            if (!active) {
                setGroups([]);
                setTags([]);
                return;
            }
            try {
                const [nextGroups, nextTags] = await Promise.all([
                    listPromptHubGroups(active, { apiBase }),
                    listPromptHubTags(active, { apiBase }),
                ]);
                setGroups(nextGroups);
                setTags(nextTags);
            } catch {
                // Filters are optional; failing them should not block the card list.
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

    const saveCardToAssets = async (card: PromptHubCardListItem) => {
        if (savedCardIds.has(card.id)) {
            message.info("这张卡片已经在我的资产里");
            return;
        }
        const active = await getSession();
        if (!active) {
            message.warning("请先在设置 -> Prompt Hub 连接账号");
            return;
        }
        setSavingId(card.id);
        try {
            const prepared = await preparePromptHubCardForCanvas(card, active, { apiBase });
            const tags = card.tags || [];
            if (prepared.kind === "text") {
                addAsset({
                    kind: "text",
                    title: prepared.title,
                    coverUrl: "",
                    tags,
                    source: "Prompt Hub",
                    data: { content: prepared.prompt },
                    metadata: { source: "prompt-hub", promptHubCardId: card.id, group: card.group || null },
                });
                message.success("已添加到我的资产");
                return;
            }

            const uploaded = await uploadImage(prepared.blob, { source: "upload" });
            addAsset({
                kind: "image",
                title: prepared.title,
                coverUrl: uploaded.url,
                tags,
                source: "Prompt Hub",
                data: {
                    dataUrl: uploaded.url,
                    storageKey: uploaded.storageKey,
                    width: uploaded.width,
                    height: uploaded.height,
                    bytes: uploaded.bytes,
                    mimeType: uploaded.mimeType,
                },
                metadata: { source: "prompt-hub", promptHubCardId: card.id, prompt: prepared.prompt, group: card.group || null },
            });
            message.success("已添加到我的资产");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "添加到我的资产失败");
        } finally {
            setSavingId(null);
        }
    };

    if (!session?.access_token) {
        return (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未连接 Prompt Hub" />
                <p className="max-w-md text-xs leading-5 text-stone-500">请打开右上角设置 → Prompt Hub，用卡藏账号登录后再添加卡片。</p>
            </div>
        );
    }

    const groupOptions = [
        { value: "", label: "全部分组" },
        { value: "uncategorized", label: "未分类" },
        ...groups.map((item) => ({ value: item, label: item })),
    ];
    const tagOptions = [{ value: "", label: "全部标签" }, ...tags.map((item) => ({ value: item, label: item }))];

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="min-w-[180px] flex-1"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索标题或提示词"
                    value={searchDraft}
                    allowClear
                    onChange={(event) => setSearchDraft(event.target.value)}
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
                <span className="text-xs text-stone-500">共 {total} 张</span>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                {loading && !cards.length ? (
                    <div className="flex min-h-[280px] items-center justify-center">
                        <Spin />
                    </div>
                ) : cards.length ? (
                    <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
                        {cards.map((card) => (
                            <PickerCard
                                key={card.id}
                                title={card.title || card.prompt.slice(0, 24) || "未命名卡片"}
                                cover={card.thumbUrl}
                                promptPreview={card.prompt}
                                tags={card.tags}
                                textOnly={card.hasImage === false || !String(card.imageRef || "").trim()}
                                loading={savingId === card.id}
                                saved={savedCardIds.has(card.id)}
                                onClick={() => void saveCardToAssets(card)}
                            />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的卡片" className="py-12" />
                )}
            </div>

            {total > PAGE_SIZE ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} />
                </div>
            ) : null}
        </div>
    );
}
