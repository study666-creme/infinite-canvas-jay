"use client";

import { App, Button, Form, InputNumber, Select, Switch } from "antd";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { pricingUnitLabel, type ModelPricingRule } from "@/constant/credits";
import { clearExportFolder, exportFolderSupported, getExportFolderStats, pickExportFolder, type LocalFolderKind } from "@/services/export-folder";
import { formatLocalFolderPath, type LocalFolderStats } from "@/services/local-media-store";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { nanoid } from "nanoid";

function LocalFolderPanel({
    title,
    kind,
    enabled,
    onToggle,
    onChoose,
    onClear,
    stats,
    supported,
}: {
    title: string;
    kind: LocalFolderKind;
    enabled: boolean;
    onToggle: (checked: boolean) => void;
    onChoose: () => void;
    onClear: () => void;
    stats: LocalFolderStats | null;
    supported: boolean;
}) {
    return (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <div className="mb-3 text-sm font-semibold">{title}</div>
            <div className="flex flex-wrap items-center gap-2">
                <Switch checked={enabled && Boolean(stats?.name)} disabled={!stats?.name} onChange={onToggle} />
                <span className="text-sm text-stone-500">启用后，上传/生成的文件写入本地文件夹，并从本地读取</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button icon={<FolderOpen className="size-4" />} disabled={!supported} onClick={onChoose}>
                    选择文件夹
                </Button>
                {stats?.name ? (
                    <Button type="text" size="small" onClick={onClear}>
                        清除
                    </Button>
                ) : null}
            </div>
            {stats?.name ? (
                <div className="mt-3 space-y-2 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-3 text-xs dark:border-stone-800 dark:bg-stone-900/40">
                    <div className="grid gap-1 sm:grid-cols-[88px_1fr]">
                        <span className="text-stone-500">文件夹名</span>
                        <span className="font-medium text-stone-800 dark:text-stone-100">{stats.name}</span>
                        <span className="text-stone-500">保存路径</span>
                        <span className="break-all font-mono text-stone-700 dark:text-stone-200">{formatLocalFolderPath(stats.name)}</span>
                        <span className="text-stone-500">文件数量</span>
                        <span>{stats.fileCount} 个</span>
                    </div>
                    {stats.sampleFiles.length ? (
                        <div>
                            <div className="mb-1 text-stone-500">最近保存的文件</div>
                            <ul className="space-y-1 font-mono text-[11px] leading-5 text-stone-700 dark:text-stone-200">
                                {stats.sampleFiles.map((filename) => (
                                    <li key={filename} className="break-all rounded bg-white/70 px-2 py-1 dark:bg-black/20">
                                        {formatLocalFolderPath(stats.name, filename)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="text-stone-400">暂无文件，上传或生成后会显示在这里</div>
                    )}
                    <div className="text-[11px] leading-5 text-stone-400">浏览器安全限制无法显示完整磁盘路径（如 D:\...），但文件会保存在你选择的文件夹内。</div>
                </div>
            ) : (
                <div className="mt-3 text-sm text-stone-400">未选择（将使用浏览器缓存）</div>
            )}
        </section>
    );
}

export function ExportFolderSettingsPanel() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [imageStats, setImageStats] = useState<LocalFolderStats | null>(null);
    const [videoStats, setVideoStats] = useState<LocalFolderStats | null>(null);
    const supported = exportFolderSupported();

    const refreshStats = useCallback(async () => {
        setImageStats(await getExportFolderStats("image"));
        setVideoStats(await getExportFolderStats("video"));
    }, []);

    useEffect(() => {
        void refreshStats();
    }, [refreshStats]);

    const chooseFolder = async (kind: LocalFolderKind) => {
        try {
            await pickExportFolder(kind);
            if (kind === "image") updateConfig("autoExportImage", true);
            else updateConfig("autoExportVideo", true);
            await refreshStats();
            message.success(`已选择${kind === "image" ? "图片" : "视频/音频"}本地文件夹`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "选择文件夹失败");
        }
    };

    const resetFolder = async (kind: LocalFolderKind) => {
        await clearExportFolder(kind);
        if (kind === "image") updateConfig("autoExportImage", false);
        else updateConfig("autoExportVideo", false);
        await refreshStats();
        message.success(`已清除${kind === "image" ? "图片" : "视频/音频"}本地文件夹`);
    };

    return (
        <Form layout="vertical" requiredMark={false}>
            {!supported ? (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                    当前浏览器不支持本地文件夹读写，请使用 Chrome 或 Edge。未配置时会退回浏览器缓存（不推荐）。
                </div>
            ) : (
                <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-300">
                    选择文件夹后，上传素材、AI 生成内容、画布重新打开都会优先读写本地文件。下方会显示当前文件夹名和最近保存的文件名。
                </div>
            )}
            <LocalFolderPanel title="图片本地存储" kind="image" enabled={config.autoExportImage} stats={imageStats} supported={supported} onToggle={(checked) => updateConfig("autoExportImage", checked)} onChoose={() => void chooseFolder("image")} onClear={() => void resetFolder("image")} />
            <div className="mt-4">
                <LocalFolderPanel title="视频 / 音频本地存储" kind="video" enabled={config.autoExportVideo} stats={videoStats} supported={supported} onToggle={(checked) => updateConfig("autoExportVideo", checked)} onChoose={() => void chooseFolder("video")} onClear={() => void resetFolder("video")} />
            </div>
        </Form>
    );
}

export function ModelPricingSettingsPanel() {
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const rules = config.modelPricing || [];

    const modelSelectOptions = [
        {
            label: "图片模型",
            options: selectableModelsByCapability(config, "image").map((model) => ({
                label: modelOptionLabel(config, model),
                value: modelOptionName(model),
            })),
        },
        {
            label: "视频模型",
            options: selectableModelsByCapability(config, "video").map((model) => ({
                label: modelOptionLabel(config, model),
                value: modelOptionName(model),
            })),
        },
    ].filter((group) => group.options.length);

    const updateRules = (next: ModelPricingRule[]) => updateConfig("modelPricing", next);

    const addRule = () => {
        const defaultModel = modelSelectOptions[0]?.options[0]?.value || "";
        updateRules([...rules, { id: nanoid(), model: defaultModel, unit: "second", credits: 14 }]);
    };

    const updateRule = (id: string, patch: Partial<ModelPricingRule>) => {
        updateRules(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
    };

    const removeRule = (id: string) => {
        updateRules(rules.filter((rule) => rule.id !== id));
    };

    return (
        <Form layout="vertical" requiredMark={false}>
            <div className="mb-4 text-xs text-stone-500">从已配置的图片 / 视频模型中选择，视频模型常用「积分/秒」。</div>
            <div className="space-y-3">
                {rules.map((rule) => (
                    <div key={rule.id} className="grid gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800 md:grid-cols-[1.4fr_0.9fr_0.7fr_auto] md:items-end">
                        <Form.Item label="模型" className="mb-0">
                            <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="选择模型"
                                value={rule.model || undefined}
                                options={modelSelectOptions}
                                onChange={(value) => updateRule(rule.id, { model: value })}
                            />
                        </Form.Item>
                        <Form.Item label="计费方式" className="mb-0">
                            <Select
                                value={rule.unit}
                                options={[
                                    { value: "second", label: pricingUnitLabel("second") },
                                    { value: "image", label: pricingUnitLabel("image") },
                                    { value: "request", label: pricingUnitLabel("request") },
                                ]}
                                onChange={(value) => updateRule(rule.id, { unit: value })}
                            />
                        </Form.Item>
                        <Form.Item label="积分" className="mb-0">
                            <InputNumber min={0} className="w-full" value={rule.credits} onChange={(value) => updateRule(rule.id, { credits: Number(value) || 0 })} />
                        </Form.Item>
                        <Button danger icon={<Trash2 className="size-4" />} onClick={() => removeRule(rule.id)}>
                            删除
                        </Button>
                    </div>
                ))}
            </div>
            <Button className="mt-4" icon={<Plus className="size-4" />} onClick={addRule}>
                添加定价规则
            </Button>
            {config.models.length ? (
                <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-3 text-xs text-stone-500 dark:border-stone-800">
                    当前已配置模型示例：{config.models.slice(0, 4).map((model) => modelOptionLabel(config, model)).join("、")}
                </div>
            ) : null}
        </Form>
    );
}
