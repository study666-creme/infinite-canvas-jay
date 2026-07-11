"use client";

import {
    submitPromptHubChat,
    type PromptHubChatMessage,
    type PromptHubSession,
} from "@/services/prompt-hub";
import type {
    AiTextMessage,
    ResponseFunctionTool,
    ResponseInputMessage,
    ToolResponseResult,
} from "@/services/api/image";

function plainContent(content: AiTextMessage["content"]) {
    if (!Array.isArray(content)) return content;
    return content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
}

type PromptHubToolChoice = "auto" | "required" | { type: "function"; name: string };

function promptHubToolMessages(messages: ResponseInputMessage[]) {
    const output: PromptHubChatMessage[] = [];
    for (const message of messages) {
        if ("type" in message) {
            const toolCall = {
                id: message.call_id,
                type: "function" as const,
                function: { name: message.name, arguments: message.arguments },
            };
            const previous = output.at(-1);
            if (previous?.role === "assistant" && previous.tool_calls) {
                previous.tool_calls.push(toolCall);
            } else {
                output.push({ role: "assistant", content: null, tool_calls: [toolCall] });
            }
            continue;
        }
        if (message.role === "tool") {
            output.push({ role: "tool", tool_call_id: message.tool_call_id, content: message.content || "{}" });
            continue;
        }
        output.push({
            role: message.role,
            content: plainContent(message.content) || "[无文字内容]",
        });
    }
    return output;
}

function promptHubToolChoice(toolChoice: PromptHubToolChoice) {
    if (typeof toolChoice === "string") return toolChoice;
    return { type: "function", function: { name: toolChoice.name } };
}

export async function requestPromptHubText(
    session: PromptHubSession,
    model: string,
    messages: AiTextMessage[],
    opts: { apiBase?: string; signal?: AbortSignal } = {},
) {
    const result = await submitPromptHubChat(session, {
        model,
        messages: messages.map((message) => ({ role: message.role, content: plainContent(message.content) || "[无文字内容]" })),
        maxTokens: 8192,
        apiBase: opts.apiBase,
        signal: opts.signal,
    });
    return result.reply;
}

export async function requestPromptHubToolResponse(
    session: PromptHubSession,
    model: string,
    messages: ResponseInputMessage[],
    tools: ResponseFunctionTool[],
    toolChoice: PromptHubToolChoice = "auto",
    onDelta?: (text: string) => void,
    opts: { apiBase?: string; signal?: AbortSignal } = {},
): Promise<ToolResponseResult> {
    const result = await submitPromptHubChat(session, {
        model,
        messages: promptHubToolMessages(messages),
        tools: tools as unknown as Array<Record<string, unknown>>,
        toolChoice: promptHubToolChoice(toolChoice),
        maxTokens: 8192,
        apiBase: opts.apiBase,
        signal: opts.signal,
    });
    if (result.reply) onDelta?.(result.reply);
    return { content: result.reply || "", toolCalls: result.toolCalls || [] };
}
