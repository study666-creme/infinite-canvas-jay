import type { PromptHubCatalogModel, PromptHubImageModel } from "@/services/prompt-hub";

/** Canvas node model field: kazhang-api:<model id> means secure Card Vault API generation with account billing. */
export const KAZHANG_API_MODEL_PREFIX = "kazhang-api:";
export const LEGACY_KACHANG_API_MODEL_PREFIX = "kachang-api:";
export const LEGACY_PROMPT_HUB_MODEL_PREFIX = "ph-hub:";
export const PH_HUB_MODEL_PREFIX = KAZHANG_API_MODEL_PREFIX;
export const GROK_VIDEO_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const MOTION_VIDEO_ASPECT_RATIOS = ["16:9", "9:16"] as const;
const SEEDANCE_2_VIDEO_ASPECT_RATIOS = ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"] as const;
const PROMPT_HUB_SCOPED_MODEL_PATTERN = /^_sf-[A-Za-z0-9_-]+::\S+$/;
const LEGACY_PROMPT_HUB_CATALOG_MODEL_IDS = new Map([["sd2.0-720p-4img-min", "sd2.0-720p-4img-mini"]]);
const RAW_LEGACY_PROMPT_HUB_MODEL_IDS = new Set(LEGACY_PROMPT_HUB_CATALOG_MODEL_IDS.keys());
export const CURATED_PROMPT_HUB_MODEL_IDS = {
    image: ["image2-economy", "image2", "image2-4k-fast", "image2-pro", "lingtu-fast", "lingtu-2"],
    video: ["motion-video", "sd2.0-720p-mini", "sd2.0-720p-4img-fast", "sd2.0-720p-4img-pro", "sd2.0-1080p-4k-pro"],
    text: ["creative-5-5", "creative-5-6", "deepseek-v4-pro", "grok-4.5"],
    audio: [],
} as const satisfies Record<PromptHubCatalogModel["modality"], readonly string[]>;
const RAW_CURATED_PROMPT_HUB_MODEL_IDS = new Set<string>(Object.values(CURATED_PROMPT_HUB_MODEL_IDS).flat());

const PROMPT_HUB_MODEL_LABELS: Record<string, string> = {
    "creative-5-5": "全能模型5.5",
    "creative-5-6": "全能模型5.6",
    "image2-economy": "全能模型2 · 特价 1K",
    image2: "全能模型2 · 1K",
    "image2-4k-fast": "全能模型2 · 极速 4K",
    "image2-pro": "全能模型2 · 高质量 1K/2K/4K",
    "image2-hd": "全能模型2 · 经济 2K/4K",
    "lingtu-fast": "香蕉 · 极速 1K",
    "lingtu-2": "香蕉 · 2代 1K/2K/4K",
    "lingtu-pro": "香蕉 · 专业 1K/2K/4K",
    lingtu: "香蕉 · 标准 1K/2K/4K",
    "sd2.0": "sd2.0",
    "sd2.0-fast": "sd2.0-fast",
    "sd2.0-mini": "sd2.0-mini",
    "sd2.0四图版": "sd2.0四图版",
    "sd2.0fast四图版": "sd2.0fast四图版",
    "sd1080-4k": "sd1080-4k",
    "motion-video": "Grok Video",
    "motion-video-1-5": "Grok Video 1.5",
    "sd2.0-720p-mini": "SD 720P Mini",
    "sd2.0-720p-4img-fast": "SD 四图 Fast",
    "sd2.0-720p-4img-pro": "SD 四图 Pro",
    "sd2.0-1080p-4k-pro": "SD 1080P/4K Pro",
    "grok-4.5": "Grok 4.5",
};

export function toPromptHubModelValue(modelId: string) {
    return `${KAZHANG_API_MODEL_PREFIX}${modelId}`;
}

export function isPromptHubModelValue(value?: string | null) {
    const normalized = String(value || "").trim();
    return Boolean(normalized) && (RAW_CURATED_PROMPT_HUB_MODEL_IDS.has(normalized) || RAW_LEGACY_PROMPT_HUB_MODEL_IDS.has(normalized) || normalized.startsWith(KAZHANG_API_MODEL_PREFIX) || normalized.startsWith(LEGACY_KACHANG_API_MODEL_PREFIX) || normalized.startsWith(LEGACY_PROMPT_HUB_MODEL_PREFIX) || PROMPT_HUB_SCOPED_MODEL_PATTERN.test(normalized));
}

