import type { CanvasResourceReference } from "./canvas-resource-references";

export type CanvasVideoReferenceAsset = {
    kind: "image" | "video" | "audio";
    label: string;
    previewUrl?: string;
    nodeId: string;
    title: string;
};

type VideoReferenceKind = CanvasVideoReferenceAsset["kind"];

const REFERENCE_LABEL_PATTERN = /(?:^|[^\d])(图片\d+|视频\d+|音频\d+|文本\d+)(?=[^\d]|$)/g;

export function extractMentionedReferenceLabels(prompt: string) {
    const labels = new Set<string>();
    for (const match of prompt.matchAll(new RegExp(REFERENCE_LABEL_PATTERN.source, "g"))) {
        if (match[1]) labels.add(match[1]);
    }
    return labels;
}

export function resolveActiveVideoReferences(prompt: string, references: CanvasResourceReference[]) {
    const activeReferences = references.filter((reference) => reference.active);
    const mentionedLabels = extractMentionedReferenceLabels(prompt);
    if (!mentionedLabels.size) return activeReferences;
    return activeReferences.filter((reference) => mentionedLabels.has(reference.label));
}

export function removeReferenceLabelFromPrompt(prompt: string, label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return prompt
        .replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"), " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function toVideoReferenceAssets(references: CanvasResourceReference[]): CanvasVideoReferenceAsset[] {
    return references
        .filter((reference): reference is CanvasResourceReference & { kind: VideoReferenceKind } => reference.kind === "image" || reference.kind === "video" || reference.kind === "audio")
        .map((reference) => ({
            kind: reference.kind,
            label: reference.label,
            previewUrl: reference.previewUrl,
            nodeId: reference.nodeId,
            title: reference.title,
        }));
}
