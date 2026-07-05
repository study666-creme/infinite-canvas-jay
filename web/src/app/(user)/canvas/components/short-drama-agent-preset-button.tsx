"use client";

import { Button, Tooltip } from "antd";
import { Clapperboard } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function ShortDramaAgentPresetButton({ active, presetInserted, disabled, onToggle }: { active?: boolean; presetInserted?: boolean; disabled?: boolean; onToggle: (active: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const tooltip = active ? "退出 AI 短剧创作总监" : presetInserted ? "清空 AI 短剧创作总监预设" : "插入 AI 短剧创作总监提示词";

    return (
        <Tooltip title={tooltip}>
            <Button
                type="text"
                className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0"
                disabled={disabled}
                style={{ color: active || presetInserted ? theme.node.text : theme.node.muted, background: active ? theme.node.fill : "transparent" }}
                icon={<Clapperboard className="size-3.5" />}
                onClick={() => onToggle(!(active || presetInserted))}
                aria-label="AI 短剧创作总监提示词"
            />
        </Tooltip>
    );
}
