"use client";

import type { ReactNode } from "react";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { PromptHubAuthGate } from "@/components/layout/prompt-hub-auth-gate";

export default function UserLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className="min-h-0 flex-1 overflow-hidden">
                <PromptHubAuthGate>{children}</PromptHubAuthGate>
            </div>
        </div>
    );
}
