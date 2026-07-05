import type { AiConfig } from "@/stores/use-config-store";
import { buildQianfanChatCompletionsUrl, isQianfanCodingEndpoint } from "@/lib/qianfan-text";
import type { AiTextMessage, ResponseFunctionTool, ResponseInputMessage, ResponseToolCall, ToolResponseResult } from "@/services/api/image";

type RequestOptions = { signal?: AbortSignal };
type ToolChoice = "auto" | "required" | { type: "function"; name: string };

type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessageContent = AiTextMessage["content"] | string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "input_text"; text: string } | { type: "input_image"; image_url: string }>;
type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content?: string | ChatContentPart[] | null;
    tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
};

type ChatCompletionPayload = {
    choices?: Array<{
        message?: {
            content?: string | null;
            tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
        };
        delta?: {
            content?: string | null;
            tool_calls?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
        };
    }>;
    error?: { message?: string };
    msg?: string;
    code?: number;
};

type ChatStreamState = {
    buffer: string;
    text: string;
    toolCalls: ResponseToolCall[];
    error?: string;
    toolDrafts: Array<{ id: string; name: string; arguments: string }>;
};

function aiHeaders(config: AiConfig) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

function chatErrorMessage(payload: unknown) {
    if (!payload || typeof payload !== "object") return "";
    const value = payload as { msg?: string; error?: { message?: string } };
    return value.msg || value.error?.message || "";
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    if (!text) return readStatusError(response.status, fallback);
    try {
        return chatErrorMessage(JSON.parse(text)) || readStatusError(response.status, fallback);
    } catch {
        return text.slice(0, 300) || readStatusError(response.status, fallback);
    }
}

function validateChatPayload(payload: ChatCompletionPayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "请求失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function toChatContent(content: ChatMessageContent): string | ChatContentPart[] {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => {
        if (item.type === "text" || item.type === "input_text") return { type: "text" as const, text: item.text };
        const url = item.type === "image_url" ? item.image_url.url : item.image_url;
        return { type: "image_url" as const, image_url: { url } };
    });
}

function flattenVisionMessages(messages: AiTextMessage[], config: AiConfig) {
    if (!isQianfanCodingEndpoint(config.baseUrl, config.model)) return messages;
    return messages.map((message) => {
        if (!Array.isArray(message.content)) return message;
        const text = message.content
            .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n");
        const imageCount = message.content.filter((part) => part.type === "image_url").length;
        const suffix = imageCount ? `\n\n（已连接 ${imageCount} 张参考图；当前千帆 Coding 模型不支持识图，请仅根据文字内容作答。）` : "";
        return { ...message, content: `${text}${suffix}`.trim() };
    });
}

function flattenVisionResponseMessages(messages: ResponseInputMessage[], config: AiConfig): ResponseInputMessage[] {
    if (!isQianfanCodingEndpoint(config.baseUrl, config.model)) return messages;
    return messages.map((message) => {
        if (!("role" in message) || message.role !== "user" || !Array.isArray(message.content)) return message;
        const text = message.content
            .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n");
        const imageCount = message.content.filter((part) => part.type === "image_url").length;
        const suffix = imageCount ? `\n\n（已连接 ${imageCount} 张参考图；当前千帆 Coding 模型不支持识图，请仅根据文字内容作答。）` : "";
        return { ...message, content: `${text}${suffix}`.trim() };
    });
}

function toChatMessagesFromAiMessages(messages: AiTextMessage[]): ChatMessage[] {
    return messages.map((message) => ({
        role: message.role,
        content: toChatContent(message.content),
    }));
}

function toChatMessagesFromResponseMessages(messages: ResponseInputMessage[]): ChatMessage[] {
    return messages.flatMap((message): ChatMessage[] => {
        if ("type" in message) {
            return [
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: message.call_id,
                            type: "function",
                            function: { name: message.name, arguments: message.arguments },
                        },
                    ],
                },
            ];
        }
        if (message.role === "tool") {
            return [{ role: "tool", tool_call_id: message.tool_call_id, content: message.content }];
        }
        return [{ role: message.role, content: toChatContent(message.content) }];
    });
}

function toChatTools(tools: ResponseFunctionTool[]) {
    return tools.map((tool) => ({
        type: "function" as const,
        function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
        },
    }));
}

