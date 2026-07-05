import type { CanvasNodeData } from "../types";

export const GROUP_FRAME_PADDING = 20;
export const GROUP_FRAME_HEADER = 36;
export const DEFAULT_GROUP_COLOR = "#cbd5e1";

export const GROUP_COLOR_PALETTE = [DEFAULT_GROUP_COLOR, "#94a3b8", "#e7e5e4", "#3b82f6", "#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#14b8a6", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7"] as const;

export type NodeGroupBounds = {
    rootId: string;
    memberIds: string[];
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
};

export function nextGroupName(nodes: CanvasNodeData[]) {
    const used = new Set(
        nodes
            .filter((node) => node.metadata?.isGroupRoot && node.metadata.groupName)
            .map((node) => node.metadata!.groupName!.trim())
            .filter(Boolean),
    );
    for (let index = 1; index < 1000; index += 1) {
        const name = `组 ${index}`;
        if (!used.has(name)) return name;
    }
    return `组 ${Date.now()}`;
}

export function withGroupName(nodes: CanvasNodeData[], rootId: string, name: string) {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return nodes;
    return nodes.map((node) => (node.id === rootId && node.metadata?.isGroupRoot ? { ...node, metadata: { ...node.metadata, groupName: trimmed } } : node));
}

export function pickGroupColor(rootId: string, usedColors: Iterable<string> = []) {
    const used = new Set(usedColors);
    if (!used.has(DEFAULT_GROUP_COLOR)) return DEFAULT_GROUP_COLOR;
    const hash = rootId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    for (let offset = 0; offset < GROUP_COLOR_PALETTE.length; offset += 1) {
        const color = GROUP_COLOR_PALETTE[(hash + offset) % GROUP_COLOR_PALETTE.length];
        if (!used.has(color)) return color;
    }
    return GROUP_COLOR_PALETTE[hash % GROUP_COLOR_PALETTE.length];
}

export function collectGroupDragNodeIds(rootId: string, nodes: CanvasNodeData[]) {
    const root = nodes.find((node) => node.id === rootId);
    if (!root?.metadata?.isGroupRoot) return new Set<string>();
    const memberSet = new Set(getGroupNodeIds(root));
    const dragIds = new Set(memberSet);
    nodes.forEach((node) => {
        if (memberSet.has(node.id)) {
            node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
            return;
        }
        if (node.metadata?.batchRootId && memberSet.has(node.metadata.batchRootId)) {
            dragIds.add(node.id);
        }
    });
    return dragIds;
}

export function arrangeGroupLayoutPatch(nodes: CanvasNodeData[], rootId: string) {
    const root = nodes.find((node) => node.id === rootId);
    if (!root?.metadata?.isGroupRoot) return nodes;
    const memberIds = getGroupNodeIds(root);
    const members = memberIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasNodeData => Boolean(node));
    if (members.length < 2) return nodes;

    const gap = 24;
    const sorted = [...members].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    const anchorX = Math.min(...sorted.map((node) => node.position.x));
    const anchorY = Math.min(...sorted.map((node) => node.position.y));
    const maxNodeWidth = Math.max(...sorted.map((node) => node.width));
    const maxNodeHeight = Math.max(...sorted.map((node) => node.height));
    const columns = Math.ceil(Math.sqrt(sorted.length));

    const nextPositions = new Map<string, { x: number; y: number }>();
    sorted.forEach((node, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        nextPositions.set(node.id, {
            x: anchorX + col * (maxNodeWidth + gap),
            y: anchorY + row * (maxNodeHeight + gap),
        });
    });

    return nodes.map((node) => {
        const next = nextPositions.get(node.id);
        return next ? { ...node, position: next } : node;
    });
}

export function withGroupColor(nodes: CanvasNodeData[], rootId: string, color: string) {
    return nodes.map((node) => (node.id === rootId && node.metadata?.isGroupRoot ? { ...node, metadata: { ...node.metadata, groupColor: color } } : node));
}

export function getGroupRootId(node: CanvasNodeData): string | null {
    if (node.metadata?.isGroupRoot) return node.id;
    return node.metadata?.groupRootId || null;
}

export function getGroupNodeIds(root: CanvasNodeData): string[] {
    if (!root.metadata?.isGroupRoot) return [root.id];
    return [root.id, ...(root.metadata.groupMemberIds || [])];
}

