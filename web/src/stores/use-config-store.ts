"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import { isQianfanBaseUrl } from "@/lib/qianfan-text";
import type { ModelPricingRule } from "@/constant/credits";

export type ApiCallFormat = "openai" | "gemini";

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    catalogModelSelectionVersion: number;
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
    modelPricing: ModelPricingRule[];
    autoExportImage: boolean;
    autoExportVideo: boolean;
    localImageFolderName: string;
    localVideoFolderName: string;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const PROMPT_HUB_DEFAULT_IMAGE_MODEL = "ph-hub:image2";
const PROMPT_HUB_DEFAULT_VIDEO_MODEL = "ph-hub:sd2.0";
const PROMPT_HUB_DEFAULT_TEXT_MODEL = "ph-hub:creative-5-5";
const PROMPT_HUB_MODEL_PREFIX = "ph-hub:";
const CATALOG_MODEL_SELECTION_VERSION = 1;
export const DEFAULT_PROMPT_HUB_MODEL_SELECTIONS: Record<ModelCapability, string[]> = {
    image: ["ph-hub:image2", "ph-hub:image2-pro", "ph-hub:image2-hd", "ph-hub:lingtu-fast"],
    video: ["ph-hub:sd2.0", "ph-hub:sd2.0-fast", "ph-hub:sd2.0-mini", "ph-hub:sd2.0四图版", "ph-hub:sd2.0fast四图版", "ph-hub:sd1080-4k", "ph-hub:motion-video", "ph-hub:motion-video-1-5"],
    text: ["ph-hub:creative-5-5", "ph-hub:creative-5-6", "ph-hub:deepseek-v4-pro", "ph-hub:glm-5.1", "ph-hub:grok4.5pro"],
    audio: [],
};
const BUILT_IN_MODEL_CAPABILITIES: Record<string, ModelCapability> = {
    image2: "image",
    "image2-pro": "image",
    "image2-hd": "image",
    "lingtu-fast": "image",
    "lingtu-2": "image",
    "lingtu-pro": "image",
    lingtu: "image",
    "sd2.0": "video",
    "sd2.0-fast": "video",
    "sd2.0-mini": "video",
    "sd2.0四图版": "video",
    "sd2.0fast四图版": "video",
    "sd1080-4k": "video",
    "motion-video": "video",
    "motion-video-1-5": "video",
    "creative-5-5": "text",
    "creative-5-6": "text",
    "deepseek-v4-pro": "text",
    "glm-5.1": "text",
    "grok4.5pro": "text",
};

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [],
    model: PROMPT_HUB_DEFAULT_IMAGE_MODEL,
    imageModel: PROMPT_HUB_DEFAULT_IMAGE_MODEL,
    videoModel: PROMPT_HUB_DEFAULT_VIDEO_MODEL,
    textModel: PROMPT_HUB_DEFAULT_TEXT_MODEL,
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: [],
    imageModels: DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.image,
    videoModels: DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.video,
    textModels: DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.text,
    audioModels: [],
    catalogModelSelectionVersion: CATALOG_MODEL_SELECTION_VERSION,
    quality: "2k",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
    modelPricing: [
        { id: "seedance-pro", model: "seedance-2.0-pro", unit: "second", credits: 14 },
        { id: "seedance-fast", model: "seedance-2.0-fast", unit: "second", credits: 8 },
    ],
    autoExportImage: false,
    autoExportVideo: false,
    localImageFolderName: "",
    localVideoFolderName: "",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function migrateLegacyDefaultModel(value: string | undefined, capability: "image" | "video" | "text") {
    const model = unwrapPromptHubModelValue(value);
    const name = modelOptionName(model).toLowerCase();
    const builtInCapability = builtInModelCapability(model);
    if (builtInCapability && builtInCapability !== capability) return defaultBuiltInModel(capability);
    if (model.startsWith(PROMPT_HUB_MODEL_PREFIX)) return model;
    if (capability === "image" && ["gpt-image-2", "newapi-gpt-image-2", "image2"].includes(name)) return PROMPT_HUB_DEFAULT_IMAGE_MODEL;
    if (capability === "video" && ["grok-imagine-video", "grok-video", "sd2.0"].includes(name)) return PROMPT_HUB_DEFAULT_VIDEO_MODEL;
    if (capability === "text" && ["gpt-5.5", "gpt-5.6-sol"].includes(name)) return PROMPT_HUB_DEFAULT_TEXT_MODEL;
    return model || defaultBuiltInModel(capability);
}

function defaultBuiltInModel(capability: "image" | "video" | "text") {
    return capability === "image" ? PROMPT_HUB_DEFAULT_IMAGE_MODEL : capability === "video" ? PROMPT_HUB_DEFAULT_VIDEO_MODEL : PROMPT_HUB_DEFAULT_TEXT_MODEL;
}

function unwrapPromptHubModelValue(value?: string) {
    const model = String(value || "").trim();
    const decoded = decodeChannelModel(model);
    const raw = decoded?.model || model;
    return raw.startsWith(PROMPT_HUB_MODEL_PREFIX) ? raw : model;
}

