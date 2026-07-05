"use client";

import { Button, Tooltip } from "antd";
import { Clapperboard } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function ShortDramaAgentPresetButton({ active, disabled, onToggle }: { active?: boolean; disabled?: boolean; onToggle: (active: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const tooltip = active ? "退出 AI 短剧创作总监" : "切换到 AI 短剧创作总监";

    return (
        <Tooltip title={tooltip}>
            <Button
                type="text"
                className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !p-0"
                disabled={disabled}
                style={{ color: active ? theme.node.text : theme.node.muted, background: active ? theme.node.fill : "transparent" }}
                icon={<Clapperboard className="size-3.5" />}
                onClick={() => onToggle(!active)}
                aria-pressed={Boolean(active)}
                aria-label="AI 短剧创作总监模式"
            />
        </Tooltip>
    );
}
