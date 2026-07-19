export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_NEW_API_BASE_URL = "https://newapi.prompt-hubs.com";
const CATALOG_TIMEOUT_MS = 5000;

type CatalogTier = {
    when?: unknown;
    yuan?: unknown;
    credits?: unknown;
};

type CatalogPricing = {
    unit?: unknown;
    yuan?: unknown;
    credits?: unknown;
    tiers?: unknown;
};

type CatalogModel = {
    id?: unknown;
    public?: unknown;
    modality?: unknown;
    selectable?: unknown;
    pricing?: CatalogPricing;
};

const CREDITS_PER_YUAN = 100;
const PUBLIC_MODEL_IDS: Record<string, string> = {
    "gpt-5.5": "creative-5-5",
    "gpt-5.6-sol": "creative-5-6",
    "gpt-image-2-1k": "image2-economy",
    "gpt-image-2": "image2",
    "gpt-image-2-4k-fast": "image2-4k-fast",
    "gpt-image-2-ext": "image2-pro",
    image2k4k: "image2-hd",
    "nano-banana-fast": "lingtu-fast",
    "nano-banana-2": "lingtu-2",
    "nano-banana-pro": "lingtu-pro",
    "nano-banana": "lingtu",
    "grok-video": "motion-video",
    "grok-video-1.5": "motion-video-1-5",
};

type CatalogPayload = {
    success?: boolean;
    version?: unknown;
    pricing_version?: unknown;
    fetched_at?: unknown;
    models?: CatalogModel[];
};

function configuredCatalogUrl() {
    const configured = process.env.NEW_API_CATALOG_URL || process.env.NEW_API_BASE_URL || process.env.NEXT_PUBLIC_NEW_API_BASE_URL || DEFAULT_NEW_API_BASE_URL;
    const url = new URL(configured.trim() || DEFAULT_NEW_API_BASE_URL);
    const path = url.pathname.replace(/\/+$/, "");
    if (path.toLowerCase().endsWith("/api/model-catalog")) return url.toString();
    url.pathname = `${path.replace(/\/(?:v1|api\/v1|api)$/i, "")}/api/model-catalog`.replace(/\/{2,}/g, "/");
    url.search = "";
    url.hash = "";
    return url.toString();
}

function catalogHeaders() {
    const apiKey = process.env.NEW_API_API_KEY || process.env.NEW_API_INTERNAL_API_KEY || "";
    return {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function creditsFromYuan(value: unknown) {
    const yuan = numberValue(value);
    return yuan === null ? null : Number((yuan * CREDITS_PER_YUAN).toFixed(8));
}

function pricingRules(payload: CatalogPayload) {
    return (payload.models || [])
        .map((model) => {
            const upstreamId = stringValue(model.id);
            const declaredPublic = model.public && typeof model.public === "object" ? stringValue((model.public as Record<string, unknown>).id) : "";
            const id = declaredPublic || PUBLIC_MODEL_IDS[upstreamId] || upstreamId;
            const modality = stringValue(model.modality);
            const unit = stringValue(model.pricing?.unit);
            const credits = creditsFromYuan(model.pricing?.yuan);
            if (!id || model.selectable !== true || !["text", "image", "video", "audio"].includes(modality)) return null;
            if (unit !== "request" && unit !== "second" && unit !== "image") return null;
            if (credits === null || credits < 0) return null;
            const tiers = (Array.isArray(model.pricing?.tiers) ? model.pricing.tiers : [])
                .map((raw) => {
                    if (!raw || typeof raw !== "object") return null;
                    const tier = raw as CatalogTier;
                    const when = tier.when && typeof tier.when === "object" ? tier.when as Record<string, unknown> : null;
                    const entry = when ? Object.entries(when)[0] : null;
                    const tierCredits = creditsFromYuan(tier.yuan);
                    if (!entry || tierCredits === null || tierCredits < 0) return null;
                    return { parameter: entry[0], value: String(entry[1]), credits: tierCredits };
                })
                .filter(Boolean);
            return {
                id: `new-api:${id}`,
                model: id,
                modality,
                unit,
                credits,
                ...(tiers.length ? { tiers } : {}),
            };
        })
        .filter(Boolean);
}

export async function GET() {
    const source = configuredCatalogUrl();
    try {
        const response = await fetch(source, {
            headers: catalogHeaders(),
            cache: "no-store",
            signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
        });
        if (!response.ok) {
            return Response.json({ success: false, rules: [], error: `Model catalog request failed: ${response.status}` }, { status: 502 });
        }
        const payload = (await response.json()) as CatalogPayload;
        if (payload.success === false || !Array.isArray(payload.models)) {
            return Response.json({ success: false, rules: [], error: "Invalid model catalog" }, { status: 502 });
        }
        return Response.json(
            {
                success: true,
                source,
                catalogVersion: stringValue(payload.version),
                pricingVersion: stringValue(payload.pricing_version),
                fetchedAt: Date.parse(stringValue(payload.fetched_at)) || Date.now(),
                rules: pricingRules(payload),
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Model catalog request failed";
        return Response.json({ success: false, rules: [], error: message }, { status: 502 });
    }
}
