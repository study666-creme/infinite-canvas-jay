import type { ViewportTransform } from "../types";

export function viewportToWorldPoint(viewport: ViewportTransform, localX: number, localY: number) {
    return {
        x: (localX - viewport.x) / viewport.k,
        y: (localY - viewport.y) / viewport.k,
    };
}

export function screenPointToCanvasWorld(
    container: HTMLElement | null | undefined,
    worldLayer: HTMLElement | null | undefined,
    clientX: number,
    clientY: number,
    viewport: ViewportTransform,
) {
    const rect = container?.getBoundingClientRect();
    const localX = clientX - (rect?.left ?? 0);
    const localY = clientY - (rect?.top ?? 0);

    if (worldLayer) {
        const transform = getComputedStyle(worldLayer).transform;
        if (transform && transform !== "none") {
            const point = new DOMPoint(localX, localY).matrixTransform(new DOMMatrix(transform).inverse());
            return { x: point.x, y: point.y };
        }
    }

    return viewportToWorldPoint(viewport, localX, localY);
}
