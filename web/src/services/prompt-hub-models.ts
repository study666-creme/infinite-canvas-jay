import type { PromptHubCatalogModel, PromptHubImageModel } from "@/services/prompt-hub";

/** Canvas node model field: ph-hub:<model id> means server-side Prompt Hub generation with credit billing. */
export const PH_HUB_MODEL_PREFIX = "ph-hub:";

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
    return `${PH_HUB_MODEL_PREFIX}${modelId}`;
}

export function isPromptHubModelValue(value?: string | null) {
    return typeof value === "string" && value.startsWith(PH_HUB_MODEL_PREFIX);
}

export function parsePromptHubModelId(value?: string | null) {
    if (!isPromptHubModelValue(value)) return null;
    return value!.slice(PH_HUB_MODEL_PREFIX.length) || null;
}

export function promptHubModelPickerLabel(modelId: string, label?: string) {
    return PROMPT_HUB_MODEL_LABELS[modelId] || (label || modelId).trim();
}

function parameterValues(model: PromptHubImageModel | null | undefined, names: string[]) {
    const parameter = model?.parameters?.find((item) => names.includes(item.name));
    if (!parameter) return [];
    const values = parameter.options?.length
        ? parameter.options
        : Object.prototype.hasOwnProperty.call(parameter, "fixed")
          ? [parameter.fixed]
          : [];
    return values.map((value) => String(value)).filter(Boolean);
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