export function parsePromptHubModelId(value?: string | null) {
    const normalized = String(value || "").trim();
    if (RAW_CURATED_PROMPT_HUB_MODEL_IDS.has(normalized)) return normalized;
    if (RAW_LEGACY_PROMPT_HUB_MODEL_IDS.has(normalized)) return LEGACY_PROMPT_HUB_CATALOG_MODEL_IDS.get(normalized)!;
    if (!isPromptHubModelValue(normalized)) return null;
    if (PROMPT_HUB_SCOPED_MODEL_PATTERN.test(normalized)) return normalized;
    const prefix = normalized.startsWith(KAZHANG_API_MODEL_PREFIX) ? KAZHANG_API_MODEL_PREFIX : normalized.startsWith(LEGACY_KACHANG_API_MODEL_PREFIX) ? LEGACY_KACHANG_API_MODEL_PREFIX : LEGACY_PROMPT_HUB_MODEL_PREFIX;
    const modelId = normalized.slice(prefix.length);
    return modelId ? LEGACY_PROMPT_HUB_CATALOG_MODEL_IDS.get(modelId) || modelId : null;
}

export function resolvePromptHubCatalogModelId(value: string | undefined | null, catalog: PromptHubCatalogModel[]) {
    const scoped = parsePromptHubModelId(value);
    if (scoped) return scoped;
    const normalized = String(value || "").trim();
    if (!normalized || normalized.includes("::")) return null;
    return catalog.some((model) => model.id === normalized) ? normalized : null;
}

export function promptHubModelPickerLabel(modelId: string, label?: string) {
    return PROMPT_HUB_MODEL_LABELS[modelId] || (label || modelId).trim();
}

export function promptHubModelRouteGroup(model: Pick<PromptHubCatalogModel, "id" | "modality">) {
    const id = model.id.toLowerCase();

    if (model.modality === "image") {
        if (id.startsWith("image2")) return "卡藏 API · 全能生图";
        if (id.startsWith("lingtu")) return "卡藏 API · 香蕉";
        return "卡藏 API · 其他生图";
    }
    if (model.modality === "video") {
        if (id.includes("motion-video") || id.includes("grok")) return "卡藏 API · Grok";
        if (id.includes("veo")) return "卡藏 API · Veo";
        if (id.includes("firefly") || id.includes("seedance")) return "卡藏 API · Seedance";
        if (id.startsWith("sd")) return "卡藏 API · SD 全能";
        return "卡藏 API · 其他视频";
    }
    if (model.modality === "text") {
        if (id.includes("claude")) return "卡藏 API · Claude";
        if (id.includes("grok")) return "卡藏 API · Grok";
        if (id.includes("deepseek")) return "卡藏 API · DeepSeek";
        if (id.includes("glm")) return "卡藏 API · GLM";
        if (id.includes("creative")) return "卡藏 API · 全能模型";
        return "卡藏 API · 其他文本";
    }
    return "卡藏 API · 音频";
}

export function selectPromptHubCatalogModels(catalog: PromptHubCatalogModel[], capability: PromptHubCatalogModel["modality"], fallbackModelIds: Iterable<string> = []) {
    const available = catalog.filter((model) => {
        if (model.modality !== capability) return false;
        return capability === "text" ? model.operation !== "generate" : model.operation !== "chat";
    });
    const enabledIds = new Set(fallbackModelIds);
    if (catalog.length) return available;

    return Array.from(enabledIds, (id): PromptHubCatalogModel => ({
        id,
        label: promptHubModelPickerLabel(id),
        modality: capability,
        operation: capability === "text" ? "chat" : "generate",
    })).filter((model, index, list) => list.findIndex((candidate) => candidate.id === model.id) === index);
}

function parameterValues(model: PromptHubCatalogModel | null | undefined, names: string[]) {
    const parameter = model?.parameters?.find((item) => names.includes(item.name));
    if (!parameter) return [];
    const values = parameter.options?.length ? parameter.options : Object.prototype.hasOwnProperty.call(parameter, "fixed") ? [parameter.fixed] : [];
    return values.map((value) => String(value)).filter(Boolean);
}

export function promptHubVideoAspectRatios(model: PromptHubCatalogModel | null | undefined, modelId?: string | null) {
    const normalizedModelId = String(modelId || model?.id || "").trim().toLowerCase();
    if (normalizedModelId.startsWith("sd2.0-")) return [...SEEDANCE_2_VIDEO_ASPECT_RATIOS];
    const declared = parameterValues(model, ["ratio", "aspect_ratio"]);
    if (declared.length) return declared;
    if (normalizedModelId === "motion-video") return [...MOTION_VIDEO_ASPECT_RATIOS];
    if (normalizedModelId === "motion-video-1-5") return [...GROK_VIDEO_ASPECT_RATIOS];
    return normalizedModelId.startsWith("sd") ? ["16:9", "9:16", "1:1"] : [];
}

