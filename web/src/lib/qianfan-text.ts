import type { AiConfig } from "@/stores/use-config-store";

export const QIANFAN_DEFAULT_BASE_URL = "https://qianfan.baidubce.com/v2";

export function isQianfanBaseUrl(baseUrl: string) {
    const value = baseUrl.trim().toLowerCase();
    if (!value) return false;
    try {
        return new URL(value).hostname === "qianfan.baidubce.com";
    } catch {
        return value.includes("qianfan.baidubce.com");
    }
}

export function isQianfanCodingEndpoint(baseUrl: string, model = "") {
    const value = `${baseUrl} ${model}`.toLowerCase();
    return value.includes("/coding") || value.includes("qianfan-code");
}

export function isQianfanTextConfig(config: Pick<AiConfig, "baseUrl">) {
    return isQianfanBaseUrl(config.baseUrl);
}

export function normalizeQianfanBaseUrl(baseUrl: string) {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    return trimmed || QIANFAN_DEFAULT_BASE_URL;
}

export function buildQianfanChatCompletionsUrl(baseUrl: string) {
    const normalized = normalizeQianfanBaseUrl(baseUrl);
    const lower = normalized.toLowerCase();
    if (lower.endsWith("/chat/completions")) return normalized;
    return `${normalized}/chat/completions`;
}
