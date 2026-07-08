"use client";

import type { CSSProperties } from "react";
import { Keyboard, LogOut, Settings2, UserCircle2 } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { canvasThemes } from "@/lib/canvas-theme";
import { promptHubUserIdentity } from "@/lib/prompt-hub-auth";
import { useConfigStore } from "@/stores/use-config-store";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";
import { useThemeStore } from "@/stores/use-theme-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const session = usePromptHubStore((state) => state.session);
    const logout = usePromptHubStore((state) => state.logout);
    const canvasTheme = canvasThemes[theme];
    const identity = promptHubUserIdentity(session);
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {identity ? (
                <span className="mr-1 hidden max-w-[180px] items-center gap-1.5 truncate rounded-full border border-black/10 px-2.5 py-1 text-xs text-stone-500 sm:inline-flex dark:border-white/10 dark:text-stone-400" title={identity.email || identity.id}>
                    <UserCircle2 className="size-3.5 shrink-0" />
                    <span className="truncate">{identity.email || identity.displayName}</span>
                </span>
            ) : null}
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="操作说明" title="操作说明">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {identity ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={logout} aria-label="退出登录" title="退出登录">
                    <LogOut className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
