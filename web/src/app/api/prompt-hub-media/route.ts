import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    const target = request.nextUrl.searchParams.get("url") || "";
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return new Response("Invalid media URL", { status: 400 });
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return new Response("Unsupported media URL", { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await fetch(url, {
            headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
            signal: controller.signal,
        });
        if (!response.ok) {
            return new Response(`Prompt Hub media fetch failed (${response.status})`, { status: response.status });
        }
        const headers = new Headers();
        headers.set("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
        headers.set("Cache-Control", "no-store");
        const contentLength = response.headers.get("Content-Length");
        if (contentLength) headers.set("Content-Length", contentLength);
        return new Response(response.body, { status: 200, headers });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return new Response("Prompt Hub media fetch timeout", { status: 504 });
        }
        return new Response(error instanceof Error ? error.message : "Prompt Hub media fetch failed", { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}
