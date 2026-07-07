"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowUp, LoaderCircle } from "lucide-react";

import { Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { PromptHubAwareImageModelPicker } from "@/components/prompt-hub-model-picker";

import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";

import { CreditSymbol, requestCreditCost } from "@/constant/credits";

import { canvasThemes } from "@/lib/canvas-theme";

import { useThemeStore } from "@/stores/use-theme-store";

import { normalizeJimengQualityValue } from "@/components/image-settings-panel";

import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";

import { CanvasPromptLibrary } from "./canvas-prompt-library";

import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";

import { CanvasResourceMentionPicker } from "./canvas-resource-mention-picker";

import { CanvasResourceMentionTextarea, type CanvasResourceMentionTextareaHandle } from "./canvas-resource-mention-textarea";

import { CanvasVideoDurationPopover } from "./canvas-video-duration-popover";

import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";

import { CanvasVideoReferenceStrip } from "./canvas-video-reference-strip";

import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "../types";

import type { CanvasResourceReference } from "../utils/canvas-resource-references";

import { resolveActiveVideoReferences, removeReferenceLabelFromPrompt, toVideoReferenceAssets } from "../utils/canvas-video-references";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop?: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onDisconnectReference?: (nodeId: string, sourceNodeId: string, label: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, mentionReferences = [], onDisconnectReference, onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isTextEditMode = node.type === CanvasNodeType.Text && hasTextContent;
    const [prompt, setPrompt] = useState(isTextEditMode ? "" : node.metadata?.prompt || "");
    const promptInputRef = useRef<CanvasResourceMentionTextareaHandle>(null);

    const credits = requestCreditCost({
        channelMode: config.channelMode,
        modelPricing: config.modelPricing,
        model: config.model,
        count: mode === "image" ? config.count : 1,
        videoSeconds: mode === "video" ? config.videoSeconds : undefined,
    });

    const availableMediaReferences =
        mode === "video" || mode === "image"
            ? toVideoReferenceAssets(mentionReferences.filter((reference) => reference.active && reference.nodeId !== node.id))
            : [];

    const activeMediaReferenceLabels =
        mode === "video" || mode === "image"
            ? resolveActiveVideoReferences(prompt, mentionReferences).map((reference) => reference.label)
            : [];

    const activeMentionReferences = mentionReferences.filter((reference) => reference.active);

    useEffect(() => {
        setPrompt(isTextEditMode ? "" : node.metadata?.prompt || "");
    }, [isTextEditMode, node.id, node.metadata?.prompt]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isTextEditMode) onPromptChange(node.id, value);
    };

    const insertReferenceLabel = (label: string) => {
        promptInputRef.current?.insertReferenceLabel(label);
    };

    const removeReference = (sourceNodeId: string, label: string) => {
        updatePrompt(removeReferenceLabelFromPrompt(prompt, label));
        onDisconnectReference?.(node.id, sourceNodeId, label);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        insertReferenceLabel(reference.label);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        if (!isTextEditMode) onPromptChange(node.id, text);
        onGenerate(node.id, mode, text);
    };

    return (
        <div
            className="canvas-composer-shell"
            data-canvas-scroll
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {availableMediaReferences.length ? (
                <div className="canvas-composer-reference-block" style={{ borderColor: `${theme.node.stroke}aa`, background: `linear-gradient(180deg, ${theme.node.fill} 0%, ${theme.node.panel} 100%)` }}>
                    <CanvasVideoReferenceStrip
                        variant="panel"
                        references={availableMediaReferences}
                        activeLabels={activeMediaReferenceLabels}
                        onInsertReference={insertReferenceLabel}
                        onRemoveReference={onDisconnectReference ? removeReference : undefined}
                    />
                </div>
            ) : null}

            <CanvasResourceMentionTextarea
                ref={promptInputRef}
                enableFullscreen
                fullscreenTitle={node.type === CanvasNodeType.Text ? "文本节点提示词" : "生成提示词"}
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                containerClassName="canvas-composer-editor min-w-0 w-full"
                className="canvas-composer-input thin-scrollbar w-full resize-none border-0 bg-transparent px-1 py-1 text-[15px] leading-6 outline-none"
                style={{ color: theme.node.text }}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className="canvas-composer-toolbar mt-3 flex min-w-0 items-center gap-2">
                <div className="canvas-composer-tools thin-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
                    {mode !== "video" ? <CanvasPromptLibrary onSelect={updatePrompt} /> : null}

                    {mode === "image" ? (
                        <>
                            <PromptHubAwareImageModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                variant="jimeng"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : key === "quality" ? { quality: normalizeJimengQualityValue(value) } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                            <CanvasResourceMentionPicker references={activeMentionReferences} onSelect={insertReference} />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} variant="jimeng" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                            <CanvasVideoDurationPopover config={config} onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                            <CanvasResourceMentionPicker references={activeMentionReferences} onSelect={insertReference} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-9 !max-w-[220px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <CanvasPromptLibrary onSelect={updatePrompt} />
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                        </>
                    )}
                </div>

                <Button
                    type="primary"
                    className={`canvas-generation-action-button !h-16 !min-w-[7.25rem] shrink-0 !rounded-full !px-6 !text-base ${isRunning ? "is-running" : ""}`}
                    disabled={isRunning || !prompt.trim()}
                    onClick={submit}
                    aria-label={isRunning ? "生成中" : "生成"}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-6 animate-spin" />
                                <span className="text-base font-medium">生成中</span>
                            </>
                        ) : (
                            <>
                                <span className="inline-flex items-center gap-1.5 text-base font-semibold tabular-nums">
                                    <CreditSymbol />
                                    {credits.toLocaleString()}
                                </span>
                                <ArrowUp className="size-6" strokeWidth={2.5} />
                            </>
                        )}
                    </span>
                </Button>
            </div>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    return {
        ...globalConfig,
        model: node.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model),
        quality: mode === "image" ? normalizeJimengQualityValue(node.metadata?.quality || globalConfig.quality || defaultConfig.quality) : node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "连接参考素材后，输入 @ 或点击下方素材，例如：@图片1 让画面动起来";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "连接参考图后输入 @图片1，或描述要如何修改本图" : "连接参考图后输入 @ 或点击下方素材，例如：@图片1 改成更开阔的舞蹈动作";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
