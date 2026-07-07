"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Image as ImageIcon, Maximize2, Music2, Plus, RefreshCw, Star, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import type { UploadedFile } from "@/services/file-storage";
import { CanvasResourceMentionTextarea, placeCaretAtEnd, type CanvasResourceMentionTextareaHandle } from "./canvas-resource-mention-textarea";
import { CanvasTextFullscreenOverlay } from "./canvas-text-fullscreen-overlay";
import { CanvasNodeLoadingState } from "./canvas-node-loading-state";
import { CanvasVideoPlayer, type CanvasVideoPlayerHandle } from "./canvas-video-player";
import { CanvasNodeType, type CanvasNodeData, type ConnectionHandle, type Position } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type ResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "right" | "bottom" | "left";

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    isSelected: boolean;
    isGroupPackaged?: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    connectionDropSides?: Array<"left" | "right">;
    activeConnectHandle?: ConnectionHandle | null;
    editRequestNonce?: number;
    showPanel: boolean;
    showImageInfo: boolean;
    resourceLabel?: CanvasResourceReference;
    mentionReferences?: CanvasResourceReference[];
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target") => void;
    onConnectMenu?: (nodeId: string, handleType: "source" | "target") => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
    onResizeActiveChange?: (active: boolean) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
    onVideoPersisted?: (nodeId: string, file: UploadedFile) => void;
    onRegisterVideoControl?: (nodeId: string, handle: CanvasVideoPlayerHandle | null) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isSelected: boolean;
    isEditingContent: boolean;
    textareaRef: React.RefObject<CanvasResourceMentionTextareaHandle | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onVideoPersisted?: (file: UploadedFile) => void;
    onRegisterVideoControl?: (handle: CanvasVideoPlayerHandle | null) => void;
    hovered?: boolean;
    textFullscreenOpen?: boolean;
    onTextFullscreenChange?: (open: boolean) => void;
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    isSelected,
    isGroupPackaged = false,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    connectionDropSides,
    activeConnectHandle = null,
    editRequestNonce = 0,
    showPanel,
    showImageInfo,
    resourceLabel,
    mentionReferences = [],
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onMouseDown,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onConnectMenu,
    onResize,
    onResizeActiveChange,
    onContentChange,
    onToggleBatch,
    onSetBatchPrimary,
    onRetry,
    onGenerateImage,
    onViewImage,
    onContextMenu,
    onVideoPersisted,
    onRegisterVideoControl,
}: CanvasNodeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const [connectHover, setConnectHover] = useState<"left" | "right" | null>(null);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [textFullscreenOpen, setTextFullscreenOpen] = useState(false);
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content);
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    const nodeTypeLabel = canvasNodeTypeLabel(data.type);
    const nodeTypeIcon = canvasNodeTypeIcon(data.type);
    const nodeTypeLabelOutside = data.type === CanvasNodeType.Image || data.type === CanvasNodeType.Video;
    const leftHandleActive = activeConnectHandle?.nodeId === data.id && activeConnectHandle.handleType === "target";
    const rightHandleActive = activeConnectHandle?.nodeId === data.id && activeConnectHandle.handleType === "source";
    const textareaRef = useRef<CanvasResourceMentionTextareaHandle | null>(null);
    const resizeRef = useRef({
        isResizing: false,
        handle: "bottom-right" as ResizeHandle,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });
    const lastResizeEmitRef = useRef<{ width: number; height: number; x: number; y: number } | null>(null);

    useEffect(() => {
        const textarea = textareaRef.current?.getEditorElement();
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const frame = requestAnimationFrame(() => {
            const editor = textareaRef.current?.getEditorElement();
            if (!editor) return;
            editor.focus();
            placeCaretAtEnd(editor);
        });
        return () => cancelAnimationFrame(frame);
    }, [isEditingContent]);

    useEffect(() => {
        if (!editRequestNonce || data.type !== CanvasNodeType.Text) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            const editor = textareaRef.current?.getEditorElement();
            if (isEditingContent && editor?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: PointerEvent) => {
            if (!resizeRef.current.isResizing) return;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const handle = resizeRef.current.handle;
            const isCorner = handle.includes("-");
            const fromLeft = handle === "left" || handle.endsWith("-left");
            const fromTop = handle === "top" || handle.startsWith("top-");
            const fromRight = handle === "right" || handle.endsWith("-right");
            const fromBottom = handle === "bottom" || handle.endsWith("-bottom");
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;

            let width = resizeRef.current.startWidth;
            let height = resizeRef.current.startHeight;

            if (fromLeft || fromRight) {
                width = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            }
            if (fromTop || fromBottom) {
                height = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            }

            if (resizeRef.current.keepRatio && isCorner) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            const nextPosition = {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            };
            const last = lastResizeEmitRef.current;
            if (
                last &&
                Math.abs(last.width - width) < 0.5 &&
                Math.abs(last.height - height) < 0.5 &&
                Math.abs(last.x - nextPosition.x) < 0.5 &&
                Math.abs(last.y - nextPosition.y) < 0.5
            ) {
                return;
            }
            lastResizeEmitRef.current = { width, height, x: nextPosition.x, y: nextPosition.y };
            onResize(data.id, width, height, nextPosition);
        },
        [data.id, onResize, scale],
    );

    const handleResizeUp = useCallback(() => {
        if (!resizeRef.current.isResizing) return;
        resizeRef.current.isResizing = false;
        lastResizeEmitRef.current = null;
        onResizeActiveChange?.(false);
        window.removeEventListener("pointermove", handleResizeMove);
        window.removeEventListener("pointerup", handleResizeUp);
        window.removeEventListener("pointercancel", handleResizeUp);
    }, [handleResizeMove, onResizeActiveChange]);

    const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
        event.stopPropagation();
        event.preventDefault();
        onResizeActiveChange?.(true);
        lastResizeEmitRef.current = null;
        resizeRef.current = {
            isResizing: true,
            handle,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video,
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("pointermove", handleResizeMove);
        window.addEventListener("pointerup", handleResizeUp);
        window.addEventListener("pointercancel", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("pointermove", handleResizeMove);
            window.removeEventListener("pointerup", handleResizeUp);
            window.removeEventListener("pointercancel", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    const showSelectionChrome = isSelected && !isGroupPackaged;
    const leftConnectionDrop = Boolean(connectionDropSides?.includes("left"));
    const rightConnectionDrop = Boolean(connectionDropSides?.includes("right"));
    const leftHandleVisible =
        (showSelectionChrome || hovered || connectHover === "left" || leftHandleActive || (isConnecting && leftConnectionDrop)) &&
        connectHover !== "right" &&
        !rightHandleActive;
    const rightHandleVisible =
        data.type !== CanvasNodeType.Config &&
        (showSelectionChrome || hovered || connectHover === "right" || rightHandleActive || (isConnecting && rightConnectionDrop)) &&
        connectHover !== "left" &&
        !leftHandleActive;

    const borderColor = showSelectionChrome
        ? theme.node.activeStroke
        : hasImageContent
          ? isRelated && !isBatchChild
              ? theme.node.muted
              : "transparent"
          : isConnectionTarget
            ? "rgba(255,255,255,.28)"
            : isRelated
              ? theme.node.muted
              : theme.node.stroke;

    return (
        <div
            data-node-id={data.id}
            className={`node-element canvas-node-pop-in absolute flex select-none flex-col transition-shadow duration-200 ${showSelectionChrome ? "z-50" : "z-10"}`}
            style={{
                left: data.position.x,
                top: data.position.y,
                width: data.width,
                height: data.height,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            {nodeTypeLabelOutside ? (
                <div className="canvas-node-type-badge canvas-node-type-badge-external pointer-events-none absolute left-0 top-0 z-[115] -translate-y-[calc(100%+8px)]">
                    {nodeTypeIcon}
                    {nodeTypeLabel}
                </div>
            ) : null}

            <div
                className="relative h-full w-full overflow-visible rounded-3xl border"
                style={{
                    background: hasImageContent || hasVideoContent ? "transparent" : theme.node.fill,
                    borderColor,
                    borderWidth: showSelectionChrome ? 2 : 1,
                    boxShadow: showSelectionChrome
                        ? `0 0 0 1px ${theme.node.activeStroke}`
                        : isRelated && !isBatchChild
                          ? `0 18px 48px rgba(0,0,0,.14)`
                          : undefined,
                }}
                onPointerDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button")) return;
                    if (target.closest("[data-canvas-interactive]")) return;
                    if (target.closest("[data-resize-handle]")) {
                        event.stopPropagation();
                        return;
                    }
                    onMouseDown(event as unknown as React.MouseEvent, data.id);
                }}
                onDoubleClick={(event) => {
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type === CanvasNodeType.Video && hasVideoContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setTextFullscreenOpen(true);
                }}
            >
                {!nodeTypeLabelOutside ? (
                    <div className="canvas-node-type-badge pointer-events-none absolute left-3 top-3 z-[115]">
                        {nodeTypeLabel}
                    </div>
                ) : null}

                <div
                    className={`relative flex h-full w-full rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"} ${data.type === CanvasNodeType.Text ? "items-stretch" : "items-center justify-center"}`}
                    style={
                        {
                            background: hasImageContent || hasVideoContent ? "transparent" : theme.node.fill,
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    <NodeContent
                        node={data}
                        theme={theme}
                        isSelected={isSelected}
                        isEditingContent={isEditingContent}
                        textareaRef={textareaRef}
                        isBatchRoot={isBatchRoot}
                        batchCount={batchCount}
                        batchExpanded={batchExpanded}
                        batchOpening={batchOpening}
                        batchRecovering={batchRecovering}
                        renderNodeContent={renderNodeContent}
                        mentionReferences={mentionReferences}
                        onContentChange={onContentChange}
                        onStopEditing={() => setIsEditingContent(false)}
                        onRetry={onRetry}
                        onGenerateImage={onGenerateImage}
                        onToggleBatch={() => onToggleBatch?.(data.id)}
                        onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                        onVideoPersisted={onVideoPersisted ? (file) => onVideoPersisted(data.id, file) : undefined}
                        onRegisterVideoControl={onRegisterVideoControl ? (handle) => onRegisterVideoControl(data.id, handle) : undefined}
                        hovered={hovered}
                        textFullscreenOpen={textFullscreenOpen}
                        onTextFullscreenChange={setTextFullscreenOpen}
                    />
                </div>

                {showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}
                {resourceLabel ? <ResourceLabelBadge reference={resourceLabel} /> : null}

                {!hasImageContent && !hasVideoContent && !hasAudioContent && data.metadata?.status !== "loading" ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} />
                ) : null}

                {showSelectionChrome ? (
                    <>
                        <ResizeHandle handle="top-left" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="top-right" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="bottom-left" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="bottom-right" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="top" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="right" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="bottom" onPointerDown={handleResizePointerDown} />
                        <ResizeHandle handle="left" onPointerDown={handleResizePointerDown} />
                    </>
                ) : null}
            </div>

            <ConnectionHandlePlus side="left" visible={leftHandleVisible} emphasized={leftHandleActive} onHoverChange={(active) => setConnectHover((current) => (active ? "left" : current === "left" ? null : current))} onConnectStart={(event) => onConnectStart(event, data.id, "target")} onConnectMenu={onConnectMenu ? () => onConnectMenu(data.id, "target") : undefined} />
            {data.type !== CanvasNodeType.Config ? (
                <ConnectionHandlePlus side="right" visible={rightHandleVisible} emphasized={rightHandleActive} onHoverChange={(active) => setConnectHover((current) => (active ? "right" : current === "right" ? null : current))} onConnectStart={(event) => onConnectStart(event, data.id, "source")} onConnectMenu={onConnectMenu ? () => onConnectMenu(data.id, "source") : undefined} />
            ) : null}

            {showPanel && renderPanel ? <div className="canvas-node-panel-anchor absolute left-1/2 top-full z-[70] -translate-x-1/2 pt-5">{renderPanel(data)}</div> : null}
        </div>
    );
});

function canvasNodeTypeLabel(type: CanvasNodeType) {
    if (type === CanvasNodeType.Image) return "图片节点";
    if (type === CanvasNodeType.Video) return "视频节点";
    if (type === CanvasNodeType.Audio) return "音频节点";
    if (type === CanvasNodeType.Config) return "生成配置";
    return "文本节点";
}

function canvasNodeTypeIcon(type: CanvasNodeType) {
    if (type === CanvasNodeType.Image) return <ImageIcon className="size-3.5" strokeWidth={2.2} />;
    if (type === CanvasNodeType.Video) return <Video className="size-3.5" strokeWidth={2.2} />;
    if (type === CanvasNodeType.Audio) return <Music2 className="size-3.5" strokeWidth={2.2} />;
    return null;
}

function NodeContent(props: NodeContentRendererProps) {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    if (props.node.metadata?.status === "loading" && props.node.type !== CanvasNodeType.Video) {
        return (
            <CanvasNodeLoadingState
                variant={props.node.type === CanvasNodeType.Image ? "image" : "default"}
                progress={props.node.metadata?.generationProgress}
                label={props.node.metadata?.generationStage}
            />
        );
    }
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type];
    return Renderer ? <Renderer {...props} /> : <UnknownNodeContent theme={props.theme} />;
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    return (
        <div className="flex max-w-[280px] flex-col items-center gap-3 px-5 text-center">
            <div className="line-clamp-4 text-xs leading-5 text-red-300/90">{node.metadata?.errorDetails || "生成失败"}</div>
            <span
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </span>
        </div>
    );
}

function UnknownNodeContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: theme.node.placeholder }}>
            未知节点
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onGenerateImage, hovered = false, textFullscreenOpen = false, onTextFullscreenChange }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;
    const fullscreenEditorRef = useRef<CanvasResourceMentionTextareaHandle | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!textFullscreenOpen) return;
        const frame = requestAnimationFrame(() => fullscreenEditorRef.current?.focusEditor());
        return () => cancelAnimationFrame(frame);
    }, [textFullscreenOpen]);

    useEffect(() => {
        const preview = previewRef.current;
        if (!preview || isEditingContent) return;
        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        preview.addEventListener("wheel", handleWheel, { passive: false });
        return () => preview.removeEventListener("wheel", handleWheel);
    }, [isEditingContent, node.metadata?.content]);

    const openFullscreen = (event?: React.MouseEvent | React.PointerEvent) => {
        event?.stopPropagation();
        onTextFullscreenChange?.(true);
    };

    return (
        <>
            <div className="flex h-full w-full min-h-0 flex-col overflow-hidden pt-8" data-canvas-no-zoom>
                <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5">
                    <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
                        style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onGenerateImage?.(node);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        title="用文本生图"
                        aria-label="用文本生图"
                    >
                        <ImageIcon className="size-3.5" />
                        生图
                    </button>
                    <button
                        type="button"
                        className={`grid size-8 place-items-center rounded-full border backdrop-blur-md transition ${hovered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
                        style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                        title="全屏阅读/编辑"
                        aria-label="全屏阅读/编辑"
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={openFullscreen}
                    >
                        <Maximize2 className="size-3.5" />
                    </button>
                </div>
                {isEditingContent ? (
                    <CanvasResourceMentionTextarea
                        ref={textareaRef}
                        className="thin-scrollbar block min-h-0 flex-1 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-4 pt-0 pb-4 m-0 font-mono outline-none select-text appearance-none"
                        style={textStyle}
                        value={node.metadata?.content || ""}
                        references={mentionReferences}
                        highlightLabels={false}
                        onChange={(value) => onContentChange(node.id, value)}
                        onBlur={onStopEditing}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") onStopEditing();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                    />
                ) : (
                    <div ref={previewRef} className="thin-scrollbar block min-h-0 flex-1 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent pl-4 pr-4 pt-0 pb-4 font-mono" style={textStyle}>
                        {node.metadata?.content || <span style={{ color: theme.node.placeholder }}>双击全屏查看</span>}
                    </div>
                )}
            </div>
            <CanvasTextFullscreenOverlay open={textFullscreenOpen} title={node.title || "文本节点"} onClose={() => onTextFullscreenChange?.(false)}>
                <CanvasResourceMentionTextarea
                    ref={fullscreenEditorRef}
                    nestedFullscreen
                    value={node.metadata?.content || ""}
                    references={mentionReferences}
                    highlightLabels={false}
                    className="thin-scrollbar h-full min-h-[70vh] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl border px-4 py-3 font-mono outline-none"
                    style={{ ...textStyle, fontSize: `${Math.max(fontSize, 16)}px`, lineHeight: `${Math.round(Math.max(fontSize, 16) * 1.65)}px`, background: theme.node.fill, borderColor: theme.node.stroke }}
                    containerClassName="h-full"
                    onChange={(value) => onContentChange(node.id, value)}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            </CanvasTextFullscreenOverlay>
        </>
    );
}

function ResourceLabelBadge({ reference }: { reference: CanvasResourceReference }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <span
            className="pointer-events-none absolute right-2 top-2 z-30 rounded-md px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
            style={{
                background: reference.active ? theme.accent.solid : "rgba(0,0,0,.35)",
                color: reference.active ? theme.accent.contrast : "rgba(255,255,255,.75)",
            }}
        >
            {reference.label}
        </span>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <CanvasNodeLoadingState variant="image" progress={props.node.metadata?.generationProgress} label={props.node.metadata?.generationStage} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!props.node.metadata?.content) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function EmptyImageContent({ node, theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, onRetry }: NodeContentRendererProps) {
    if (node.metadata?.status === "loading") {
        return (
            <div className="relative h-full w-full overflow-hidden">
                <CanvasNodeLoadingState variant="image" progress={node.metadata.generationProgress} label={node.metadata.generationStage} />
            </div>
        );
    }
    if (node.metadata?.status === "error") {
        return <ErrorContent node={node} theme={theme} onRetry={onRetry} />;
    }
    const content = (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: theme.toolbar.activeBg }}>
                <ImageIcon className="size-6 opacity-30" />
            </div>
            <span className="text-[10px] tracking-[0.18em] opacity-50">空图片节点</span>
        </div>
    );
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function VideoNodeContent({ node, theme, onVideoPersisted, onRegisterVideoControl }: NodeContentRendererProps) {
    if (!node.metadata?.content) {
        return (
            <div className="relative h-full w-full overflow-hidden">
                {node.metadata?.status === "loading" ? (
                    <CanvasNodeLoadingState variant="video" progress={node.metadata?.generationProgress} label={node.metadata?.generationStage} />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5" style={{ color: theme.node.placeholder }}>
                        <div className="grid size-12 place-items-center rounded-2xl" style={{ background: `${theme.toolbar.activeBg}cc`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)" }}>
                            <Video className="size-6 opacity-40" />
                        </div>
                        <span className="text-sm tracking-wide opacity-70">空视频节点</span>
                    </div>
                )}
            </div>
        );
    }
    return (
        <div className="relative h-full w-full overflow-hidden">
            <CanvasVideoPlayer
                variant="node"
                content={node.metadata.content}
                storageKey={node.metadata.storageKey}
                mimeType={node.metadata.mimeType}
                taskId={node.metadata.videoTaskId}
                provider={node.metadata.videoProvider}
                model={node.metadata.model}
                onPersisted={onVideoPersisted}
                onHandleReady={onRegisterVideoControl}
            />
        </div>
    );
}

function AudioNodeContent({ node, theme, isSelected }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">空音频节点</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{node.title || "音频"}</span>
            </div>
            <audio src={node.metadata.content} controls className={`w-full ${isSelected ? "pointer-events-auto" : "pointer-events-none"}`} {...(isSelected ? { "data-canvas-interactive": true, "data-canvas-no-zoom": true } : {})} />
        </div>
    );
}

function ImageContent({
    node,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-3xl">
                <img
                    src={node.metadata!.content!}
                    alt={node.title}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                />
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none" style={{ color: theme.accent.text }}>
                        {batchCount}
                    </span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
            {isBatchChild ? (
                <button
                    type="button"
                    className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5" style={{ color: theme.accent.text }} />
                    设为主图
                </button>
            ) : null}
        </BatchFrame>
    );
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <span className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </span>
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, children }: { batchCount: number; batchExpanded: boolean; batchOpening: boolean; batchRecovering: boolean; onToggleBatch?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div
            className="group/batch relative h-full w-full overflow-visible"
            onDoubleClick={
                isBatchRoot
                    ? (event) => {
                          event.stopPropagation();
                          onToggleBatch?.();
                      }
                    : undefined
            }
        >
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/batch:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                transform:
                                    batchOpening || batchRecovering ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)` : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ handle, onPointerDown }: { handle: ResizeHandle; onPointerDown: (event: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] size-7 cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] size-7 cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] size-7 cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] size-7 cursor-nwse-resize",
        top: "-top-[10px] left-1/2 h-5 w-14 -translate-x-1/2 cursor-ns-resize",
        right: "-right-[10px] top-1/2 h-14 w-5 -translate-y-1/2 cursor-ew-resize",
        bottom: "-bottom-[10px] left-1/2 h-5 w-14 -translate-x-1/2 cursor-ns-resize",
        left: "-left-[10px] top-1/2 h-14 w-5 -translate-y-1/2 cursor-ew-resize",
    }[handle];

    return (
        <div
            data-resize-handle
            className={`absolute z-[90] touch-none ${positionClass}`}
            onPointerDown={(event) => {
                event.stopPropagation();
                onPointerDown(event, handle);
            }}
        />
    );
}

