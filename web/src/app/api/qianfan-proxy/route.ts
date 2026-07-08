import { NextRequest } from "next/server";
import { requirePromptHubAuth } from "@/lib/server/prompt-hub-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QIANFAN_PROXY_TIMEOUT_MS = 180000;

function isAllowedQianfanUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "qianfan.baidubce.com";
    } catch {
        return false;
    }
}

export async function POST(request: NextRequest) {
    const authError = await requirePromptHubAuth(request);
    if (authError) return authError;

    const target = request.headers.get("x-qianfan-target") || "";
    if (!target || !isAllowedQianfanUrl(target)) {
        return new Response("Invalid x-qianfan-target", { status: 400 });
    }

    const headers = new Headers({ Accept: "text/event-stream" });
    const authorization = request.headers.get("x-qianfan-authorization");
    const contentType = request.headers.get("content-type");
    if (authorization) headers.set("Authorization", authorization);
    if (contentType) headers.set("Content-Type", contentType);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QIANFAN_PROXY_TIMEOUT_MS);
    try {
        const body = await request.arrayBuffer();
        const response = await fetch(target, {
            method: "POST",
            headers,
            body: body.byteLength ? body : undefined,
            signal: controller.signal,
        });
        const resultHeaders = new Headers();
        const responseContentType = response.headers.get("content-type");
        if (responseContentType) resultHeaders.set("content-type", responseContentType);
        return new Response(response.body, { status: response.status, headers: resultHeaders });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return new Response("Qianfan proxy timeout", { status: 504 });
        }
        return new Response(error instanceof Error ? error.message : "Qianfan proxy error", { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}
