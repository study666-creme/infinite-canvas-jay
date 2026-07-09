import type { Metadata } from "next";

import MobileAgentPage from "@/app/(user)/mobile-agent/page";

export const metadata: Metadata = {
    title: "Codex Remote",
    description: "Self-hosted mobile console for controlling a local Codex session through a protected bridge.",
};

export default function CodexRemotePage() {
    return (
        <div className="h-dvh overflow-hidden bg-[#f5f3ee] text-stone-950 dark:bg-[#070707] dark:text-stone-100">
            <MobileAgentPage />
        </div>
    );
}