export function promptHubVideoResolutions(model: PromptHubCatalogModel | null | undefined, modelId?: string | null) {
    const declared = parameterValues(model, ["resolution"]);
    if (declared.length) return declared.map(normalizeVideoResolutionToken);
    if (modelId === "motion-video") return ["720p"];
    if (modelId === "motion-video-1-5") return ["480p", "720p"];
    if (modelId === "sd1080-4k") return ["1080p", "4k"];
    if (modelId?.includes("四图版")) return ["720p"];
    return modelId?.startsWith("sd") ? ["480p", "720p"] : [];
}

export function normalizePromptHubVideoResolution(value: string | null | undefined, allowedResolutions: readonly string[]) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    const normalized = raw === "low" ? "480p" : raw === "auto" || raw === "high" || raw === "medium" ? "720p" : /^\d+$/.test(raw) ? `${raw}p` : raw || "720p";
    return allowedResolutions.includes(normalized) ? normalized : allowedResolutions[0] || normalized;
}

export type PromptHubVideoDurationRange = {
    min: number;
    max: number;
    fixed: number | null;
    defaultValue: number;
    options: number[];
};

export function promptHubVideoDurationRange(model: PromptHubCatalogModel | null | undefined, modelId?: string | null): PromptHubVideoDurationRange {
    const parameter = model?.parameters?.find((item) => item.name === "duration" || item.path === "duration");
    const identity = [modelId, model?.id, model?.label].filter(Boolean).join(" ").toLowerCase();
    const isGrokVideo = identity.includes("grok") || identity.includes("motion-video");
    const isVeoVideo = identity.includes("veo");
    const fixed = positiveInteger(parameter?.fixed);
    if (fixed != null && !isGrokVideo) {
        const boundedFixed = isVeoVideo ? Math.min(10, fixed) : fixed;
        return { min: boundedFixed, max: boundedFixed, fixed: boundedFixed, defaultValue: boundedFixed, options: [boundedFixed] };
    }

    const options = Array.from(new Set((parameter?.options || []).map(positiveInteger).filter((value): value is number => value != null))).sort((left, right) => left - right);
    const fallbackMin = modelId === "motion-video" ? 1 : 5;
    const min = Math.max(1, positiveInteger(parameter?.min) ?? (options[0] || fallbackMin));
    const declaredMax = Math.max(min, positiveInteger(parameter?.max) ?? (options.at(-1) || 15));
    const max = isGrokVideo ? 15 : isVeoVideo ? Math.min(10, declaredMax) : declaredMax;
    const boundedMin = Math.min(min, max);
    const declaredDefault = positiveInteger(parameter?.default);
    const defaultValue = Math.max(boundedMin, Math.min(max, declaredDefault ?? (modelId === "motion-video" ? 5 : boundedMin)));
    return {
        min: boundedMin,
        max,
        fixed: boundedMin === max ? boundedMin : null,
        defaultValue,
        // Grok accepts a continuous duration range. Do not inherit a channel's
        // incomplete 5/10-second option list and accidentally hide 11-15 seconds.
        options: isGrokVideo ? [] : options.filter((value) => value >= boundedMin && value <= max),
    };
}

export function normalizePromptHubVideoDuration(value: string | number | null | undefined, range: PromptHubVideoDurationRange) {
    const requested = positiveInteger(value) ?? range.defaultValue;
    if (range.fixed != null) return range.fixed;
    if (range.options.length && !range.options.includes(requested)) {
        return range.options.includes(range.defaultValue) ? range.defaultValue : range.options[0];
    }
    return Math.max(range.min, Math.min(range.max, requested));
}

export function normalizePromptHubVideoRatio(value: string | null | undefined, allowedRatios: readonly string[]) {
    const allowed = allowedRatios.length ? [...allowedRatios] : [...GROK_VIDEO_ASPECT_RATIOS];
    const normalized = String(value || "").trim();
    if (allowed.includes(normalized)) return normalized;

    const dimensionMatch = /^(\d+(?:\.\d+)?)[x:](\d+(?:\.\d+)?)$/i.exec(normalized);
    if (dimensionMatch) {
        const width = Number(dimensionMatch[1]);
        const height = Number(dimensionMatch[2]);
        if (width > 0 && height > 0) {
            const target = width / height;
            const candidates = allowed.flatMap((ratio) => {
                const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
                if (!match) return [];
                const ratioWidth = Number(match[1]);
                const ratioHeight = Number(match[2]);
                return ratioWidth > 0 && ratioHeight > 0 ? [{ value: ratio, distance: Math.abs(ratioWidth / ratioHeight - target) }] : [];
            });
            if (candidates.length) return candidates.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best)).value;
        }
    }

    return allowed.includes("16:9") ? "16:9" : allowed[0] || "16:9";
}

