"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";

const VIEWPORT_PARENT_SYNC_INTERVAL_MS = 240;
const VIEWPORT_IDLE_COMMIT_MS = 120;
const CANVAS_OVERLAY_SELECTOR = ".ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown,.canvas-prompt-library-modal,.canvas-asset-drawer,.canvas-assistant-panel,[data-canvas-scroll]";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    worldLayerRef?: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onNodeWheelResize?: (nodeId: string, deltaY: number) => boolean;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

type TouchCanvasPointer = {
    clientX: number;
    clientY: number;
};

type TouchPinchState = {
    startDistance: number;
    startScale: number;
    worldCenterX: number;
    worldCenterY: number;
};

export function InfiniteCanvas({ containerRef, worldLayerRef, viewport, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onNodeWheelResize, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        pointerId: null as number | null,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const idleCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastParentSyncAtRef = useRef(0);
    const lastEmittedViewportRef = useRef<ViewportTransform | null>(null);
    const internalViewportActiveRef = useRef(false);
    const touchPointersRef = useRef(new Map<number, TouchCanvasPointer>());
    const touchPinchRef = useRef<TouchPinchState | null>(null);
    const [renderedViewport, setRenderedViewport] = useState(viewport);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    useEffect(() => {
        window.dispatchEvent(
            new CustomEvent("canvas-space-pan-state", {
                detail: { active: isSpacePressed, panning: isPanning },
            }),
        );
    }, [isPanning, isSpacePressed]);

    useEffect(
        () => () => {
            window.dispatchEvent(new CustomEvent("canvas-space-pan-state", { detail: { active: false, panning: false } }));
        },
        [],
    );

    useEffect(() => {
        const isInternalAcknowledgement = viewportMatches(viewport, lastEmittedViewportRef.current);
        if (internalViewportActiveRef.current && isInternalAcknowledgement) return;
        internalViewportActiveRef.current = false;
        nextViewportRef.current = null;
        if (idleCommitTimerRef.current) {
            clearTimeout(idleCommitTimerRef.current);
            idleCommitTimerRef.current = null;
        }
        scaleRef.current = viewport.k;
        viewportRef.current = viewport;
        setRenderedViewport((current) => (viewportMatches(current, viewport) ? current : viewport));
    }, [viewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (idleCommitTimerRef.current) clearTimeout(idleCommitTimerRef.current);
            touchPointersRef.current.clear();
            touchPinchRef.current = null;
        },
        [],
    );

    const emitViewportChange = useCallback(
        (next: ViewportTransform, final: boolean) => {
            lastEmittedViewportRef.current = next;
            lastParentSyncAtRef.current = performance.now();
            if (final) internalViewportActiveRef.current = false;
            onViewportChange(next);
        },
        [onViewportChange],
    );

    const flushViewportChange = useCallback(() => {
        if (!internalViewportActiveRef.current && !nextViewportRef.current) return;
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        if (idleCommitTimerRef.current) {
            clearTimeout(idleCommitTimerRef.current);
            idleCommitTimerRef.current = null;
        }
        const next = nextViewportRef.current || viewportRef.current;
        nextViewportRef.current = null;
        setRenderedViewport((current) => (viewportMatches(current, next) ? current : next));
        emitViewportChange(next, true);
    }, [emitViewportChange]);

    const queueViewportChange = useCallback(
        (next: ViewportTransform) => {
            const startingInteraction = !internalViewportActiveRef.current;
            internalViewportActiveRef.current = true;
            if (startingInteraction) lastParentSyncAtRef.current = performance.now();
            nextViewportRef.current = next;
            viewportRef.current = next;
            scaleRef.current = next.k;
            if (idleCommitTimerRef.current) clearTimeout(idleCommitTimerRef.current);
            idleCommitTimerRef.current = setTimeout(flushViewportChange, VIEWPORT_IDLE_COMMIT_MS);
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                const pending = nextViewportRef.current;
                nextViewportRef.current = null;
                if (!pending) return;
                setRenderedViewport((current) => (viewportMatches(current, pending) ? current : pending));
                if (performance.now() - lastParentSyncAtRef.current >= VIEWPORT_PARENT_SYNC_INTERVAL_MS) emitViewportChange(pending, false);
            });
        },
        [emitViewportChange, flushViewportChange],
    );

    const startTouchPinch = useCallback(() => {
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        const [first, second] = Array.from(touchPointersRef.current.values());
        if (!rect || !first || !second) return;

        const currentViewport = nextViewportRef.current || viewportRef.current;
        const centerX = (first.clientX + second.clientX) / 2 - rect.left;
        const centerY = (first.clientY + second.clientY) / 2 - rect.top;
        const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
        touchPinchRef.current = {
            startDistance: Math.max(distance, 1),
            startScale: currentViewport.k,
            worldCenterX: (centerX - currentViewport.x) / currentViewport.k,
            worldCenterY: (centerY - currentViewport.y) / currentViewport.k,
        };
        panState.current.hasMoved = true;
        setIsPanning(true);
    }, [containerRef]);

    const applyTouchPinch = useCallback(() => {
        const pinch = touchPinchRef.current;
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        const [first, second] = Array.from(touchPointersRef.current.values());
        if (!pinch || !rect || !first || !second) return false;

        const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
        const newScale = Math.min(Math.max(pinch.startScale * (distance / pinch.startDistance), 0.05), 5);
        const centerX = (first.clientX + second.clientX) / 2 - rect.left;
        const centerY = (first.clientY + second.clientY) / 2 - rect.top;

        queueViewportChange({
            x: centerX - pinch.worldCenterX * newScale,
            y: centerY - pinch.worldCenterY * newScale,
            k: newScale,
        });
        return true;
    }, [containerRef, queueViewportChange]);

    const stopPanning = useCallback(
        (options?: { deselectIfClick?: boolean }) => {
            flushViewportChange();
            if (!panState.current.isPanning) {
                document.body.style.cursor = "";
                setIsPanning(false);
                return;
            }

            if (options?.deselectIfClick && !panState.current.hasMoved) {
                onCanvasDeselect?.();
            }

            const pointerId = panState.current.pointerId;
            const container = containerRef.current;
            if (container && pointerId != null && container.hasPointerCapture?.(pointerId)) {
                container.releasePointerCapture(pointerId);
            }

            panState.current = {
                isPanning: false,
                pointerId: null,
                startX: 0,
                startY: 0,
                initialX: viewportRef.current.x,
                initialY: viewportRef.current.y,
                hasMoved: false,
            };
            document.body.style.cursor = "";
            setIsPanning(false);
        },
        [containerRef, flushViewportChange, onCanvasDeselect],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
            if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
            event.preventDefault();
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            setIsSpacePressed(false);
            stopPanning();
        };

        const releaseSpacePanState = () => {
            touchPointersRef.current.clear();
            touchPinchRef.current = null;
            setIsSpacePressed(false);
            stopPanning();
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("keyup", handleKeyUp, true);
        window.addEventListener("blur", releaseSpacePanState);
        document.addEventListener("visibilitychange", releaseSpacePanState);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("keyup", handleKeyUp, true);
            window.removeEventListener("blur", releaseSpacePanState);
            document.removeEventListener("visibilitychange", releaseSpacePanState);
        };
    }, [stopPanning]);

    const shouldIgnoreCanvasPointer = useCallback((target: Element | null) => {
        if (!target) return true;
        return Boolean(target.closest(`${CANVAS_OVERLAY_SELECTOR},[data-canvas-no-zoom]`));
    }, []);

    const shouldIgnoreCanvasWheelZoom = shouldIgnoreCanvasPointer;

    useEffect(() => {
        const handleTouchPointerDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse" || event.button !== 0) return;
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest(CANVAS_OVERLAY_SELECTOR)) return;
            if (target?.closest("button,input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox'],[data-canvas-interactive],[data-resize-handle]")) return;

            if (event.isPrimary) {
                touchPointersRef.current.clear();
                touchPinchRef.current = null;
                stopPanning();
            }
            touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
            if (touchPointersRef.current.size < 2) return;

            window.dispatchEvent(new CustomEvent("canvas-touch-pinch-start"));
            startTouchPinch();
        };

        window.addEventListener("pointerdown", handleTouchPointerDown, true);
        return () => window.removeEventListener("pointerdown", handleTouchPointerDown, true);
    }, [startTouchPinch, stopPanning]);

    const applyCanvasWheel = useCallback(
        (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return false;
            const isZoomGesture = event.ctrlKey || event.metaKey;
            const nodeId = isZoomGesture ? target.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId : undefined;
            if (nodeId && onNodeWheelResize?.(nodeId, event.deltaY)) {
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
            if (!isZoomGesture && shouldIgnoreCanvasWheelZoom(target)) return false;

            event.preventDefault();
            event.stopPropagation();

            const currentViewport = nextViewportRef.current || viewportRef.current;
            if (isZoomGesture) {
                const delta = -event.deltaY;
                const factor = Math.pow(1.1, delta / 100);
                const newScale = Math.min(Math.max(currentViewport.k * factor, 0.05), 5);
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return true;

                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const worldX = (mouseX - currentViewport.x) / currentViewport.k;
                const worldY = (mouseY - currentViewport.y) / currentViewport.k;

                queueViewportChange({
                    x: mouseX - worldX * newScale,
                    y: mouseY - worldY * newScale,
                    k: newScale,
                });
                return true;
            }

            queueViewportChange({
                x: currentViewport.x - event.deltaX,
                y: currentViewport.y - event.deltaY,
                k: currentViewport.k,
            });
            return true;
        },
        [containerRef, onNodeWheelResize, queueViewportChange, shouldIgnoreCanvasWheelZoom],
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelCapture = (event: WheelEvent) => {
            applyCanvasWheel(event);
        };

        container.addEventListener("wheel", handleWheelCapture, { passive: false, capture: true });
        return () => container.removeEventListener("wheel", handleWheelCapture, { capture: true });
    }, [applyCanvasWheel, containerRef]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        const isSpaceMousePan = event.pointerType === "mouse" && event.button === 0 && isSpacePressed;
        const isCanvasPanGesture = event.button === 1 || isSpaceMousePan;
        if (!isCanvasPanGesture && shouldIgnoreCanvasPointer(target)) return;
        if (!isCanvasPanGesture && target?.closest("[data-connection-create-menu],[data-connection-handle]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id],[data-group-frame]");

        if (event.pointerType !== "mouse" && event.button === 0 && isBackgroundClick) {
            event.preventDefault();

            if (touchPointersRef.current.size >= 2) {
                return;
            }

            touchPinchRef.current = null;
            panState.current.isPanning = false;
            panState.current.pointerId = null;
            return;
        }

        if (event.button === 0 && isBackgroundClick && !isSpacePressed) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
            return;
        }

        if (isCanvasPanGesture) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewportRef.current.x,
                initialY: viewportRef.current.y,
                hasMoved: false,
            };
            document.body.style.cursor = "grabbing";
            setIsPanning(true);
        }
    };

    const finishTouchPointer = useCallback(
        (event: PointerEvent, cancelled = false) => {
            if (event.pointerType === "mouse" || !touchPointersRef.current.has(event.pointerId)) return false;

            const container = containerRef.current;
            if (container?.hasPointerCapture?.(event.pointerId)) {
                container.releasePointerCapture(event.pointerId);
            }

            touchPointersRef.current.delete(event.pointerId);
            if (cancelled) {
                touchPointersRef.current.clear();
                touchPinchRef.current = null;
                stopPanning();
                return true;
            }

            if (touchPointersRef.current.size >= 2) {
                startTouchPinch();
                return true;
            }

            if (touchPointersRef.current.size === 1) {
                touchPinchRef.current = null;
                stopPanning();
                return true;
            }

            touchPinchRef.current = null;
            stopPanning({ deselectIfClick: true });
            return true;
        },
        [containerRef, startTouchPinch, stopPanning],
    );

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType !== "mouse" && touchPointersRef.current.has(event.pointerId)) {
                touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
                if (touchPointersRef.current.size >= 2 && applyTouchPinch()) {
                    return;
                }
            }

            if (!panState.current.isPanning) return;
            if (panState.current.pointerId != null && event.pointerId !== panState.current.pointerId) return;
            if (event.pointerType === "mouse" && event.buttons === 0) {
                stopPanning({ deselectIfClick: true });
                return;
            }

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            queueViewportChange({
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            });
        };

        const handlePointerUp = (event: PointerEvent) => {
            if (finishTouchPointer(event)) return;
            stopPanning({ deselectIfClick: true });
        };
        const handlePointerCancel = (event: PointerEvent) => {
            if (finishTouchPointer(event, true)) return;
            stopPanning();
        };
        const handleMouseUp = () => {
            stopPanning({ deselectIfClick: true });
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [applyTouchPinch, finishTouchPointer, queueViewportChange, stopPanning]);

    return (
        <div
            ref={containerRef}
            data-canvas-surface="true"
            data-space-pan-active={isSpacePressed ? "true" : undefined}
            className={`relative h-full w-full select-none overflow-hidden ${isPanning ? "cursor-grabbing" : isSpacePressed ? "cursor-grab" : "cursor-default"}`}
            style={{ background: theme.canvas.background, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerLeave={(event) => {
                if (event.pointerType !== "mouse") return;
                if (!panState.current.isPanning) return;
                if (document.pointerLockElement) return;
                stopPanning();
            }}
            onLostPointerCapture={(event) => {
                if (event.pointerType !== "mouse") return;
                if (panState.current.isPanning) stopPanning();
            }}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={renderedViewport} mode={backgroundMode} />
            <div
                ref={worldLayerRef}
                className="absolute left-0 top-0 origin-top-left"
                style={{
                    transform: `translate3d(${renderedViewport.x}px, ${renderedViewport.y}px, 0) scale(${renderedViewport.k})`,
                    willChange: "transform",
                }}
            >
                {children}
            </div>
        </div>
    );
}

const CanvasGrid = React.memo(function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
});

function viewportMatches(a: ViewportTransform | null | undefined, b: ViewportTransform | null | undefined) {
    return Boolean(a && b && a.x === b.x && a.y === b.y && a.k === b.k);
}
