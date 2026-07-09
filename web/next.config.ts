import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseChangelog } from "@/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webDir, "..");

function readTextFile(candidates: string[], fallback: string): string {
    for (const filePath of candidates) {
        try {
            const text = readFileSync(filePath, "utf8").trim();
            if (text) return text;
        } catch {
            /* try next */
        }
    }
    return fallback;
}

const localVersion = readTextFile(
    [resolve(webDir, "VERSION"), resolve(repoRoot, "VERSION")],
    "dev"
);
const localChangelog = readTextFile(
    [resolve(webDir, "CHANGELOG.md"), resolve(repoRoot, "CHANGELOG.md")],
    "# Changelog\n"
);

export default function nextConfig(phase: string): NextConfig {
    const isDev = phase === PHASE_DEVELOPMENT_SERVER;
    const releases = parseChangelog(localChangelog);
    const onVercel = !!process.env.VERCEL;

    return {
        // Vercel 自带 Next 部署；standalone 仅用于 Docker 自托管
        ...(onVercel
            ? {}
            : {
                  output: "standalone" as const,
                  outputFileTracingRoot: repoRoot,
              }),
        allowedDevOrigins: isDev ? ["*.*.*.*"] : [],
        typescript: {
            ignoreBuildErrors: true,
        },
        env: {
            NEXT_PUBLIC_APP_VERSION: localVersion,
            NEXT_PUBLIC_APP_RELEASES: JSON.stringify(releases),
        },
        async headers() {
            const mobileAgentCacheHeaders = [
                { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0" },
                { key: "Pragma", value: "no-cache" },
                { key: "Expires", value: "0" },
            ];
            return [
                { source: "/mobile-agent", headers: mobileAgentCacheHeaders },
                { source: "/mobile-agent/:path*", headers: mobileAgentCacheHeaders },
            ];
        },
    };
}
