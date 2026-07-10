import type { ModelPricingRule } from "@/constant/credits";
import type { PromptHubImageModel } from "@/services/prompt-hub";

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

export function builtInPromptHubImageModels(pricingRules: ModelPricingRule[]) {
    const byId = new Map<string, PromptHubImageModel>();
    for (const rule of pricingRules) {
        if (rule.unit !== "image" || rule.credits <= 0) continue;
        const id = promptHubCatalogModelIdForPricingModel(rule.model);
        if (!id) continue;
        const existing = byId.get(id);
        const next: PromptHubImageModel = {
            id,
            label: builtInImageModelLabel(id),
            description: "内置计费模型，按卡藏积分扣费",
            resolutions: imageModelResolutions(id),
            selectable: true,
            cost: { credits: existing?.cost?.credits ? Math.min(existing.cost.credits, rule.credits) : rule.credits },
        };
        byId.set(id, next);
    }
    return Array.from(byId.values());
}

export function mergePromptHubImageModels(serverModels: PromptHubImageModel[], builtInModels: PromptHubImageModel[]) {
    const byId = new Map<string, PromptHubImageModel>();
    for (const model of serverModels) {
        if (model.id) byId.set(model.id, model);
    }
    for (const model of builtInModels) {
        const existing = byId.get(model.id);
        byId.set(model.id, {
            ...model,
            ...(existing ? { label: existing.label || model.label, description: existing.description || model.description, resolutions: existing.resolutions || model.resolutions } : {}),
            cost: model.cost,
            selectable: true,
        });
    }
    return Array.from(byId.values()).filter((model) => model.selectable !== false);
}

function builtInImageModelLabel(model: string) {
    const value = model.toLowerCase();
    if (value === "newapi-gpt-image-2-official-budget") return "GPT-Image-2 官方低价";
    if (value === "gpt-image-2" || value === "newapi-gpt-image-2") return "GPT-Image-2";
    if (value.includes("gpt-image-2-ext-1k")) return "GPT-Image-2 Ext 1K";
    if (value.includes("gpt-image-2-ext-2k")) return "GPT-Image-2 Ext 2K";
    if (value.includes("gpt-image-2-ext-4k")) return "GPT-Image-2 Ext 4K";
    if (value.includes("nano-banana-2")) return "Nano Banana 2";
    if (value.includes("nano-banana-pro")) return "Nano Banana Pro";
    if (value.includes("nano-banana-fast")) return "Nano Banana Fast";
    if (value.includes("nano-banana")) return "Nano Banana";
    return model;
}

function promptHubCatalogModelIdForPricingModel(model: string) {
    const value = model.trim().toLowerCase();
    if (!value) return null;
    if (value.startsWith("newapi-")) return value;
    if (value === "gpt-image-2") return "newapi-gpt-image-2";
    if (/^gpt-image-2-ext-(1k|2k|4k)$/.test(value)) return `newapi-${value}`;
    if (/^gpt-image-2-official(?:-(1k|2k|4k))?$/.test(value)) return "newapi-gpt-image-2-official-budget";
    if (["nano-banana-fast", "nano-banana-2", "nano-banana-pro", "nano-banana"].includes(value)) return `newapi-${value}`;
    return null;
}

function imageModelResolutions(model: string) {
    const value = model.toLowerCase();
    if (value === "newapi-gpt-image-2-official-budget") return ["1k", "2k", "4k"];
    if (value.includes("1k")) return ["1k"];
    if (value.includes("2k")) return ["2k"];
    if (value.includes("4k")) return ["4k"];
    return ["1k", "2k", "4k"];
}