function ConnectionHandlePlus({
    side,
    visible,
    emphasized,
    onHoverChange,
    onConnectStart,
    onConnectMenu,
}: {
    side: "left" | "right";
    visible: boolean;
    emphasized?: boolean;
    onHoverChange?: (active: boolean) => void;
    onConnectStart: (event: React.MouseEvent) => void;
    onConnectMenu?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const pointerRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
    const [hot, setHot] = useState(false);
    const [pressed, setPressed] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [magnetOffset, setMagnetOffset] = useState({ x: 0, y: 0 });

    const resetPointer = useCallback(() => {
        pointerRef.current = null;
        setPressed(false);
        setPulling(false);
        setMagnetOffset({ x: 0, y: 0 });
    }, []);

    useEffect(() => {
        if (visible) return;
        setHot(false);
        resetPointer();
        onHoverChange?.(false);
    }, [onHoverChange, resetPointer, visible]);

    useEffect(() => {
        const resetAll = () => resetPointer();
        window.addEventListener("pointerup", resetAll);
        window.addEventListener("pointercancel", resetAll);
        window.addEventListener("blur", resetAll);
        return () => {
            window.removeEventListener("pointerup", resetAll);
            window.removeEventListener("pointercancel", resetAll);
            window.removeEventListener("blur", resetAll);
        };
    }, [resetPointer]);

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        event.preventDefault();
        pointerRef.current = { x: event.clientX, y: event.clientY, dragging: false };
        setPressed(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const updateMagnet = (event: React.PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        const range = 96;
        const maxPull = 22;

        if (!distance || distance > range) {
            setMagnetOffset({ x: 0, y: 0 });
            return;
        }

        const pull = 1 - Math.pow(1 - distance / range, 2);
        setMagnetOffset({
            x: (dx / distance) * maxPull * pull,
            y: (dy / distance) * maxPull * pull,
        });
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        updateMagnet(event);
        if (!pointerRef.current || pointerRef.current.dragging) return;
        const dx = event.clientX - pointerRef.current.x;
        const dy = event.clientY - pointerRef.current.y;
        if (dx * dx + dy * dy <= 100) return;
        pointerRef.current.dragging = true;
        setPulling(true);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onConnectStart(event as unknown as React.MouseEvent);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (pointerRef.current && !pointerRef.current.dragging) onConnectMenu?.();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        resetPointer();
    };

    const expanded = hot || emphasized || pulling || pressed;
    const pressedExpanded = pressed || pulling;
    const outerSize = 132;
    const coreSize = pressedExpanded ? 56 : expanded ? 48 : 40;
    const iconSize = pressedExpanded ? "size-7" : expanded ? "size-5" : "size-5";
    const offset = -(outerSize / 2 + 30);
    const coreBackground = pressedExpanded
        ? `radial-gradient(circle at 34% 22%, rgba(255,255,255,.2), transparent 44%), linear-gradient(180deg, color-mix(in srgb, ${theme.node.panel} 76%, ${theme.accent.solid} 24%), color-mix(in srgb, ${theme.node.panel} 88%, #000000))`
        : expanded
          ? `radial-gradient(circle at 34% 22%, rgba(255,255,255,.14), transparent 42%), linear-gradient(180deg, color-mix(in srgb, ${theme.toolbar.panel} 82%, ${theme.accent.solid} 18%), color-mix(in srgb, ${theme.node.panel} 92%, #000000))`
          : `linear-gradient(180deg, color-mix(in srgb, ${theme.toolbar.panel} 88%, transparent), color-mix(in srgb, ${theme.node.panel} 92%, transparent))`;
    const coreShadow = pressedExpanded
        ? `inset 0 1px 0 rgba(255,255,255,.24), inset 0 -10px 18px rgba(0,0,0,.18), 0 0 0 7px ${theme.accent.soft}, 0 16px 38px rgba(0,0,0,.3)`
        : expanded
          ? `inset 0 1px 0 rgba(255,255,255,.18), inset 0 -8px 16px rgba(0,0,0,.14), 0 0 0 5px ${theme.accent.soft}, 0 12px 28px rgba(0,0,0,.24)`
          : "inset 0 1px 0 rgba(255,255,255,.08), 0 3px 10px rgba(0,0,0,.12)";
    const coreBorderColor = pressedExpanded ? theme.accent.solid : expanded ? `color-mix(in srgb, ${theme.accent.solid} 72%, transparent)` : "rgba(255,255,255,.14)";

    return (
        <button
            type="button"
            data-connection-handle
            aria-label={side === "left" ? "添加输入或拖拽连线" : "添加节点或拖拽连线"}
            className={`absolute top-1/2 z-[110] flex -translate-y-1/2 items-center justify-center rounded-full transition-opacity duration-150 pointer-events-auto ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={
                {
                    width: outerSize,
                    height: outerSize,
                    [side === "left" ? "left" : "right"]: offset,
                } as React.CSSProperties
            }
            onPointerEnter={() => {
                setHot(true);
                onHoverChange?.(true);
            }}
            onPointerLeave={() => {
                setHot(false);
                setMagnetOffset({ x: 0, y: 0 });
                if (!pointerRef.current) resetPointer();
                onHoverChange?.(false);
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={resetPointer}
        >
            <span
                className="grid place-items-center rounded-full border transition duration-150"
                style={{
                    width: coreSize,
                    height: coreSize,
                    transform: `translate3d(${magnetOffset.x}px, ${magnetOffset.y}px, 0) scale(${pressedExpanded ? 1.1 : expanded ? 1.04 : 1})`,
                    background: coreBackground,
                    borderColor: coreBorderColor,
                    color: expanded ? theme.node.text : theme.node.muted,
                    boxShadow: coreShadow,
                }}
                title={side === "left" ? "点击添加输入 · 按住拖拽连线" : "点击添加节点 · 按住拖拽连线"}
            >
                <Plus className={iconSize} strokeWidth={2.5} />
            </span>
        </button>
    );
}
