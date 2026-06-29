import type { CanvasNodeData, ViewportTransform } from "../types";

export type CanvasViewBounds = {
    viewLeft: number;
    viewTop: number;
    viewRight: number;
    viewBottom: number;
};

export function getCanvasViewBounds(viewport: ViewportTransform, width: number, height: number, padding = 280): CanvasViewBounds {
    const viewLeft = -viewport.x / viewport.k - padding;
    const viewTop = -viewport.y / viewport.k - padding;
    const viewRight = viewLeft + width / viewport.k + padding * 2;
    const viewBottom = viewTop + height / viewport.k + padding * 2;
    return { viewLeft, viewTop, viewRight, viewBottom };
}

export function isNodeInView(node: CanvasNodeData, bounds: CanvasViewBounds) {
    return node.position.x + node.width > bounds.viewLeft && node.position.x < bounds.viewRight && node.position.y + node.height > bounds.viewTop && node.position.y < bounds.viewBottom;
}

export function isConnectionInView(from: CanvasNodeData, to: CanvasNodeData, bounds: CanvasViewBounds) {
    const minX = Math.min(from.position.x, to.position.x);
    const maxX = Math.max(from.position.x + from.width, to.position.x + to.width);
    const minY = Math.min(from.position.y, to.position.y);
    const maxY = Math.max(from.position.y + from.height, to.position.y + to.height);
    return maxX > bounds.viewLeft && minX < bounds.viewRight && maxY > bounds.viewTop && minY < bounds.viewBottom;
}
