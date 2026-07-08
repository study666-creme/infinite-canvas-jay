import { NextRequest } from "next/server";

export const runtime = "nodejs";

type MobileAgentRole = "system" | "user" | "assistant";
type MobileAgentMessage = {
    role: MobileAgentRole;
    content: string;
};

type MobileAgentRequest = {
    accessToken?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    messages?: MobileAgentMessage[];
    systemPrompt?: string;
};

type ChatCompletionChunk = {
    choices?: Array<{
        delta?: { content?: string | null };
        message?: { content?: string | null };
    }>;
    error?: { message?: string };
    msg?: string;
};

const encoder = new TextEncoder();
const defaultBaseUrl = "https://api.openai.com/v1";
const defaultModel = "gpt-5-mini";
const defaultSystemPrompt =
    "你是卡藏移动助手，负责用中文直接、清楚地回答用户。只返回对用户有用的文字回复；不要声称你能直接操作桌面 Codex、文件系统或画布，除非当前请求明确提供了相应工具结果。";

function jsonResponse(payload: unknown, status = 200) {
    return Response.json(payload, { status });
}

function cleanString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeMessages(messages: unknown): MobileAgentMessage[] {
    if (!Array.isArray(messages)) return [];
    return messages
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const value = item as Partial<MobileAgentMessage>;
            const role = value.role;
            const content = cleanString(value.content);
            if ((role !== "system" && role !== "user" && role !== "assistant") || !content) return null;
            return { role, content };
        })
        .filter((item): item is MobileAgentMessage => Boolean(item))
        .slice(-30);
}

function chatCompletionsUrl(baseUrl: string) {
    let normalized = (baseUrl || defaultBaseUrl).trim().replace(/\/+$/, "");
    const lower = normalized.toLowerCase();
    if (lower.endsWith("/chat/completions")) return normalized;
    if (!lower.endsWith("/v1") && !lower.endsWith("/api/v3")) normalized = `${normalized}/v1`;
    return `${normalized}/chat/completions`;
}

function errorFromPayload(payload: ChatCompletionChunk) {
    return payload.error?.message || payload.msg || "";
}

function textFromPayload(payload: ChatCompletionChunk) {
    return payload.choices?.[0]?.delta?.content || payload.choices?.[0]?.message?.content || "";
}

async function upstreamError(response: Response) {
    const text = await response.text();
    if (!text) return `模型请求失败：${response.status}`;
    try {
        const payload = JSON.parse(text) as ChatCompletionChunk;
        return errorFromPayload(payload) || `模型请求失败：${response.status}`;
    } catch {
        return text.slice(0, 500);
    }
}

function consumeSseBlock(block: string, onText: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const payload = JSON.parse(data) as ChatCompletionChunk;
    const error = errorFromPayload(payload);
    if (error) throw new Error(error);
    const text = textFromPayload(payload);
    if (text) onText(text);
}

function consumeSseBuffer(state: { buffer: string }, chunk: string, onText: (text: string) => void, flush = false) {
    state.buffer += chunk;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeSseBlock(state.buffer.slice(0, index), onText);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeSseBlock(state.buffer, onText);
        state.buffer = "";
    }
}

export async function POST(request: NextRequest) {
    let body: MobileAgentRequest;
    try {
        body = (await request.json()) as MobileAgentRequest;
    } catch {
        return jsonResponse({ error: "请求体不是有效 JSON" }, 400);
    }

    const envApiKey = cleanString(process.env.OPENAI_API_KEY || process.env.KAZANG_OPENAI_API_KEY);
    const envAccessToken = cleanString(process.env.MOBILE_AGENT_ACCESS_TOKEN || process.env.KAZANG_AGENT_ACCESS_TOKEN);
    const accessToken = cleanString(request.headers.get("x-mobile-agent-token") || body.accessToken);
    const clientApiKey = cleanString(body.apiKey);

    if (envAccessToken && accessToken !== envAccessToken) {
        return jsonResponse({ error: "访问口令不正确" }, 401);
    }
    if (!envAccessToken && envApiKey && !clientApiKey) {
        return jsonResponse({ error: "服务器已配置 API Key，但未配置 MOBILE_AGENT_ACCESS_TOKEN。为避免公开滥用，请配置访问口令，或在本机页面填写个人 API Key。" }, 401);
    }

    const apiKey = clientApiKey || envApiKey;
    if (!apiKey) return jsonResponse({ error: "缺少 API Key" }, 400);

    const messages = normalizeMessages(body.messages);
    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
        return jsonResponse({ error: "请先输入消息" }, 400);
    }

    const systemPrompt = cleanString(body.systemPrompt) || defaultSystemPrompt;
    const payload = {
        model: cleanString(body.model || process.env.OPENAI_MODEL) || defaultModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
    };

    const response = await fetch(chatCompletionsUrl(cleanString(body.baseUrl || process.env.OPENAI_BASE_URL) || defaultBaseUrl), {
        method: "POST",
        headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) return jsonResponse({ error: await upstreamError(response) }, response.status);
    if (!response.body) return jsonResponse({ error: "模型没有返回可读取内容" }, 502);

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
                controller.close();
                return;
            }

            const decoder = new TextDecoder();
            const state = { buffer: "" };
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    consumeSseBuffer(state, decoder.decode(value, { stream: true }), (text) => controller.enqueue(encoder.encode(text)));
                }
                consumeSseBuffer(state, decoder.decode(), (text) => controller.enqueue(encoder.encode(text)), true);
                controller.close();
            } catch (error) {
                controller.error(error);
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
}
