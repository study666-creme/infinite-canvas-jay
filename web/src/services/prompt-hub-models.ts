import type { PromptHubCatalogModel, PromptHubImageModel } from "@/services/prompt-hub";

/** Canvas node model field: kazhang-api:<model id> means secure Card Vault API generation with account billing. */
export const KAZHANG_API_MODEL_PREFIX = "kazhang-api:";
export const LEGACY_KACHANG_API_MODEL_PREFIX = "kachang-api:";
export const LEGACY_PROMPT_HUB_MODEL_PREFIX = "ph-hub:";
export const PH_HUB_MODEL_PREFIX = KAZHANG_API_MODEL_PREFIX;
export const GROK_VIDEO_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const PROMPT_HUB_SCOPED_MODEL_PATTERN = /^_sf-[A-Za-z0-9_-]+::\S+$/;

const PROMPT_HUB_MODEL_LABELS: Record<string, string> = {
    "creative-5-5": "全能模型5.5",
    "creative-5-6": "全能模型5.6",
    image2: "全能模型2 · 1K",
    "image2-pro": "全能模型2 · 高质量 2K/4K",
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
};

export function toPromptHubModelValue(modelId: string) {
    return `${KAZHANG_API_MODEL_PREFIX}${modelId}`;
}

export function isPromptHubModelValue(value?: string | null) {
    const normalized = String(value || "").trim();
    return Boolean(normalized) && (normalized.startsWith(KAZHANG_API_MODEL_PREFIX) || normalized.startsWith(LEGACY_KACHANG_API_MODEL_PREFIX) || normalized.startsWith(LEGACY_PROMPT_HUB_MODEL_PREFIX) || PROMPT_HUB_SCOPED_MODEL_PATTERN.test(normalized));
}

export function parsePromptHubModelId(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!isPromptHubModelValue(normalized)) return null;
    if (PROMPT_HUB_SCOPED_MODEL_PATTERN.test(normalized)) return normalized;
    const prefix = normalized.startsWith(KAZHANG_API_MODEL_PREFIX)
        ? KAZHANG_API_MODEL_PREFIX
        : normalized.startsWith(LEGACY_KACHANG_API_MODEL_PREFIX)
          ? LEGACY_KACHANG_API_MODEL_PREFIX
          : LEGACY_PROMPT_HUB_MODEL_PREFIX;
    return normalized.slice(prefix.length) || null;
}

export function promptHubModelPickerLabel(modelId: string, label?: string) {
    return PROMPT_HUB_MODEL_LABELS[modelId] || (label || modelId).trim();
}

function parameterValues(model: PromptHubCatalogModel | null | undefined, names: string[]) {
    const parameter = model?.parameters?.find((item) => names.includes(item.name));
    if (!parameter) return [];
    const values = parameter.options?.length
        ? parameter.options
        : Object.prototype.hasOwnProperty.call(parameter, "fixed")
          ? [parameter.fixed]
          : [];
    return values.map((value) => String(value)).filter(Boolean);
}

export function promptHubVideoAspectRatios(model: PromptHubCatalogModel | null | undefined, modelId?: string | null) {
    const declared = parameterValues(model, ["ratio", "aspect_ratio"]);
    if (declared.length) return declared;
    if (modelId === "motion-video" || modelId === "motion-video-1-5") return [...GROK_VIDEO_ASPECT_RATIOS];
    return modelId?.startsWith("sd") ? ["16:9", "9:16", "1:1"] : [];
}

export function promptHubVideoResolutions(model: PromptHubCatalogModel | null | undefined, modelId?: string | null) {
    const declared = parameterValues(model, ["resolution"]);
    if (declared.length) return declared.map(normalizeVideoResolutionToken);
    if (modelId === "motion-video" || modelId === "motion-video-1-5") return ["480p", "720p"];
    if (modelId === "sd1080-4k") return ["1080p", "4k"];
    if (modelId?.includes("四图版")) return ["720p"];
    return modelId?.startsWith("sd") ? ["480p", "720p"] : [];
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
    const normalized = String(value || "").trim().toLowerCase();
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
    return declared.length ? declared : (model?.resolutions || []).map((value) => String(value).toLowerCase()).filter((value) => value === "1k" || value === "2k" || value === "4k");
}

export function promptHubImageMaxReferences(model: PromptHubImageModel | null | undefined) {
    const multiple = model?.parameters?.find((parameter) => parameter.name === "images" || parameter.name === "refImageUrls");
    if (typeof multiple?.max_items === "number") return multiple.max_items;
    return model?.parameters?.some((parameter) => parameter.name === "image" || parameter.name === "refImageUrl") ? 1 : null;
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
    const min = Math.max(1, declaredMin ?? (options.length ? Math.min(...options) : defaultValue ?? 1));
    const max = Math.max(min, Math.min(15, declaredMax ?? (options.length ? Math.max(...options) : defaultValue ?? min)));
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

export function promptHubCatalogCredits(
    model: PromptHubCatalogModel | null | undefined,
    options: { duration?: string | number; resolution?: string; quality?: string; count?: string | number } = {},
) {
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
