"use client";



import { useEffect, useRef, useState } from "react";

import { ArrowUp, LoaderCircle, Square } from "lucide-react";

import { Button } from "antd";



import { ModelPicker } from "@/components/model-picker";

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

    onStop: (nodeId: string) => void;

    mentionReferences?: CanvasResourceReference[];

    onDisconnectReference?: (nodeId: string, sourceNodeId: string, label: string) => void;

    onImageSettingsOpenChange?: (open: boolean) => void;

};



export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onDisconnectReference, onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {

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

    const availableVideoReferences = mode === "video" ? toVideoReferenceAssets(mentionReferences.filter((reference) => reference.active && reference.nodeId !== node.id)) : [];

    const activeVideoReferenceLabels = mode === "video" ? resolveActiveVideoReferences(prompt, mentionReferences).map((reference) => reference.label) : [];

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

            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"

            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}

            onMouseDown={(event) => event.stopPropagation()}

            onPointerDown={(event) => event.stopPropagation()}

            onWheel={(event) => event.stopPropagation()}

        >

            {mode === "video" && availableVideoReferences.length ? (
                <div className="mb-2.5 rounded-2xl border p-2.5" style={{ borderColor: `${theme.node.stroke}aa`, background: `linear-gradient(180deg, ${theme.node.fill} 0%, ${theme.node.panel} 100%)` }}>
                    <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-medium tracking-wide opacity-80">参考素材</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] opacity-50" style={{ background: theme.toolbar.activeBg }}>点击插入 · @ 搜索</span>
                    </div>
                    <CanvasVideoReferenceStrip variant="panel" references={availableVideoReferences} activeLabels={activeVideoReferenceLabels} onInsertReference={insertReferenceLabel} onRemoveReference={onDisconnectReference ? removeReference : undefined} />
                </div>
            ) : null}

            <CanvasResourceMentionTextarea
                ref={promptInputRef}
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                containerClassName="min-w-0 w-full"
                className="thin-scrollbar min-h-24 w-full resize-none rounded-xl border px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className="mt-2 flex min-w-0 items-center gap-2">

                <div className="thin-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5">

                    {mode !== "video" ? <CanvasPromptLibrary onSelect={updatePrompt} /> : null}

                    {mode === "image" ? (

                        <>

                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} />

                            <CanvasImageSettingsPopover

                                config={config}

                                placement="topLeft"

                                variant="jimeng"

                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : key === "quality" ? { quality: normalizeJimengQualityValue(value) } : { [key]: value })}

                                onMissingConfig={() => openConfigDialog(true)}

                                onOpenChange={onImageSettingsOpenChange}

                            />

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

                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[220px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />

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

                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"

                    danger={isRunning}

                    disabled={!isRunning && !prompt.trim()}

                    onClick={() => (isRunning ? onStop(node.id) : submit())}

                    aria-label={isRunning ? "停止生成" : "生成"}

                >

                    <span className="flex items-center gap-1.5">

                        {isRunning ? (

                            <>

                                <LoaderCircle className="size-4 animate-spin" />

                                <Square className="size-3.5 fill-current" />

                                <span className="text-xs font-medium">停止</span>

                            </>

                        ) : (

                            <>

                                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">

                                    <CreditSymbol />

                                    {credits.toLocaleString()}

                                </span>

                                <ArrowUp className="size-4" />

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

    if (mode === "video") return "上传参考素材后，输入 @ 或点击下方 @ 按钮选择素材，例如：@图片1 让画面动起来";

    if (mode === "audio") return "描述要生成的音频内容";

    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";

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

