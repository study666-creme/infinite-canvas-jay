export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_NEW_API_BASE_URL = "https://newapi.prompt-hubs.com";
const PRICING_TIMEOUT_MS = 5000;
const CREDITS_PER_YUAN = 100;
const HIDDEN_MODEL_ALIASES = new Set(["dsv4pro", "glm5.1"]);

type NewApiPricingItem = {
    model_name?: unknown;
    description?: unknown;
    tags?: unknown;
    quota_type?: unknown;
    model_price?: unknown;
};

type NewApiPricingPayload = {
    success?: boolean;
    data?: NewApiPricingItem[];
    pricing_version?: unknown;
    auto_groups?: unknown;
    group_ratio?: unknown;
};

function configuredPricingUrl() {
    const configured = process.env.NEW_API_PRICING_URL || process.env.NEW_API_BASE_URL || process.env.NEXT_PUBLIC_NEW_API_BASE_URL || DEFAULT_NEW_API_BASE_URL;
    return normalizePricingUrl(configured);
}

function pricingHeaders() {
    const apiKey = process.env.NEW_API_API_KEY || process.env.NEW_API_INTERNAL_API_KEY || "";
    return {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
}

function normalizePricingUrl(value: string) {
    const url = new URL(value.trim() || DEFAULT_NEW_API_BASE_URL);
    const path = url.pathname.replace(/\/+$/, "");
    const lowerPath = path.toLowerCase();
    if (lowerPath.endsWith("/api/pricing")) return url.toString();
    const strippedPath = path.replace(/\/(?:v1|api\/v1|api)$/i, "");
    url.pathname = `${strippedPath}/api/pricing`.replace(/\/{2,}/g, "/");
    url.search = "";
    url.hash = "";
    return url.toString();
}

function numberValue(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function primaryGroupRatio(payload: NewApiPricingPayload) {
    const group = Array.isArray(payload.auto_groups) ? stringValue(payload.auto_groups[0]) : "";
    if (!group || !payload.group_ratio || typeof payload.group_ratio !== "object") return 1;
    const ratio = numberValue((payload.group_ratio as Record<string, unknown>)[group]);
    return ratio && ratio > 0 ? ratio : 1;
}

function inferPricingUnit(item: NewApiPricingItem) {
    const text = `${stringValue(item.model_name)} ${stringValue(item.tags)} ${stringValue(item.description)}`.toLowerCase();
    if (
        text.includes("image") ||
        text.includes("banana") ||
        text.includes("gpt-image") ||
        text.includes("dall-e") ||
        text.includes("dalle") ||
        text.includes("imagen") ||
        text.includes("flux") ||
        text.includes("sdxl") ||
        text.includes("stable-diffusion") ||
        text.includes("midjourney")
    ) {
        return "image";
    }
    return "request";
}

function yuanPriceToCredits(price: number) {
    return Math.ceil(price * CREDITS_PER_YUAN - 1e-9);
}

function pricingRulesFromPayload(payload: NewApiPricingPayload) {
    const groupRatio = primaryGroupRatio(payload);
    return (payload.data || [])
        .map((item) => {
            const model = stringValue(item.model_name).trim();
            const quotaType = numberValue(item.quota_type);
            const price = numberValue(item.model_price);
            if (!model || quotaType !== 1 || price === null || price < 0) return null;
            if (HIDDEN_MODEL_ALIASES.has(model.toLowerCase())) return null;
            return {
                id: `new-api:${model}`,
                model,
                unit: inferPricingUnit(item),
                credits: yuanPriceToCredits(price * groupRatio),
            };
        })
        .filter(Boolean);
}

export async function GET() {
    const source = configuredPricingUrl();
    try {
        const response = await fetch(source, {
            headers: pricingHeaders(),
            cache: "no-store",
            signal: AbortSignal.timeout(PRICING_TIMEOUT_MS),
        });
        if (!response.ok) {
            return Response.json({ success: false, rules: [], error: `Pricing request failed: ${response.status}` }, { status: 502 });
        }
        const payload = (await response.json()) as NewApiPricingPayload;
        return Response.json(
            {
                success: payload.success !== false,
                source,
                pricingVersion: stringValue(payload.pricing_version),
                fetchedAt: Date.now(),
                rules: pricingRulesFromPayload(payload),
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Pricing request failed";
        return Response.json({ success: false, rules: [], error: message }, { status: 502 });
    }
}
