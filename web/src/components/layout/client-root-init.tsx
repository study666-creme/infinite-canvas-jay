"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { App } from "antd";

import { createModelChannel, defaultConfig, useConfigStore, type ModelChannel } from "@/stores/use-config-store";

const obsoleteJimengChannelCleanupKey = "infinite-canvas:obsolete_jimeng_channel_cleanup_v1";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [configHydrated, setConfigHydrated] = useState(false);

    useEffect(() => {
        const persist = useConfigStore.persist;
        if (!persist) {
            setConfigHydrated(true);
            return;
        }
        setConfigHydrated(persist.hasHydrated());
        return persist.onFinishHydration(() => setConfigHydrated(true));
    }, []);

    useEffect(() => {
        if (!configHydrated) return;
        if (localStorage.getItem(obsoleteJimengChannelCleanupKey)) return;

        const obsoleteChannels = config.channels.filter(isObsoleteJimengSampleChannel);
        if (!obsoleteChannels.length) {
            localStorage.setItem(obsoleteJimengChannelCleanupKey, "1");
            return;
        }

        const channels = config.channels.filter((channel) => !isObsoleteJimengSampleChannel(channel));
        updateConfig("channels", channels);

        const activeChannelWasRemoved = obsoleteChannels.some((channel) => normalizeChannelBaseUrl(channel.baseUrl) === normalizeChannelBaseUrl(config.baseUrl));
        if (activeChannelWasRemoved) {
            const replacement = channels[0];
            updateConfig("baseUrl", replacement?.baseUrl || defaultConfig.baseUrl);
            updateConfig("apiKey", replacement?.apiKey || "");
            updateConfig("apiFormat", replacement?.apiFormat || defaultConfig.apiFormat);
            updateConfig("models", replacement?.models || []);
        }

        localStorage.setItem(obsoleteJimengChannelCleanupKey, "1");
        message.success("已移除旧的本地示例渠道");
    }, [config, configHydrated, message, updateConfig]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        const shouldLetCanvasEntryConsumeParams = window.location.pathname === "/canvas";
        if (!shouldLetCanvasEntryConsumeParams) {
            searchParams.delete("baseUrl");
            searchParams.delete("baseurl");
            searchParams.delete("apiKey");
            searchParams.delete("apikey");
            window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        }
        const firstChannel = config.channels[0];
        updateConfig(
            "channels",
            firstChannel
                ? config.channels.map((channel, index) =>
                      index === 0
                          ? {
                                ...channel,
                                ...(baseUrl ? { baseUrl } : {}),
                                ...(apiKey ? { apiKey } : {}),
                            }
                          : channel,
                  )
                : [createModelChannel({ id: "channel-1", name: "渠道 1", baseUrl: baseUrl || undefined, apiKey: apiKey || "" })],
        );
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
        message.success("已导入本地直连配置");
    }, [config.channels, message, openConfigDialog, updateConfig]);

    return <>{children}</>;
}

function isObsoleteJimengSampleChannel(channel: ModelChannel) {
    const baseUrl = normalizeChannelBaseUrl(channel.baseUrl);
    return channel.name.trim() === "即梦" && (baseUrl === "http://127.0.0.1:8000/v1" || baseUrl === "http://localhost:8000/v1");
}

function normalizeChannelBaseUrl(value: string) {
    return value.trim().replace(/\/+$/, "").toLowerCase();
}
