"use client";

import { type ReactNode } from "react";
import { Switch } from "antd";

import { JimengPillRow, JimengRatioGrid, JimengSectionTitle, ratioPreviewSize } from "@/components/jimeng-settings-primitives";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { canvasVideoDurationOptions } from "@/lib/video-duration-options";
import { boolConfig, isSeedanceFastModel, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedancePixelLabel, seedanceRatioOptions, seedanceResolutionOptions } from "@/lib/seedance-video";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { modelOptionName, type AiConfig } from "@/stores/use-config-store";
import { normalizePromptHubVideoRatio, parsePromptHubModelId, promptHubVideoAspectRatios, promptHubVideoResolutions } from "@/services/prompt-hub-models";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";

const resolutionOptions = [
    { value: "720", label: "720p" },
    { value: "480", label: "480p" },
];

const sizeOptions = [
    { value: "1280x720", label: "横屏", width: 1280, height: 720 },
    { value: "720x1280", label: "竖屏", width: 720, height: 1280 },
    { value: "1024x1024", label: "方形", width: 1024, height: 1024 },
    { value: "1792x1024", label: "宽屏", width: 1792, height: 1024 },
    { value: "1024x1792", label: "长图", width: 1024, height: 1792 },
    { value: "auto", label: "auto", width: 0, height: 0 },
];

