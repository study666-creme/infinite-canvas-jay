import type { PromptHubCatalogModel, PromptHubImageModel } from "@/services/prompt-hub";

/** Canvas node model field: ph-hub:<model id> means server-side Prompt Hub generation with credit billing. */
export const PH_HUB_MODEL_PREFIX = "ph-hub:";

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
    const name = (label || modelId).trim();
    return `卡藏 · ${name}`;
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
