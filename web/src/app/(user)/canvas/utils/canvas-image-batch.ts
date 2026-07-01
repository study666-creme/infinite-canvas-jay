import { nanoid } from "nanoid";

import type { UploadedImage } from "@/services/image-storage";
import { NODE_DEFAULT_SIZE } from "../constants";
import { fitNodeSize } from "./canvas-node-size";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../types";

export type GeneratedImageItem = { id: string; dataUrl: string };

export function createBatchChildNode(rootNode: CanvasNodeData, index: number, title: string, metadata: CanvasNodeMetadata, id = nanoid()): CanvasNodeData {
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const rowGap = 36;
    return {
        id,
        type: CanvasNodeType.Image,
        title: title.slice(0, 32) || "Generated Image",
        position: {
            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
            y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
        },
        width: imageConfig.width,
        height: imageConfig.height,
        metadata: { ...metadata, status: "loading", batchRootId: rootNode.id },
    };
}

export function createBatchConnections(rootId: string, childIds: string[]): CanvasConnection[] {
    return childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }));
}

export function buildPromptHubImageNodes(options: {
    anchor: Pick<CanvasNodeData, "position" | "width" | "height">;
    prompt: string;
    count: number;
    generationMetadata: CanvasNodeMetadata;
    ids?: string[];
}): { nodes: CanvasNodeData[]; ids: string[] } {
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const rowGap = 36;
    const gap = 96;
    const ids = options.ids?.length === options.count ? options.ids : Array.from({ length: options.count }, () => nanoid());
    const nodes = ids.map((id, index) => ({
        id,
        type: CanvasNodeType.Image,
        title: options.prompt.slice(0, 32) || "Generated Image",
        position: {
            x: options.anchor.position.x + options.anchor.width + gap + (index % 2) * (imageConfig.width + 36),
            y: options.anchor.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
        },
        width: imageConfig.width,
        height: imageConfig.height,
        metadata: {
            prompt: options.prompt,
            status: "loading" as const,
            ...options.generationMetadata,
            ...loadingProgressMetadata(8, `准备保存 ${index + 1}/${options.count}`),
        },
    }));
    return { nodes, ids };
}

export function buildPromptHubConnections(sourceNodeId: string, imageNodeIds: string[]): CanvasConnection[] {
    return imageNodeIds.map((childId) => ({ id: nanoid(), fromNodeId: sourceNodeId, toNodeId: childId }));
}

export function buildPromptTextNodePatch(sourceNode: CanvasNodeData, prompt: string, textSize: Pick<CanvasNodeData, "width" | "height">): CanvasNodeData {
    return {
        ...sourceNode,
        type: CanvasNodeType.Text,
        title: prompt.slice(0, 32) || "Prompt",
        width: textSize.width,
        height: textSize.height,
        metadata: {
            ...sourceNode.metadata,
            content: prompt,
            prompt,
            status: "success",
            fontSize: sourceNode.metadata?.fontSize || 14,
            generationProgress: undefined,
            generationStage: undefined,
            errorDetails: undefined,
            isBatchRoot: undefined,
            batchChildIds: undefined,
            batchRootId: undefined,
            imageBatchExpanded: undefined,
            primaryImageId: undefined,
            batchUsesReferenceImages: undefined,
        },
    };
}

export function buildPromptHubSiblingImageNodes(options: {
    anchor: CanvasNodeData;
    prompt: string;
    count: number;
    generationMetadata: CanvasNodeMetadata;
    ids?: string[];
}): { nodes: CanvasNodeData[]; ids: string[] } {
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const ids = options.ids?.length === options.count ? options.ids : Array.from({ length: options.count }, () => nanoid());
    const nodes = ids.map((id, index) => {
        const size = fitNodeSize(imageConfig.width, imageConfig.height, imageConfig.width, imageConfig.height);
        return {
            id,
            type: CanvasNodeType.Image,
            title: options.prompt.slice(0, 32) || "Generated Image",
            position: { x: options.anchor.position.x + (index + 1) * (size.width + 36), y: options.anchor.position.y },
            width: size.width,
            height: size.height,
            metadata: {
                prompt: options.prompt,
                status: "loading" as const,
                ...options.generationMetadata,
                ...loadingProgressMetadata(8, `准备保存 ${index + 1}/${options.count}`),
            },
        };
    });
    return { nodes, ids };
}

export function resolvePromptHubAnchor(sourceNode: CanvasNodeData, position: Position, textSize: Pick<CanvasNodeData, "width" | "height">) {
    return {
        position,
        width: sourceNode.type === CanvasNodeType.Image && !sourceNode.metadata?.content ? sourceNode.width : textSize.width,
        height: sourceNode.type === CanvasNodeType.Image && !sourceNode.metadata?.content ? sourceNode.height : textSize.height,
    };
}

export function applyUploadedImageToNode(node: CanvasNodeData, uploaded: UploadedImage): CanvasNodeData {
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
    const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
    return {
        ...node,
        position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
        width: imageSize.width,
        height: imageSize.height,
        metadata: {
            ...node.metadata,
            content: uploaded.url,
            storageKey: uploaded.storageKey,
            status: "success",
            naturalWidth: uploaded.width,
            naturalHeight: uploaded.height,
            bytes: uploaded.bytes,
            mimeType: uploaded.mimeType,
            generationProgress: undefined,
            generationStage: undefined,
            errorDetails: undefined,
        },
    };
}

export function loadingProgressMetadata(progress: number, stage: string): Pick<CanvasNodeMetadata, "generationProgress" | "generationStage"> {
    return { generationProgress: progress, generationStage: stage };
}

/** 请求进行中缓慢推进进度条，避免长时间停在 0% */
export function startGenerationProgressTicker(onTick: (progress: number, stage: string) => void, options?: { start?: number; max?: number; stage?: string; intervalMs?: number }) {
    let current = options?.start ?? 12;
    const max = options?.max ?? 86;
    const stage = options?.stage ?? "生成中";
    const timer = window.setInterval(() => {
        current = Math.min(max, current + 2 + Math.random() * 3);
        onTick(Math.round(current), stage);
    }, options?.intervalMs ?? 900);
    return () => window.clearInterval(timer);
}