function toChatToolChoice(toolChoice: ToolChoice) {
    if (typeof toolChoice === "object") {
        return { type: "function" as const, function: { name: toolChoice.name } };
    }
    if (toolChoice === "required") return "required" as const;
    return "auto" as const;
}

function parseChatCompletion(payload: ChatCompletionPayload): ToolResponseResult {
    validateChatPayload(payload);
    const message = payload.choices?.[0]?.message;
    const content = message?.content || "";
    const toolCalls =
        message?.tool_calls
            ?.map((call) => ({
                id: call.id || "",
                type: "function" as const,
                function: { name: call.function?.name || "", arguments: call.function?.arguments || "{}" },
            }))
            .filter((call) => call.id && call.function.name) || [];
    return { content: typeof content === "string" ? content : "", toolCalls };
}

function consumeChatStreamBlock(block: string, state: ChatStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;

    const payload = JSON.parse(data) as ChatCompletionPayload;
    const errorMessage = chatErrorMessage(payload);
    if (errorMessage) state.error = errorMessage;

    const delta = payload.choices?.[0]?.delta;
    if (typeof delta?.content === "string" && delta.content) {
        state.text += delta.content;
        onDelta?.(state.text);
    }

    for (const toolDelta of delta?.tool_calls || []) {
        const index = toolDelta.index ?? 0;
        while (state.toolDrafts.length <= index) {
            state.toolDrafts.push({ id: "", name: "", arguments: "" });
        }
        const draft = state.toolDrafts[index];
        if (toolDelta.id) draft.id = toolDelta.id;
        if (toolDelta.function?.name) draft.name = toolDelta.function.name;
        if (toolDelta.function?.arguments) draft.arguments += toolDelta.function.arguments;
    }
}

function consumeChatStreamText(state: ChatStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeChatStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeChatStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function finalizeToolDrafts(state: ChatStreamState) {
    state.toolCalls = state.toolDrafts
        .filter((draft) => draft.id && draft.name)
        .map((draft) => ({
            id: draft.id,
            type: "function" as const,
            function: { name: draft.name, arguments: draft.arguments || "{}" },
        }));
}

async function requestChatCompletions(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const targetUrl = buildQianfanChatCompletionsUrl(config.baseUrl, config.model);
    const payload = JSON.stringify({ ...body, stream: true });
    const headers = { ...aiHeaders(config), Accept: "text/event-stream", "Content-Type": "application/json" };
    const response =
        typeof window !== "undefined"
            ? await fetch("/api/qianfan-proxy", {
                  method: "POST",
                  headers: {
                      Accept: "text/event-stream",
                      "Content-Type": "application/json",
                      "x-qianfan-target": targetUrl,
                      "x-qianfan-authorization": headers.Authorization,
                  },
                  body: payload,
                  signal: options?.signal,
              })
            : await fetch(targetUrl, {
                  method: "POST",
                  headers,
                  body: payload,
                  signal: options?.signal,
              });
    if (!response.ok) throw new Error(await readFetchError(response, "千帆文本请求失败"));

    if (!response.body) {
        const payload = (await response.json()) as ChatCompletionPayload;
        return parseChatCompletion(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: ChatStreamState = { buffer: "", text: "", toolCalls: [], toolDrafts: [] };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeChatStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeChatStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    finalizeToolDrafts(state);
    return { content: state.text, toolCalls: state.toolCalls };
}

export async function requestQianfanText(config: AiConfig, messages: AiTextMessage[], onDelta?: (text: string) => void, options?: RequestOptions) {
    const normalizedMessages = flattenVisionMessages(messages, config);
    const result = await requestChatCompletions(
        config,
        {
            model: config.model,
            messages: toChatMessagesFromAiMessages(normalizedMessages),
        },
        onDelta,
        options,
    );
    return result.content || "没有返回内容";
}

export async function requestQianfanToolResponse(
    config: AiConfig,
    messages: ResponseInputMessage[],
    tools: ResponseFunctionTool[],
    toolChoice: ToolChoice = "auto",
    onDelta?: (text: string) => void,
    options?: RequestOptions,
): Promise<ToolResponseResult> {
    const normalizedMessages = flattenVisionResponseMessages(messages, config);
    return requestChatCompletions(
        config,
        {
            model: config.model,
            messages: toChatMessagesFromResponseMessages(normalizedMessages),
            ...(tools.length ? { tools: toChatTools(tools), tool_choice: toChatToolChoice(toolChoice) } : {}),
        },
        onDelta,
        options,
    );
}
