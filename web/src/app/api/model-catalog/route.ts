export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_NEW_API_BASE_URL = "https://newapi.prompt-hubs.com";
const FALLBACK_ALIASES: Record<string, { id: string; label: string; description: string }> = {
    "gpt-5.5": { id: "creative-5-5", label: "全能模型5.5", description: "通用创作与推理模型，最高 xhigh 思考。" },
    "gpt-5.6-sol": { id: "creative-5-6", label: "全能模型5.6", description: "旗舰创作与推理模型，最高 ultra 思考。" },
    "gpt-image-2-1k": { id: "image2-economy", label: "全能模型2 · 特价 1K", description: "特价 1K 生图模型，支持参考图。" },
    "gpt-image-2": { id: "image2", label: "全能模型2 · 1K", description: "标准生图模型，固定 1K。" },
    "gpt-image-2-4k-fast": { id: "image2-4k-fast", label: "全能模型2 · 极速 4K", description: "固定 4K 的快速生图模型，支持多种画面比例。" },
    "gpt-image-2-ext": { id: "image2-pro", label: "全能模型2 · 高质量 1K/2K/4K", description: "高质量生图模型，支持 1K/2K/4K。" },
    image2k4k: { id: "image2-hd", label: "全能模型2 · 经济 2K/4K", description: "高分辨率经济模型，支持 2K/4K。" },
    "nano-banana-fast": { id: "lingtu-fast", label: "香蕉 · 极速 1K", description: "快速生图模型，固定 1K。" },
    "nano-banana-2": { id: "lingtu-2", label: "香蕉 · 2代 1K/2K/4K", description: "通用生图模型，支持 1K/2K/4K。" },
    "nano-banana-pro": { id: "lingtu-pro", label: "香蕉 · 专业 1K/2K/4K", description: "高质量通用生图模型，支持 1K/2K/4K。" },
    "nano-banana": { id: "lingtu", label: "香蕉 · 标准 1K/2K/4K", description: "通用生图模型，支持 1K/2K/4K。" },
    "grok-video": { id: "motion-video", label: "Grok Video", description: "按秒计费的视频模型。" },
    "grok-video-1.5": { id: "motion-video-1-5", label: "Grok Video 1.5", description: "按秒计费的视频模型。" },
};

function catalogUrl() {
    const configured = process.env.NEW_API_CATALOG_URL || process.env.NEW_API_BASE_URL || process.env.NEXT_PUBLIC_NEW_API_BASE_URL || DEFAULT_NEW_API_BASE_URL;
    const url = new URL(configured.trim() || DEFAULT_NEW_API_BASE_URL);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path.toLowerCase().endsWith("/api/model-catalog")) {
        url.pathname = `${path.replace(/\/(?:v1|api\/v1|api)$/i, "")}/api/model-catalog`.replace(/\/{2,}/g, "/");
    }
    url.search = "";
    url.hash = "";
    return url.toString();
}

function publicCatalog(payload: unknown) {
    if (!payload || typeof payload !== "object") return payload;
    const source = payload as Record<string, unknown>;
    const models = Array.isArray(source.models)
        ? source.models.flatMap((value) => {
              if (!value || typeof value !== "object") return [];
              const model = value as Record<string, unknown>;
              const upstreamId = typeof model.id === "string" ? model.id : "";
              const declared = model.public && typeof model.public === "object" ? (model.public as Record<string, unknown>) : null;
              const fallback = FALLBACK_ALIASES[upstreamId] || {
                  id: upstreamId,
                  label: typeof model.label === "string" ? model.label : upstreamId,
                  description: typeof model.description === "string" ? model.description : "",
              };
              const canonical = FALLBACK_ALIASES[upstreamId];
              const id = canonical?.id || (typeof declared?.id === "string" && declared.id ? declared.id : fallback.id);
              if (!id) return [];
              const parameters = Array.isArray(model.parameters)
                  ? model.parameters.map((parameter) => {
                        if (!parameter || typeof parameter !== "object") return parameter;
                        const item = parameter as Record<string, unknown>;
                        return item.name === "model" ? { ...item, fixed: id } : item;
                    })
                  : [];
              return [{
                  id,
                  label: canonical?.label || (typeof declared?.label === "string" && declared.label ? declared.label : fallback.label),
                  description: typeof declared?.description === "string" && declared.description ? declared.description : fallback.description,
                  modality: model.modality,
                  operation: model.operation,
                  order: model.order,
                  selectable: model.selectable === true,
                  endpoint: model.modality === "image"
                      ? { method: "POST", path: "/api/v1/generate", content_type: "application/json" }
                      : model.modality === "video"
                        ? { method: "POST", path: "/api/v1/video", content_type: "application/json" }
                        : { method: "POST", path: "/api/v1/chat", content_type: "application/json" },
                  input: model.input,
                  output: model.output,
                  parameters,
                  pricing: model.pricing,
              }];
          })
        : [];
    return {
        success: source.success !== false,
        version: source.version,
        capability_version: source.capability_version,
        pricing_version: source.pricing_version,
        fetched_at: source.fetched_at,
        credits_per_yuan: source.credits_per_yuan,
        models,
    };
}

export async function GET() {
    try {
        const response = await fetch(catalogUrl(), {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return Response.json({ success: false, error: "Model catalog request failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
        return Response.json(publicCatalog(payload), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return Response.json(
            { success: false, error: error instanceof Error ? error.message : "Model catalog request failed" },
            { status: 502, headers: { "Cache-Control": "no-store" } },
        );
    }
}
