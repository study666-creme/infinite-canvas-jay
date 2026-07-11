"use client";

import { useEffect, useMemo, useState } from "react";

import type { ModelPricingRule } from "@/constant/credits";

type RemotePricingPayload = {
    success?: boolean;
    pricingVersion?: string;
    fetchedAt?: number;
    rules?: ModelPricingRule[];
};

type RemotePricingSnapshot = {
    pricingVersion: string;
    fetchedAt: number;
    rules: ModelPricingRule[];
};

const REMOTE_PRICING_REFRESH_MS = 5 * 60 * 1000;

let cachedSnapshot: RemotePricingSnapshot | null = null;
let loadingSnapshot: Promise<RemotePricingSnapshot> | null = null;

function isPricingUnit(value: unknown): value is ModelPricingRule["unit"] {
    return value === "request" || value === "second" || value === "image";
}

function isModelModality(value: unknown): value is NonNullable<ModelPricingRule["modality"]> {
    return value === "text" || value === "image" || value === "video" || value === "audio";
}

function normalizeRules(rules: unknown): ModelPricingRule[] {
    if (!Array.isArray(rules)) return [];
    return rules
        .map((rule) => {
            if (!rule || typeof rule !== "object") return null;
            const item = rule as Partial<ModelPricingRule>;
            const model = typeof item.model === "string" ? item.model.trim() : "";
            const credits = Number(item.credits);
            if (!model || !isPricingUnit(item.unit) || !Number.isFinite(credits) || credits < 0) return null;
            return {
                id: typeof item.id === "string" && item.id ? item.id : `remote:${model}`,
                model,
                unit: item.unit,
                credits,
                ...(isModelModality(item.modality) ? { modality: item.modality } : {}),
                ...(Array.isArray(item.tiers)
                    ? {
                          tiers: item.tiers
                              .map((tier) => {
                                  if (!tier || typeof tier !== "object") return null;
                                  const value = tier as { parameter?: unknown; value?: unknown; credits?: unknown };
                                  const parameter = typeof value.parameter === "string" ? value.parameter : "";
                                  const option = typeof value.value === "string" ? value.value : "";
                                  const tierCredits = Number(value.credits);
                                  return parameter && option && Number.isFinite(tierCredits) && tierCredits >= 0 ? { parameter, value: option, credits: tierCredits } : null;
                              })
                              .filter((tier): tier is { parameter: string; value: string; credits: number } => Boolean(tier)),
                      }
                    : {}),
            };
        })
        .filter((rule): rule is ModelPricingRule => Boolean(rule));
}

export function formatCredits(value: number) {
    return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatYuan(value: number) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export async function loadRemotePricing(force = false) {
    const now = Date.now();
    if (!force && cachedSnapshot && now - cachedSnapshot.fetchedAt < REMOTE_PRICING_REFRESH_MS) return cachedSnapshot;
    if (loadingSnapshot) return loadingSnapshot;

    loadingSnapshot = fetch("/api/model-pricing", { cache: "no-store" })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Remote pricing failed: ${response.status}`);
            const payload = (await response.json()) as RemotePricingPayload;
            if (payload.success === false) throw new Error("Remote pricing failed");
            const snapshot = {
                pricingVersion: payload.pricingVersion || "",
                fetchedAt: Date.now(),
                rules: normalizeRules(payload.rules),
            };
            cachedSnapshot = snapshot;
            return snapshot;
        })
        .finally(() => {
            loadingSnapshot = null;
        });

    return loadingSnapshot;
}

export function mergeModelPricingRules(remoteRules: ModelPricingRule[], localRules: ModelPricingRule[] | undefined) {
    if (!remoteRules.length) return localRules || [];
    const seen = new Set(remoteRules.map((rule) => rule.model.toLowerCase()));
    const fallbackRules = (localRules || []).filter((rule) => !seen.has(rule.model.toLowerCase()));
    return [...remoteRules, ...fallbackRules];
}

export function useRemoteModelPricingRules() {
    const [remoteRules, setRemoteRules] = useState<ModelPricingRule[]>(() => cachedSnapshot?.rules || []);

    useEffect(() => {
        let active = true;
        const refresh = (force = false) => {
            loadRemotePricing(force)
                .then((snapshot) => {
                    if (active) setRemoteRules(snapshot.rules);
                })
                .catch(() => {
                    if (active && cachedSnapshot) setRemoteRules(cachedSnapshot.rules);
                });
        };
        refresh();
        const timer = window.setInterval(() => refresh(true), REMOTE_PRICING_REFRESH_MS);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    return remoteRules;
}

export function useEffectiveModelPricing(localRules: ModelPricingRule[] | undefined) {
    const remoteRules = useRemoteModelPricingRules();
    return useMemo(() => mergeModelPricingRules(remoteRules, localRules), [remoteRules, localRules]);
}