const secondOptions = [6, 10, 12, 16, 20];

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    variant?: "default" | "jimeng";
    sections?: "all" | "ratio-resolution" | "duration";
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5", variant = "default", sections = "all" }: VideoSettingsPanelProps) {
    const promptHubModelId = parsePromptHubModelId(config.model || config.videoModel);
    const promptHubCatalog = usePromptHubStore((state) => state.models);
    const promptHubModel = promptHubModelId ? promptHubCatalog.find((model) => model.id === promptHubModelId) || null : null;

    if (promptHubModelId) {
        return <PromptHubVideoSettingsPanel config={config} modelId={promptHubModelId} model={promptHubModel} onConfigChange={onConfigChange} theme={theme} showTitle={showTitle} className={className} sections={sections} />;
    }

    if (isSeedanceVideoConfig(config)) {
        return <SeedanceVideoSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} showTitle={showTitle} className={className} variant={variant} sections={sections} />;
    }

    const seconds = config.videoSeconds || "6";
    const size = normalizeVideoSizeValue(config.size);
    const dimensions = readSizeDimensions(size);
    const resolution = normalizeVideoResolutionValue(config.vquality);
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.floor(value || dimensions[key] || 720));
        onConfigChange("size", `${key === "width" ? next : dimensions.width}x${key === "height" ? next : dimensions.height}`);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                <SettingGroup title="清晰度" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {resolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                        <ResolutionInput value={resolution} theme={theme} onChange={(value) => onConfigChange("vquality", value)} />
                    </div>
                </SettingGroup>
                <SettingGroup title="尺寸" color={theme.node.muted}>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                        <DimensionInput prefix="W" value={dimensions.width} disabled={size === "auto"} theme={theme} onChange={(value) => updateDimension("width", value)} />
                        <span className="text-lg opacity-45">↔</span>
                        <DimensionInput prefix="H" value={dimensions.height} disabled={size === "auto"} theme={theme} onChange={(value) => updateDimension("height", value)} />
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                        {sizeOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[78px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent text-sm transition hover:opacity-80"
                                style={{ borderColor: size === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={item.width} height={item.height} color={theme.node.text} />
                                <span>{item.label}</span>
                                {item.value === "auto" ? null : (
                                    <span className="text-[11px] leading-none opacity-55">
                                        {item.value}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="秒数" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {secondOptions.map((value) => (
                            <OptionPill key={value} selected={seconds === String(value)} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value}s
                            </OptionPill>
                        ))}
                        <NumberInput value={seconds} min={1} max={20} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                    </div>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function PromptHubVideoSettingsPanel({ config, modelId, model, onConfigChange, theme, showTitle, className, sections }: VideoSettingsPanelProps & { modelId: string; model: ReturnType<typeof usePromptHubStore.getState>["models"][number] | null }) {
    const ratios = promptHubVideoAspectRatios(model, modelId);
    const resolutions = promptHubVideoResolutions(model, modelId);
    const selectedRatio = normalizePromptHubVideoRatio(config.size, ratios);
    const selectedResolution = `${normalizeVideoResolutionValue(config.vquality)}p`;
    const durationParameter = model?.parameters?.find((parameter) => parameter.name === "duration");
    const minDuration = Math.max(1, Math.floor(Number(durationParameter?.min) || 5));
    const maxDuration = Math.max(minDuration, Math.floor(Number(durationParameter?.max) || 15));
    const duration = String(Math.max(minDuration, Math.min(maxDuration, Math.floor(Number(config.videoSeconds) || minDuration))));
    const durationOptions = [5, 6, 8, 10, 12, 15].filter((value) => value >= minDuration && value <= maxDuration);
    const showRatioResolution = sections === "all" || sections === "ratio-resolution";
    const showDuration = sections === "all" || sections === "duration";

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {showRatioResolution ? (
                    <div className="space-y-3">
                        <JimengSectionTitle color={theme.node.muted}>选择比例</JimengSectionTitle>
                        <JimengRatioGrid
                            options={ratios.map((value) => ({ value, ...ratioPreviewSize(value) }))}
                            value={selectedRatio}
                            theme={theme}
                            columns={Math.min(7, Math.max(3, ratios.length))}
                            onChange={(value) => onConfigChange("size", value)}
                        />
                    </div>
                ) : null}
                {showRatioResolution ? (
                    <div className="space-y-3">
                        <JimengSectionTitle color={theme.node.muted}>选择分辨率</JimengSectionTitle>
                        <JimengPillRow
                            options={resolutions.map((value) => ({ value, label: value.toUpperCase() }))}
                            value={resolutions.includes(selectedResolution) ? selectedResolution : resolutions[0]}
                            theme={theme}
                            columns={Math.min(3, Math.max(1, resolutions.length))}
                            onChange={(value) => onConfigChange("vquality", value)}
                        />
                    </div>
                ) : null}
                {showDuration ? (
                    <SettingGroup title="秒数" color={theme.node.muted}>
                        <div className="grid grid-cols-3 gap-2.5">
                            {durationOptions.map((value) => (
                                <OptionPill key={value} selected={duration === String(value)} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                    {value}s
                                </OptionPill>
                            ))}
                            <NumberInput value={duration} min={minDuration} max={maxDuration} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                        </div>
                    </SettingGroup>
                ) : null}
            </div>
        </ImageSettingsTheme>
    );
}

function SeedanceVideoSettingsPanel({ config, onConfigChange, theme, showTitle, className, variant = "default", sections = "all" }: VideoSettingsPanelProps) {
    const model = modelOptionName(config.model || config.videoModel);
    const resolution = normalizeSeedanceResolution(config.vquality, model);
    const ratio = normalizeSeedanceRatio(config.size);
    const duration = normalizeSeedanceDuration(config.videoSeconds);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);
    const jimeng = variant === "jimeng";
    const ratioOptions = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"].map((value) => {
        const preview = ratioPreviewSize(value);
        return { value, label: preview.label, width: preview.width, height: preview.height };
    });
    const showRatioResolution = sections === "all" || sections === "ratio-resolution";
    const showDuration = sections === "all" || sections === "duration";
    const showOutput = sections === "all";

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle && !jimeng ? <div className="text-lg font-semibold">视频设置</div> : null}
                {showRatioResolution ? (
                    <div className="space-y-3">
                        <JimengSectionTitle color={theme.node.muted}>{jimeng ? "选择比例" : "比例"}</JimengSectionTitle>
                        {jimeng ? (
                            <JimengRatioGrid options={ratioOptions} value={ratio} theme={theme} columns={7} onChange={(value) => onConfigChange("size", value)} />
                        ) : (
                            <div className="grid grid-cols-3 gap-2.5">
                                {seedanceRatioOptions.map((item) => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className="flex h-[68px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 text-sm transition hover:opacity-80"
                                        style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onClick={() => onConfigChange("size", item.value)}
                                    >
                                        <SizePreview width={ratioPreview(item.value).width} height={ratioPreview(item.value).height} color={theme.node.text} />
                                        <span>{item.label}</span>
                                        <span className="text-[10px] leading-none opacity-55">{item.value === "adaptive" ? "adaptive" : seedancePixelLabel(resolution, item.value)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
                {showRatioResolution ? (
                    <div className="space-y-3">
                        <JimengSectionTitle color={theme.node.muted}>{jimeng ? "选择分辨率" : "分辨率"}</JimengSectionTitle>
                        <JimengPillRow
                            options={seedanceResolutionOptions.map((item) => ({
                                value: item.value,
                                label: item.label.toUpperCase(),
                                disabled: item.value === "1080p" && isSeedanceFastModel(model),
                            }))}
                            value={resolution}
                            theme={theme}
                            columns={3}
                            onChange={(value) => onConfigChange("vquality", value)}
                        />
                        {isSeedanceFastModel(model) ? <div className="text-[11px] leading-4 opacity-55">fast 模型不支持 1080P，会自动使用 720P。</div> : null}
                    </div>
                ) : null}
                {showDuration ? (
                    <div className="space-y-3">
                        <JimengSectionTitle color={theme.node.muted}>{jimeng ? "选择时长" : "时长"}</JimengSectionTitle>
                        <JimengPillRow
                            options={canvasVideoDurationOptions()}
                            value={String(duration)}
                            theme={theme}
                            columns={4}
                            onChange={(value) => onConfigChange("videoSeconds", value)}
                        />
                    </div>
                ) : null}
                {showOutput ? (
                    <SettingGroup title="输出" color={theme.node.muted}>
                        <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                            <SwitchRow label="生成声音" checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} />
                            <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} />
                        </div>
                    </SettingGroup>
                ) : null}
            </div>
        </ImageSettingsTheme>
    );
}

export function videoResolutionLabel(value: string) {
    const normalized = normalizeVideoResolutionValue(value);
    if (normalized === "480") return "480P";
    if (normalized === "720") return "720P";
    return `${normalized.toUpperCase()}P`;
}

export function videoJimengResolutionLabel(value: string, config: AiConfig) {
    if (isSeedanceVideoConfig(config)) {
        return normalizeSeedanceResolution(value, modelOptionName(config.model || config.videoModel)).toUpperCase();
    }
    return videoResolutionLabel(value);
}

export function videoJimengRatioLabel(value: string) {
    const exact = videoRatioLabel(value);
    if (exact) return exact;
    const ratio = normalizeSeedanceRatio(value);
    return ratioPreviewSize(ratio).label;
}

export function videoSizeLabel(value: string) {
    const exact = videoRatioLabel(value);
    if (exact) return exact;
    const ratio = normalizeSeedanceRatio(value);
    if (value === "adaptive" || value === "auto") return "自适应";
    if (ratio === value) return seedanceRatioOptions.find((item) => item.value === ratio)?.label || ratio;
    const size = normalizeVideoSizeValue(value);
    return sizeOptions.find((item) => item.value === size)?.label || size;
}

function videoRatioLabel(value: string) {
    return ({
        "16:9": "横屏",
        "9:16": "竖屏",
        "1:1": "方形",
        "4:3": "标准横屏",
        "3:4": "标准竖屏",
        "3:2": "摄影横屏",
        "2:3": "摄影竖屏",
        "21:9": "宽银幕",
    } as Record<string, string>)[value] || "";
}

export function videoSecondsLabel(value: string) {
    if (String(value).trim() === "-1") return "智能";
    return `${value || "6"}s`;
}

export function normalizeVideoSizeValue(value: string) {
    if (value === "auto") return "auto";
    if (/^\d+x\d+$/.test(value || "")) return value;
    return ["9:16", "2:3", "3:4"].includes(value) ? "720x1280" : "1280x720";
}

export function normalizeVideoResolutionValue(value: string) {
    if (value === "480p" || value === "low") return "480";
    if (value === "720p" || value === "auto" || value === "high" || value === "medium") return "720";
    return value.replace(/p$/i, "") || "720";
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function ResolutionInput({ value, theme, onChange }: { value: string; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input type="number" min={1} className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />
            <span className="grid w-7 place-items-center pr-1" style={{ color: theme.node.muted }}>
                p
            </span>
        </label>
    );
}

function DimensionInput({ prefix, value, disabled, theme, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input type="number" min={1} disabled={disabled} className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value || ""} onChange={(event) => onChange(Number(event.target.value) || null)} onMouseDown={(event) => event.stopPropagation()} />
        </label>
    );
}

function NumberInput({ value, min, max, theme, onChange }: { value: string; min: number; max: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    return <input type="number" min={min} max={max} className="h-9 rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }} value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />;
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(10, Math.round((width / longSide) * 26));
    const previewHeight = Math.max(10, Math.round((height / longSide) * 26));
    return <span className="rounded-[3px] border-2" style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function ratioPreview(ratio: string) {
    if (ratio === "9:16") return { width: 9, height: 16 };
    if (ratio === "1:1") return { width: 1, height: 1 };
    if (ratio === "4:3") return { width: 4, height: 3 };
    if (ratio === "3:4") return { width: 3, height: 4 };
    if (ratio === "21:9") return { width: 21, height: 9 };
    if (ratio === "adaptive") return { width: 0, height: 0 };
    return { width: 16, height: 9 };
}

function SwitchRow({ label, checked, theme, onChange }: { label: string; checked: boolean; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.node.text }}>
                {label}
            </span>
            <span onMouseDown={(event) => event.stopPropagation()}>
                <Switch size="small" checked={checked} onChange={onChange} />
            </span>
        </div>
    );
}

function readSizeDimensions(size: string) {
    if (size === "auto") return { width: 0, height: 0 };
    const match = size.match(/^(\d+)x(\d+)$/);
    return { width: Number(match?.[1]) || 1280, height: Number(match?.[2]) || 720 };
}
