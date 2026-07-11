import type { ComponentProps } from "react";
import { Zap } from "lucide-react";

import { modelOptionName } from "@/stores/use-config-store";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            <Zap className="size-[1em] fill-current" strokeWidth={2.4} />
        </span>
    );
}

export type ModelPricingUnit = "request" | "second" | "image";

export type ModelPricingRule = {
    id: string;
    model: string;
    modality?: "text" | "image" | "video" | "audio";
    unit: ModelPricingUnit;
    credits: number;
    tiers?: Array<{ parameter: string; value: string; credits: number }>;
};

export type ModelCreditCost = {
    model: string;
    credits: number;
};

function resolveBillableSeconds(value: string | number | undefined) {
    if (String(value).trim() === "-1") return 6;
    const seconds = Math.floor(Number(value) || 6);
    return Math.max(1, Math.min(15, seconds));
}

export function resolveModelPricingRule(rules: ModelPricingRule[] | undefined, model: string) {
    if (!rules?.length) return null;
    const modelName = modelOptionName(model).toLowerCase();
    const modelKey = model.toLowerCase();
    const exact = rules.find((rule) => rule.model.toLowerCase() === modelKey || rule.model.toLowerCase() === modelName);
    if (exact) return exact;
    return rules
        .filter((rule) => {
            const token = rule.model.toLowerCase();
            return modelName.includes(token) || modelKey.includes(token);
        })
        .sort((a, b) => b.model.length - a.model.length)[0] || null;
}

export function requestCreditCost(options: {
    channelMode?: string;
    modelPricing?: ModelPricingRule[];
    modelCosts?: ModelCreditCost[];
    model: string;
    count?: string | number;
    videoSeconds?: string | number;
    quality?: string;
    resolution?: string;
}) {
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    const seconds = resolveBillableSeconds(options.videoSeconds);
    const rule = resolveModelPricingRule(options.modelPricing, options.model);
    if (rule) {
        const tier = rule.tiers?.find((item) => {
            const current = item.parameter === "quality" ? options.quality || options.resolution : options.resolution || options.quality;
            return String(current || "").toLowerCase() === item.value.toLowerCase();
        });
        const credits = tier?.credits ?? rule.credits;
        if (rule.unit === "second") return credits * seconds;
        if (rule.unit === "image") return credits * count;
        return credits;
    }
    const legacy = options.modelCosts?.find((item) => item.model === options.model)?.credits || 0;
    if (legacy) return legacy * count;
    return 0;
}

export function durationOptionCreditCost(model: string, modelPricing: ModelPricingRule[] | undefined, secondsValue: string | number) {
    if (String(secondsValue).trim() === "-1") {
        return requestCreditCost({ modelPricing, model, videoSeconds: "6" });
    }
    return requestCreditCost({ modelPricing, model, videoSeconds: secondsValue });
}

export function pricingUnitLabel(unit: ModelPricingUnit) {
    return unit === "second" ? "积分/秒" : unit === "image" ? "积分/张" : "积分/次";
}
