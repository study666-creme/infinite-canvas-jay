"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Cpu, Sparkles } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CreditSymbol, resolveModelPricingRule, type ModelPricingRule } from "@/constant/credits";
import { cn } from "@/lib/utils";
import {
    isPromptHubModelValue,
    parsePromptHubModelId,
    promptHubImageCredits,
    promptHubModelPickerLabel,
    toPromptHubModelValue,
} from "@/services/prompt-hub-models";
import { formatCredits, formatYuan, useRemoteModelPricingRules } from "@/services/model-pricing";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import type { PromptHubCatalogModel, PromptHubImageModel } from "@/services/prompt-hub";

type Props = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

type CapabilityProps = Props & { capability: ModelCapability };

export function PromptHubAwareModelPicker(props: CapabilityProps) {
    if (props.capability === "image") return <PromptHubAwareImageModelPicker {...props} />;
    return <PromptHubCatalogModelPicker {...props} />;
}

function PromptHubCatalogModelPicker({ capability, ...props }: CapabilityProps) {
    const session = usePromptHubStore((state) => state.session);
    const catalog = usePromptHubStore((state) => state.models);
    const refreshGenerationAccount = usePromptHubStore((state) => state.refreshGenerationAccount);
    const loggedIn = Boolean(session?.access_token);
    const enabledIds = useMemo(
        () => new Set(selectableModelsByCapability(props.config, capability).map(parsePromptHubModelId).filter((id): id is string => Boolean(id))),
        [capability, props.config],
    );
    const remoteModels = useMemo(
        () => catalog.filter((model) => {
            if (model.modality !== capability || !enabledIds.has(model.id)) return false;
            return capability === "text" ? model.operation !== "generate" : model.operation !== "chat";
        }),
        [capability, catalog, enabledIds],
    );

    usePromptHubPickerRefresh(loggedIn, refreshGenerationAccount);
    if (!loggedIn || !remoteModels.length) return <PlainCapabilityModelPicker {...props} capability={capability} />;
    return <MergedCapabilityModelPicker {...props} capability={capability} remoteModels={remoteModels} />;
}

/** 生图模型：已连接卡藏时在下拉中显示卡藏模型（ph-hub: 前缀）+ 本地模型 */
export function PromptHubAwareImageModelPicker(props: Props) {
    const session = usePromptHubStore((s) => s.session);
    const imageModels = usePromptHubStore((s) => s.imageModels);
    const catalog = usePromptHubStore((s) => s.models);
    const refreshGenerationAccount = usePromptHubStore((s) => s.refreshGenerationAccount);
    const remotePricing = useRemoteModelPricingRules();
    const loggedIn = Boolean(session?.access_token);
    const enabledIds = useMemo(
        () => new Set(props.config.imageModels.map(parsePromptHubModelId).filter((id): id is string => Boolean(id))),
        [props.config.imageModels],
    );
    const catalogImageModels = useMemo(
        () => [...imageModels, ...catalog.filter((model): model is PromptHubImageModel => model.modality === "image")]
            .filter((model, index, list) => list.findIndex((candidate) => candidate.id === model.id) === index)
            .filter((model) => model.selectable !== false && model.uiFamily !== "midjourney" && enabledIds.has(model.id)),
        [catalog, enabledIds, imageModels],
    );

    usePromptHubPickerRefresh(loggedIn, refreshGenerationAccount);

    if (!loggedIn || !catalogImageModels.length) {
        return <PlainImageModelPicker {...props} />;
    }

    return <MergedImageModelPicker {...props} imageModels={catalogImageModels} remotePricing={remotePricing} />;
}

function usePromptHubPickerRefresh(loggedIn: boolean, refresh: () => Promise<void>) {
    useEffect(() => {
        if (!loggedIn) return;
        void refresh();
        const onPickerOpen = () => void refresh();
        window.addEventListener("model-picker-open", onPickerOpen);
        return () => window.removeEventListener("model-picker-open", onPickerOpen);
    }, [loggedIn, refresh]);
}

function PlainCapabilityModelPicker({ config, capability, value, onChange, className, fullWidth, placeholder = "选择模型", onMissingConfig }: CapabilityProps) {
    const options = useMemo(
        () => Array.from(new Set(selectableModelsByCapability(config, capability).filter((model) => model && !isPromptHubModelValue(model)))),
        [capability, config],
    );
    return (
        <BaseModelSelect
            config={config}
            value={value}
            onChange={onChange}
            className={className}
            fullWidth={fullWidth}
            placeholder={placeholder}
            onMissingConfig={onMissingConfig}
            options={options.map((model) => ({ value: model, label: modelOptionLabel(config, model), kind: "local" as const }))}
        />
    );
}

function MergedCapabilityModelPicker({
    config,
    capability,
    value,
    onChange,
    className,
    fullWidth,
    placeholder = "选择模型",
    onMissingConfig,
    remoteModels,
}: CapabilityProps & { remoteModels: PromptHubCatalogModel[] }) {
    const localModels = useMemo(
        () => Array.from(new Set(selectableModelsByCapability(config, capability).filter((model) => model && !isPromptHubModelValue(model)))),
        [capability, config],
    );
    const options = useMemo(() => [
        ...remoteModels.map((model) => ({
            value: toPromptHubModelValue(model.id),
            label: promptHubModelPickerLabel(model.id, model.label),
            kind: "ph" as const,
            credits: model.pricing?.credits,
            yuan: model.pricing?.yuan,
            pricingUnit: model.pricing?.unit,
        })),
        ...localModels.map((model) => ({
            value: model,
            label: modelOptionLabel(config, model),
            kind: "local" as const,
        })),
    ], [config, localModels, remoteModels]);
    return (
        <BaseModelSelect
            config={config}
            value={value}
            onChange={onChange}
            className={className}
            fullWidth={fullWidth}
            placeholder={placeholder}
            onMissingConfig={onMissingConfig}
            options={options}
        />
    );
}

