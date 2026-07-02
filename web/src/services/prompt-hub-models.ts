/** 画布节点 model 字段：ph-hub:<卡藏模型 id> 表示走 Prompt Hub 生图 + 扣积分 */
export const PH_HUB_MODEL_PREFIX = "ph-hub:";

export function toPromptHubModelValue(modelId: string) {
    return `${PH_HUB_MODEL_PREFIX}${modelId}`;
}

export function isPromptHubModelValue(value?: string | null) {
    return typeof value === "string" && value.startsWith(PH_HUB_MODEL_PREFIX);
}

export function parsePromptHubModelId(value?: string | null) {
    if (!isPromptHubModelValue(value)) return null;
    return value!.slice(PH_HUB_MODEL_PREFIX.length) || null;
}

export function promptHubModelPickerLabel(modelId: string, label?: string) {
    const name = (label || modelId).trim();
    return `卡藏 · ${name}`;
}