function builtInModelCapability(model: string): ModelCapability | undefined {
    const name = modelOptionName(unwrapPromptHubModelValue(model)).toLowerCase().replace(/^ph-hub:/, "");
    return BUILT_IN_MODEL_CAPABILITIES[name];
}

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    const builtInCapability = builtInModelCapability(model);
    if (builtInCapability) return builtInCapability === capability;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                const selectionInitialized = persistedConfig.catalogModelSelectionVersion === CATALOG_MODEL_SELECTION_VERSION;
                const imageModels = normalizeCapabilityModelList(
                    selectionInitialized ? config.imageModels : [...config.imageModels, ...DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.image],
                    channels,
                    "image",
                );
                const videoModels = normalizeCapabilityModelList(
                    selectionInitialized ? config.videoModels : [...config.videoModels, ...DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.video],
                    channels,
                    "video",
                );
                const textModels = normalizeCapabilityModelList(
                    selectionInitialized ? config.textModels : [...config.textModels, ...DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.text],
                    channels,
                    "text",
                );
                const audioModels = normalizeCapabilityModelList(
                    selectionInitialized ? config.audioModels : [...config.audioModels, ...DEFAULT_PROMPT_HUB_MODEL_SELECTIONS.audio],
                    channels,
                    "audio",
                );
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        model: normalizeSelectedModel(normalizeModelOptionValue(migrateLegacyDefaultModel(config.imageModel || config.model, "image"), channels), imageModels),
                        imageModel: normalizeSelectedModel(normalizeModelOptionValue(migrateLegacyDefaultModel(config.imageModel || config.model, "image"), channels), imageModels),
                        videoModel: normalizeSelectedModel(normalizeModelOptionValue(migrateLegacyDefaultModel(config.videoModel, "video"), channels), videoModels),
                        textModel: normalizeSelectedModel(normalizeModelOptionValue(migrateLegacyDefaultModel(config.textModel || config.model, "text"), channels), textModels),
                        audioModel: normalizeSelectedModel(normalizeModelOptionValue(config.audioModel || "", channels), audioModels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "3",
                        modelPricing: Array.isArray(persistedConfig.modelPricing) ? persistedConfig.modelPricing : defaultConfig.modelPricing,
                        autoExportImage: persistedConfig.autoExportImage ?? defaultConfig.autoExportImage,
                        autoExportVideo: persistedConfig.autoExportVideo ?? defaultConfig.autoExportVideo,
                        localImageFolderName: persistedConfig.localImageFolderName || "",
                        localVideoFolderName: persistedConfig.localVideoFolderName || "",
                        imageModels,
                        videoModels,
                        textModels,
                        audioModels,
                        catalogModelSelectionVersion: CATALOG_MODEL_SELECTION_VERSION,
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[], channels: ModelChannel[]) {
    const allModelOptions = channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model)));
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)))
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter((model) => !allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: uniqueRawModels(channel?.models || []),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    const unwrappedPromptHubModel = decoded?.model || model;
    if (unwrappedPromptHubModel.startsWith(PROMPT_HUB_MODEL_PREFIX)) return unwrappedPromptHubModel;
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.includes(model)) || channels[0];
    return channel && channel.models.includes(model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    if (unwrapPromptHubModelValue(value).startsWith(PROMPT_HUB_MODEL_PREFIX)) {
        return createModelChannel({ id: "card-vault-api", name: "卡藏 API", baseUrl: "", apiKey: "", models: [] });
    }
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.includes(model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "默认渠道", baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: uniqueRawModels(channel.models || []),
        }),
    ).filter((channel, index) => !isUnusedDefaultChannel(channel, index));
    if (!channels.length && config.apiKey.trim()) {
        channels.push(
            createModelChannel({
                id: "channel-1",
                name: "渠道 1",
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: uniqueRawModels(config.models || []),
            }),
        );
    }
    return channels.map((channel) => ({ ...channel, models: uniqueRawModels(channel.models).filter((model) => !model.startsWith(PROMPT_HUB_MODEL_PREFIX)) }));
}

function isUnusedDefaultChannel(channel: ModelChannel, index: number) {
    const defaultIdentity = channel.id === "default" || (index === 0 && channel.name === "默认渠道");
    const baseUrl = channel.baseUrl.replace(/\/+$/, "");
    const untouchedBaseUrl = baseUrl === OPENAI_BASE_URL || baseUrl === GEMINI_BASE_URL;
    return defaultIdentity && !channel.apiKey.trim() && untouchedBaseUrl;
}

function normalizeCapabilityModelList(models: string[], channels: ModelChannel[], capability: ModelCapability) {
    const localOptions = new Set(modelOptionsFromChannels(channels));
    return normalizeModelList(models, channels).filter((model) => {
        if (unwrapPromptHubModelValue(model).startsWith(PROMPT_HUB_MODEL_PREFIX)) return true;
        return localOptions.has(model) && modelMatchesCapability(model, capability);
    });
}

function normalizeSelectedModel(value: string, options: string[]) {
    return options.includes(value) ? value : options[0] || "";
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    if (isQianfanBaseUrl(normalizedBaseUrl)) {
        return `${normalizedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    }
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
