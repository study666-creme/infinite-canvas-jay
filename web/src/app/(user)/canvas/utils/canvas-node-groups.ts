import type { CanvasNodeData } from "../types";

export const GROUP_FRAME_PADDING = 20;
export const GROUP_FRAME_HEADER = 30;

export type NodeGroupBounds = {
    rootId: string;
    memberIds: string[];
    x: number;
    y: number;
    width: number;
    height: number;
};

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
    return next;
}

export function createGroupPatch(nodes: CanvasNodeData[], ids: string[]) {
    const rootId = ids[0];
    const memberIds = ids.slice(1);
    const idSet = new Set(ids);
    return nodes.map((node) => {
        if (node.id === rootId) {
            return {
                ...node,
                metadata: {
                    ...stripGroupMetadata(node.metadata),
                    isGroupRoot: true,
                    groupMemberIds: memberIds,
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
        x: minX - GROUP_FRAME_PADDING,
        y: minY - GROUP_FRAME_PADDING - GROUP_FRAME_HEADER,
        width: maxX - minX + GROUP_FRAME_PADDING * 2,
        height: maxY - minY + GROUP_FRAME_PADDING * 2 + GROUP_FRAME_HEADER,
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
