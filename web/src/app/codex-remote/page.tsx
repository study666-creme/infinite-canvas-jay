import type { Metadata } from "next";

import { PromptHubAuthGate } from "@/components/layout/prompt-hub-auth-gate";
import { CodexRemoteConsole } from "@/components/codex-remote/codex-remote-console";

export const metadata: Metadata = {
    title: "Codex Remote",
    description: "Self-hosted mobile console for controlling a local Codex session through a protected bridge.",
};

export default function CodexRemotePage() {
    const demoMode = process.env.NEXT_PUBLIC_CODEX_REMOTE_DEMO_MODE === "1";
    const console = <CodexRemoteConsole />;

    return (
        <div className="h-dvh overflow-hidden bg-[#f5f3ee] text-stone-950 dark:bg-[#070707] dark:text-stone-100">
            {demoMode ? <PromptHubAuthGate>{console}</PromptHubAuthGate> : console}
        </div>
    );
}