function PlainImageModelPicker({ config, value, onChange, className, fullWidth, placeholder = "选择模型", onMissingConfig }: Props) {
    const options = useMemo(
        () => Array.from(new Set(selectableModelsByCapability(config, "image").filter((model) => model && !isPromptHubModelValue(model)))),
        [config],
    );
    return (
        <BaseModelSelect
            config={config}
            value={value}
            onChange={onChange}
            className={className}
            fullWidth={fullWidth}
            placeholder={placeholder}
            onMissingConfig={onMissingConfig}
            options={options.map((model) => ({ value: model, label: modelOptionLabel(config, model), kind: "local" as const }))}
        />
    );
}

function MergedImageModelPicker({
    config,
    value,
    onChange,
    className,
    fullWidth,
    placeholder = "选择模型",
    onMissingConfig,
    imageModels,
    remotePricing,
}: Props & { imageModels: PromptHubImageModel[]; remotePricing: ModelPricingRule[] }) {
    const localModels = useMemo(
        () => Array.from(new Set(selectableModelsByCapability(config, "image").filter((model) => model && !isPromptHubModelValue(model)))),
        [config],
    );
    const options = useMemo(() => {
        const ph = imageModels.map((m) => ({
            value: toPromptHubModelValue(m.id),
            label: promptHubModelPickerLabel(m.id, m.label),
            kind: "ph" as const,
            credits: promptHubImageModelCredits(m, remotePricing),
            yuan: m.pricing?.yuan,
            pricingUnit: m.pricing?.unit,
        }));
        const local = localModels.map((model) => ({
            value: model,
            label: modelOptionLabel(config, model),
            kind: "local" as const,
            credits: resolveModelPricingRule(remotePricing, model)?.credits,
        }));
        return [...ph, ...local];
    }, [config, imageModels, localModels, remotePricing]);

    return (
        <BaseModelSelect
            config={config}
            value={value}
            onChange={onChange}
            className={className}
            fullWidth={fullWidth}
            placeholder={placeholder}
            onMissingConfig={onMissingConfig}
            options={options}
        />
    );
}

function BaseModelSelect({
    config,
    value,
    onChange,
    className,
    fullWidth,
    placeholder,
    onMissingConfig,
    options,
}: Props & {
    options: { value: string; label: string; kind: "ph" | "local"; credits?: number; yuan?: number; pricingUnit?: "request" | "second" | "image" | "token" }[];
}) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const current = value || "";
    const promptHubModelId = parsePromptHubModelId(current);
    const currentLabel = options.find((o) => o.value === current)?.label || (promptHubModelId ? promptHubModelPickerLabel(promptHubModelId) : current || placeholder);

    return (
        <Select
            open={open}
            value={current || undefined}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={onChange}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={currentLabel}
            >
                {isPromptHubModelValue(current) ? (
                    <Sparkles className="size-4 shrink-0 text-amber-500" />
                ) : (
                    <ModelIcon model={current} />
                )}
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{currentLabel}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] w-80 max-w-[calc(100vw-24px)] max-h-72 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    options.map((opt, idx) => {
                        const showPhHeader = opt.kind === "ph" && (idx === 0 || options[idx - 1]?.kind !== "ph");
                        const showLocalHeader = opt.kind === "local" && (idx === 0 || options[idx - 1]?.kind !== "local");
                        return (
                            <div key={opt.value}>
                                {showPhHeader ? (
                                    <div className="px-2 py-1 text-[11px] font-medium text-amber-600/90 dark:text-amber-400/90">卡藏 · 扣积分</div>
                                ) : null}
                                {showLocalHeader && options.some((o) => o.kind === "ph") ? (
                                    <div className="mt-1 border-t border-border/60 pt-1 px-2 py-1 text-[11px] font-medium text-stone-500">本地 / 第三方 API</div>
                                ) : null}
                                <SelectItem value={opt.value} textValue={opt.label} className="min-w-0 overflow-hidden py-1.5" title={opt.label}>
                                    <span className="flex w-full min-w-0 items-center gap-2 pr-1">
                                        {opt.kind === "ph" ? <Sparkles className="size-4 shrink-0 text-amber-500" /> : <ModelIcon model={opt.value} />}
                                        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                            <span className="min-w-0 truncate">{opt.label}</span>
                                            {opt.pricingUnit === "token" ? (
                                                <span className="shrink-0 whitespace-nowrap text-[11px] opacity-70">按量计费</span>
                                            ) : typeof opt.credits === "number" ? (
                                                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] tabular-nums opacity-70">
                                                    <CreditSymbol className="size-3" />
                                                    {formatCredits(opt.credits)} 积分
                                                    {opt.pricingUnit === "second" ? "/秒" : ""}
                                                    {typeof opt.yuan === "number" ? <span>（¥{formatYuan(opt.yuan)}）</span> : null}
                                                </span>
                                            ) : null}
                                        </span>
                                    </span>
                                </SelectItem>
                            </div>
                        );
                    })
                ) : (
                    <SelectItem value="__empty__" disabled>
                        请先在设置里连接 Prompt Hub 或配置本地模型
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function promptHubImageModelCredits(model: PromptHubImageModel, remotePricing: ModelPricingRule[]) {
    const direct = promptHubImageCredits(model, model.resolutions?.[0]);
    if (direct != null) return direct;
    return resolveModelPricingRule(remotePricing, model.id)?.credits;
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm")) return "/icons/glm.svg";
    return "";
}
