"use client";

import { useEffect, useState } from "react";
import { Modal, Tabs } from "antd";

import { MyAssetsPanel, type InsertAssetPayload } from "./asset-library-panel";
import { PromptHubCardsTab } from "./prompt-hub-cards-tab";

export type { InsertAssetPayload } from "./asset-library-panel";

type Props = {
    open: boolean;
    defaultTab?: "local" | "prompt-hub" | "my-assets";
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

export function AssetPickerModal({ open, defaultTab = "local", onInsert, onClose }: Props) {
    const initialTab = defaultTab === "prompt-hub" ? "prompt-hub" : "local";
    const [tab, setTab] = useState(initialTab);

    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    return (
        <Modal title="选择资产" open={open} onCancel={onClose} footer={null} width={900} centered destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}>
            <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                    { key: "local", label: "我的资产", children: <MyAssetsPanel onInsert={onInsert} /> },
                    { key: "prompt-hub", label: "Prompt Hub 卡片库", children: <PromptHubCardsTab /> },
                ]}
            />
        </Modal>
    );
}