export function expandSelectionWithGroups(nodeIds: Iterable<string>, nodes: CanvasNodeData[]) {
    const next = new Set(nodeIds);
    for (const id of nodeIds) {
        const node = nodes.find((item) => item.id === id);
        if (!node) continue;
        const rootId = getGroupRootId(node);
        if (!rootId) continue;
        const root = nodes.find((item) => item.id === rootId);
        if (root) getGroupNodeIds(root).forEach((memberId) => next.add(memberId));
    }
    return next;
}

export function collectDragNodeIds(selectedIds: Set<string>, nodes: CanvasNodeData[], expandGroups = true) {
    const dragIds = new Set(selectedIds);
    if (!expandGroups) return dragIds;
    nodes.forEach((node) => {
        if (!selectedIds.has(node.id)) return;
        node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
        const rootId = getGroupRootId(node);
        if (!rootId) return;
        const root = nodes.find((item) => item.id === rootId);
        if (root) getGroupNodeIds(root).forEach((memberId) => dragIds.add(memberId));
    });
    return dragIds;
}

export function canGroupNodes(nodes: CanvasNodeData[]) {
    return nodes.length >= 2 && nodes.every((node) => !node.metadata?.isGroupRoot && !node.metadata?.groupRootId && !node.metadata?.isBatchRoot && !node.metadata?.batchRootId);
}

export function stripGroupMetadata(metadata: CanvasNodeData["metadata"]) {
    if (!metadata) return metadata;
    const next = { ...metadata };
    delete next.isGroupRoot;
    delete next.groupRootId;
    delete next.groupMemberIds;
    delete next.groupColor;
    delete next.groupName;
    return next;
}

export function createGroupPatch(nodes: CanvasNodeData[], ids: string[]) {
    const rootId = ids[0];
    const memberIds = ids.slice(1);
    const idSet = new Set(ids);
    const groupName = nextGroupName(nodes);
    return nodes.map((node) => {
        if (node.id === rootId) {
            return {
                ...node,
                metadata: {
                    ...stripGroupMetadata(node.metadata),
                    isGroupRoot: true,
                    groupMemberIds: memberIds,
                    groupColor: DEFAULT_GROUP_COLOR,
                    groupName,
                },
            };
        }
        if (idSet.has(node.id) && node.id !== rootId) {
            return {
                ...node,
                metadata: {
                    ...stripGroupMetadata(node.metadata),
                    groupRootId: rootId,
                },
            };
        }
        return node;
    });
}

export function ungroupPatch(nodes: CanvasNodeData[], rootId: string) {
    return nodes.map((node) => {
        if (node.id === rootId || node.metadata?.groupRootId === rootId) {
            return { ...node, metadata: stripGroupMetadata(node.metadata) };
        }
        return node;
    });
}

export function getNodeGroupBounds(nodes: CanvasNodeData[], root: CanvasNodeData): NodeGroupBounds | null {
    const memberIds = getGroupNodeIds(root);
    const members = memberIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasNodeData => Boolean(node));
    if (members.length < 2) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of members) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.width);
        maxY = Math.max(maxY, node.position.y + node.height);
    }

    return {
        rootId: root.id,
        memberIds,
        name: root.metadata?.groupName?.trim() || "组",
        x: minX - GROUP_FRAME_PADDING,
        y: minY - GROUP_FRAME_PADDING - GROUP_FRAME_HEADER,
        width: maxX - minX + GROUP_FRAME_PADDING * 2,
        height: maxY - minY + GROUP_FRAME_PADDING * 2 + GROUP_FRAME_HEADER,
        color: root.metadata?.groupColor || DEFAULT_GROUP_COLOR,
    };
}

export function listNodeGroups(nodes: CanvasNodeData[]) {
    return nodes
        .filter((node) => node.metadata?.isGroupRoot && (node.metadata.groupMemberIds?.length || 0) > 0)
        .map((root) => getNodeGroupBounds(nodes, root))
        .filter((bounds): bounds is NodeGroupBounds => Boolean(bounds));
}

export function isGroupSelected(bounds: NodeGroupBounds, selectedNodeIds: Set<string>) {
    return bounds.memberIds.every((id) => selectedNodeIds.has(id));
}
