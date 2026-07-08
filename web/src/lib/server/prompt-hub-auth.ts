import type { NextRequest } from "next/server";

const PROMPT_HUB_API_BASE = (process.env.PROMPT_HUB_API_BASE || "https://api.prompt-hubs.com").replace(/\/+$/, "");
const TOKEN_CACHE_TTL_MS = 60_000;

const tokenCache = new Map<string, { ok: boolean; expiresAt: number }>();

export async function requirePromptHubAuth(request: NextRequest) {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() || "";
    if (!token) return new Response("Missing Prompt Hub auth", { status: 401 });

    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.ok ? null : new Response("Invalid Prompt Hub auth", { status: 401 });

    const ok = await verifyPromptHubToken(token);
    tokenCache.set(token, { ok, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    return ok ? null : new Response("Invalid Prompt Hub auth", { status: 401 });
}

async function verifyPromptHubToken(token: string) {
    try {
        const response = await fetch(`${PROMPT_HUB_API_BASE}/api/v1/extension/status`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean };
        return response.ok && payload.ok !== false;
    } catch {
        return false;
    }
}