function normalizeVideoResolutionToken(value: string) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    return /^\d+$/.test(normalized) ? `${normalized}p` : normalized;
}

export function promptHubImageAspectRatios(model: PromptHubImageModel | null | undefined) {
    const declared = parameterValues(model, ["size"]);
    return declared.length ? declared : (model?.aspectRatios || []).map(String).filter(Boolean);
}

export function promptHubImageResolutions(model: PromptHubImageModel | null | undefined) {
    const declared = parameterValues(model, ["resolution", "quality"])
        .map((value) => value.toLowerCase())
        .filter((value) => value === "1k" || value === "2k" || value === "4k");
    if (declared.length) return declared;
    const catalogResolutions = (model?.resolutions || []).map((value) => String(value).toLowerCase()).filter((value) => value === "1k" || value === "2k" || value === "4k");
    if (catalogResolutions.length) return catalogResolutions;
    const inferred = String(model?.id || "").toLowerCase().match(/(?:^|[-_])(1k|2k|4k)(?:[-_]|$)/)?.[1];
    return inferred === "1k" || inferred === "2k" || inferred === "4k" ? [inferred] : [];
}

export function promptHubImageMaxReferences(model: PromptHubImageModel | null | undefined) {
    const multiple = model?.parameters?.find((parameter) => parameter.name === "images" || parameter.name === "refImageUrls");
    if (typeof multiple?.max_items === "number") return multiple.max_items;
    if (model?.parameters?.some((parameter) => parameter.name === "image" || parameter.name === "refImageUrl")) return 1;
    return model?.parameters?.length ? 0 : null;
}

export type PromptHubImageCountRange = {
    min: number;
    max: number;
    fixed: number | null;
};

function positiveInteger(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

export function promptHubImageCountRange(model: PromptHubImageModel | null | undefined): PromptHubImageCountRange {
    const parameter = model?.parameters?.find((item) => item.name === "n" || item.name === "count");
    if (!parameter) return { min: 1, max: 1, fixed: 1 };

    const fixed = Object.prototype.hasOwnProperty.call(parameter, "fixed") ? positiveInteger(parameter.fixed) : null;
    if (fixed != null) return { min: fixed, max: fixed, fixed };

    const options = (parameter.options || []).map(positiveInteger).filter((value): value is number => value != null);
    const declaredMin = positiveInteger(parameter.min);
    const declaredMax = positiveInteger(parameter.max);
    const defaultValue = positiveInteger(parameter.default);
    const min = Math.max(1, declaredMin ?? (options.length ? Math.min(...options) : (defaultValue ?? 1)));
    const max = Math.max(min, Math.min(15, declaredMax ?? (options.length ? Math.max(...options) : (defaultValue ?? min))));
    return { min, max, fixed: min === max ? min : null };
}

export function promptHubImageCredits(model: PromptHubImageModel | null | undefined, resolution?: string) {
    if (!model) return null;
    const key = String(resolution || "").toLowerCase();
    const tierCost = Number(model.costByResolution?.[key]?.final);
    if (Number.isFinite(tierCost) && tierCost > 0) return tierCost;
    const tierCredits = Number(model.creditsByResolution?.[key]);
    if (Number.isFinite(tierCredits) && tierCredits > 0) return tierCredits;
    const credits = Number(model.cost?.credits);
    return Number.isFinite(credits) && credits > 0 ? credits : null;
}

export function promptHubCatalogCredits(model: PromptHubCatalogModel | null | undefined, options: { duration?: string | number; resolution?: string; quality?: string; count?: string | number } = {}) {
    const pricing = model?.pricing;
    if (!pricing || pricing.mode === "token" || pricing.credits == null) return null;
    const tier = pricing.tiers?.find((candidate) =>
        Object.entries(candidate.when).every(([key, expected]) => {
            const actual = key === "quality" ? options.quality || options.resolution : key === "resolution" ? options.resolution || options.quality : undefined;
            return String(actual || "").toLowerCase() === String(expected).toLowerCase();
        }),
    );
    const credits = tier?.credits ?? pricing.credits;
    if (pricing.unit === "second") {
        const duration = Number(options.duration);
        return credits * (duration > 0 ? duration : 5);
    }
    if (pricing.unit === "image") return credits * Math.max(1, Number(options.count) || 1);
    return credits;
}
