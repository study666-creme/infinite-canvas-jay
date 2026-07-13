"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Bot, Home, ImageIcon, Images, List, Menu, Music2, Plus, Redo2, Save, Settings2, Trash2, Undo2, Upload, Video } from "lucide-react";
import { saveAs } from "file-saver";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { downloadRemoteVideoBlob, requestVideoGeneration, storeGeneratedVideo, type VideoGenerationResult } from "@/services/api/video";
import { appendImageGenerationLogFromCanvas } from "@/services/image-generation-logs";
import { ensureAllLocalMediaPermissions } from "@/services/local-media-store";
import { defaultConfig, type AiConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import {
    canSaveImageNodeToPromptHub,
    imageNodeToBase64,
    resolveImageNodePrompt,
    savePromptHubQuickCard,
} from "@/services/prompt-hub";
import { requestPromptHubCanvasImages } from "@/services/prompt-hub-generation";
import { requestPromptHubCanvasVideo } from "@/services/prompt-hub-video";
import { requestPromptHubText } from "@/services/prompt-hub-text";
import { normalizePromptHubVideoRatio, parsePromptHubModelId, promptHubImageCountRange, promptHubImageMaxReferences, promptHubVideoAspectRatios } from "@/services/prompt-hub-models";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";
import { resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { App, Button, Dropdown, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import { ActiveConnectionPath, ConnectionPath } from "../components/canvas-connections";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasAssistantPanel } from "../components/canvas-assistant-panel";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { CanvasReferenceHoverPreviewHost } from "../components/canvas-reference-hover-preview";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import { CanvasNodeVideoFrameDialog } from "../components/canvas-node-video-frame-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "../components/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "../components/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "../components/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationInput } from "../components/canvas-node-generation";
import { resolveActiveVideoReferences, toVideoReferenceAssets } from "../utils/canvas-video-references";
import { CanvasVideoPlayer, type CanvasVideoPlayerHandle } from "../components/canvas-video-player";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "../components/canvas-node-hover-toolbar";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { Minimap } from "../components/canvas-mini-map";
import { CanvasNode } from "../components/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import { CanvasAssetDrawer } from "../components/canvas-asset-drawer";
import { CANVAS_ASSET_DRAG_TYPE, parseAssetDragPayload, type InsertAssetPayload } from "../components/asset-library-panel";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { CanvasShortcutsModal } from "../components/canvas-shortcuts-panel";
import { CanvasLocalAgentPanel } from "../components/canvas-local-agent-panel";
import { CanvasDirectorStage, type CanvasDirectorStageHandle } from "../components/canvas-director-stage";
import { useCanvasAgentStore } from "../stores/use-canvas-agent-store";
import { useCanvasStore, flushCanvasStore, subscribeCanvasPersistStatus } from "../stores/use-canvas-store";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { createInitialCreativeProjectState, deriveCreativeProjectState, mirrorCreativeProjectBlackboard, reconcileCreativeProjectState } from "../utils/creative-project-state";
import type { DirectorStageActionHandler, DirectorStageCapture } from "../utils/director-stage-types";
import { buildCanvasResourceReferences, buildNodeMentionReferences } from "../utils/canvas-resource-references";
import { getCanvasViewBounds, isConnectionInView, isNodeInView } from "../utils/canvas-viewport";
import { screenPointToCanvasWorld } from "../utils/canvas-coordinates";
import { arrangeGroupLayoutPatch, canGroupNodes, collectDragNodeIds, collectGroupDragNodeIds, createGroupPatch, expandSelectionWithGroups, getGroupNodeIds, getGroupRootId, isGroupSelected, listNodeGroups, ungroupPatch, withGroupColor, withGroupName } from "../utils/canvas-node-groups";
import { normalizeJimengQualityValue } from "@/components/image-settings-panel";
import {
    applyUploadedImageToNode,
    buildPromptHubConnections,
    buildPromptHubImageNodes,
    buildPromptHubSiblingImageNodes,
    buildPromptTextNodePatch,
    createBatchChildNode,
    createBatchConnections,
    loadingProgressMetadata,
    resolvePromptHubAnchor,
    startGenerationProgressTicker,
    type GeneratedImageItem,
} from "../utils/canvas-image-batch";
import { CanvasNodeGroupBackdrop } from "../components/canvas-node-group-frame";
import { CanvasNodeGroupHoverToolbar } from "../components/canvas-node-group-hover-toolbar";
import type { CanvasAgentMode } from "../components/canvas-agent-chat-ui";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasImageGenerationType,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CreativeProjectState,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type SelectionBox,
    type ViewportTransform,
} from "../types";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    creativeProjectState: CreativeProjectState;
};

type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

const VIDEO_NODE_MAX_WIDTH = 640;
const VIDEO_NODE_MAX_HEIGHT = 640;
const WHEEL_RESIZE_MIN_WIDTH = 160;
const WHEEL_RESIZE_MIN_HEIGHT = 90;
const WHEEL_RESIZE_MAX_EDGE = 4096;
const CONNECTION_HANDLE_HIT_RADIUS = 52;
const CONNECTION_HANDLE_SCREEN_OFFSET = 48;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

function createCanvasNode(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
        },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function CanvasRefreshShell() {
    return (
        <main className="relative h-full min-h-0 overflow-hidden bg-background text-foreground">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />

            <div className="absolute bottom-5 left-1/2 z-50 flex h-14 -translate-x-1/2 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="size-8 rounded-md bg-current opacity-10" />
                ))}
            </div>

            <div className="absolute bottom-24 left-6 z-50 h-40 w-[240px] rounded-lg border shadow-2xl backdrop-blur-sm" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="absolute left-7 top-7 h-5 w-12 rounded-sm bg-current opacity-10" />
                <div className="absolute left-28 top-16 h-6 w-16 rounded-sm bg-current opacity-10" />
                <div className="absolute bottom-7 left-16 h-8 w-20 rounded-sm bg-current opacity-10" />
                <div className="absolute inset-5 rounded border border-current opacity-15" />
            </div>

            <div className="absolute bottom-5 left-5 z-50 flex h-14 w-[260px] items-center gap-2 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="h-1 flex-1 rounded-full bg-current opacity-10" />
                <div className="h-4 w-10 rounded bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
            </div>
        </main>
    );
}

function ConnectionCreateMenu({ pending, onCreate, onClose }: { pending: PendingConnectionCreate; onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: pending.position.x, top: pending.position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    ×
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="配置节点" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
            </div>
        </div>
    );
}

function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button type="button" className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition" style={{ color: theme.node.text }} onClick={onClick} onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)} onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>{description}</span> : null}
            </span>
        </button>
    );
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = params.id;
    const localAgentConnected = useCanvasAgentStore((state) => state.connected);
    const localAgentActivity = useCanvasAgentStore((state) => state.activity);
    const localAgentEnabled = useCanvasAgentStore((state) => state.enabled);
    const containerRef = useRef<HTMLDivElement>(null);
    const worldLayerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const projectSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastPointerPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
    const toolbarNodeIdRef = useRef<string | null>(null);
    const assetInsertRef = useRef<((payload: InsertAssetPayload, position?: Position) => void) | null>(null);
    const groupToolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const groupToolbarMenuOpenRef = useRef(false);
    const toolbarImageSettingsOpenRef = useRef(false);
    const nodeDraggingRef = useRef(false);

    useEffect(() => {
        void ensureAllLocalMediaPermissions();
    }, []);

    const videoPlayerRef = useRef(new Map<string, CanvasVideoPlayerHandle>());

    const registerVideoControl = useCallback((nodeId: string, handle: CanvasVideoPlayerHandle | null) => {
        if (handle) videoPlayerRef.current.set(nodeId, handle);
        else videoPlayerRef.current.delete(nodeId);
    }, []);

    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        initialSelectedNodes: { id: string; x: number; y: number }[];
        initialSelectedNodeMap: Map<string, { x: number; y: number }>;
    }>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
        initialSelectedNodeMap: new Map(),
    });

    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [creativeProjectState, setCreativeProjectState] = useState<CreativeProjectState>(() => createInitialCreativeProjectState());
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [toolbarGroupRootId, setToolbarGroupRootId] = useState<string | null>(null);
    const [toolbarImageSettingsOpen, setToolbarImageSettingsOpen] = useState(false);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [videoFrameNodeId, setVideoFrameNodeId] = useState<string | null>(null);
    const [videoFrameCrop, setVideoFrameCrop] = useState<{ node: CanvasNodeData; dataUrl: string } | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [assistantCollapsed, setAssistantCollapsed] = useState(true);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [assistantClosing, setAssistantClosing] = useState(false);
    const [agentMode, setAgentMode] = useState<CanvasAgentMode>("online");
    const [agentUndoSnapshot, setAgentUndoSnapshot] = useState<CanvasAgentSnapshot | null>(null);
    const codexAutoConnect = ["new", "recent", "choose"].includes(searchParams.get("mode") || "");
    const codexCompactAgent = codexAutoConnect && searchParams.has("agentUrl");
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [savePending, setSavePending] = useState(false);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const creativeProjectStateRef = useRef(creativeProjectState);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const nodeResizingRef = useRef(false);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());
    const projectMetaRef = useRef({ chatSessions, activeChatId, backgroundMode, showImageInfo });
    const projectLoadedRef = useRef(projectLoaded);
    const projectIdRef = useRef(projectId);
    const directorStageRef = useRef<CanvasDirectorStageHandle>(null);
    const applyAgentOpsRef = useRef<((ops?: CanvasAgentOp[]) => CanvasAgentSnapshot) | null>(null);

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
            creativeProjectState: creativeProjectStateRef.current,
        }),
        [activeChatId, backgroundMode, chatSessions, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
        const previous = generationRequestsRef.current.get(targetNodeId);
        if (previous?.controller !== controller) previous?.controller.abort();
        generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
        return controller;
    }, []);

    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
    }, []);

    const isGenerationRequestActive = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        return !controller.signal.aborted && request?.controller === controller;
    }, []);

    const cancelGenerationRequestsForNodeIds = useCallback((ids: Set<string>) => {
        const affectedNodeIds = new Set<string>();
        const affectedRunningIds = new Set<string>();
        const canceledControllers = new Set<AbortController>();
        generationRequestsRef.current.forEach((request) => {
            if (!ids.has(request.targetNodeId) && !ids.has(request.originNodeId) && !ids.has(request.runningNodeId)) return;
            canceledControllers.add(request.controller);
            affectedRunningIds.add(request.runningNodeId);
        });
        generationRequestsRef.current.forEach((request) => {
            if (!canceledControllers.has(request.controller)) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
            affectedRunningIds.add(request.runningNodeId);
        });
        return { affectedNodeIds, affectedRunningIds };
    }, []);

    const cancelAllGenerationRequests = useCallback(() => {
        generationRequestsRef.current.forEach((request) => request.controller.abort());
        generationRequestsRef.current.clear();
        setRunningNodeId(null);
    }, []);

    const stopGenerationByRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = new Set<string>();
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
        });
        setRunningNodeId((current) => (current === runningId ? null : current));
        if (!affectedNodeIds.size) return;
        setNodes((prev) =>
            prev.map((node) =>
                affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING
                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } }
                    : node,
            ),
        );
    }, []);

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: "停止生成？",
                content: "当前生成请求会被中断，已经生成完成的内容会保留。",
                okText: "停止",
                cancelText: "继续生成",
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId],
    );

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        const project = openProject(projectId);
        if (!project) {
            router.replace("/canvas");
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredSessions = expirePendingAssistantSessions(await hydrateAssistantImages(project.chatSessions || []));
            const restoredProjectState = expireRestoredCreativeAction(reconcileCreativeProjectState(restoredNodes, project.creativeProjectState));
            setNodes(restoredNodes);
            setConnections(project.connections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            creativeProjectStateRef.current = restoredProjectState;
            setCreativeProjectState(restoredProjectState);
            didInitialCenterRef.current = true;
            viewportRef.current = project.viewport;
            setViewport(project.viewport);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
                creativeProjectState: restoredProjectState,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, openProject, projectId, router]);

    useEffect(() => {
        if (!projectLoaded || !["new", "recent", "choose"].includes(searchParams.get("mode") || "")) return;
        if (searchParams.has("agentUrl")) {
            openAgent("local");
            return;
        }
        openAgent("local");
    }, [projectLoaded, searchParams]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (previous?.nodes === next.nodes && previous.connections === next.connections && previous.chatSessions === next.chatSessions && previous.activeChatId === next.activeChatId && previous.backgroundMode === next.backgroundMode && previous.showImageInfo === next.showImageInfo && previous.creativeProjectState === next.creativeProjectState) return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, creativeProjectState, nodes, projectLoaded, showImageInfo]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const nextState = reconcileCreativeProjectState(nodes, creativeProjectStateRef.current);
        const stateChanged = JSON.stringify(nextState) !== JSON.stringify(creativeProjectStateRef.current);
        if (stateChanged) {
            creativeProjectStateRef.current = nextState;
            setCreativeProjectState(nextState);
        }
        const mirroredNodes = mirrorCreativeProjectBlackboard(nodes, nextState);
        if (mirroredNodes !== nodes) setNodes(mirroredNodes);
    }, [nodes, projectLoaded]);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        if (projectSaveTimerRef.current) clearTimeout(projectSaveTimerRef.current);
        projectSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo, creativeProjectState });
            projectSaveTimerRef.current = null;
        }, 300);
        return () => {
            if (projectSaveTimerRef.current) {
                clearTimeout(projectSaveTimerRef.current);
                projectSaveTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, creativeProjectState, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        toolbarImageSettingsOpenRef.current = toolbarImageSettingsOpen;
    }, [toolbarImageSettingsOpen]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    useEffect(() => subscribeCanvasPersistStatus(setSavePending), []);

    const saveCurrentProjectNow = useCallback(
        async (showToast = true) => {
            if (projectSaveTimerRef.current) {
                clearTimeout(projectSaveTimerRef.current);
                projectSaveTimerRef.current = null;
            }
            if (viewportSaveTimerRef.current) {
                clearTimeout(viewportSaveTimerRef.current);
                viewportSaveTimerRef.current = null;
            }
            if (!projectLoadedRef.current) return;
            const meta = projectMetaRef.current;
            updateProject(projectIdRef.current, {
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                chatSessions: meta.chatSessions,
                activeChatId: meta.activeChatId,
                backgroundMode: meta.backgroundMode,
                showImageInfo: meta.showImageInfo,
                viewport: viewportRef.current,
                creativeProjectState: creativeProjectStateRef.current,
            });
            await flushCanvasStore();
            if (showToast) message.success("画布已保存");
        },
        [message, updateProject],
    );

    useEffect(() => {
        const handlePageHide = () => void saveCurrentProjectNow(false);
        window.addEventListener("pagehide", handlePageHide);
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") handlePageHide();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("pagehide", handlePageHide);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [saveCurrentProjectNow]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
        toolbarNodeIdRef.current = toolbarNodeId;
        creativeProjectStateRef.current = creativeProjectState;
        projectMetaRef.current = { chatSessions, activeChatId, backgroundMode, showImageInfo };
        projectLoadedRef.current = projectLoaded;
        projectIdRef.current = projectId;
    }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate, toolbarNodeId, chatSessions, activeChatId, backgroundMode, showImageInfo, creativeProjectState, projectLoaded, projectId]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                viewportRef.current = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                setViewport(viewportRef.current);
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        return screenPointToCanvasWorld(containerRef.current, worldLayerRef.current, clientX, clientY, viewportRef.current);
    }, []);

    const getContainerSize = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return {
            width: rect?.width || size.width,
            height: rect?.height || size.height,
        };
    }, [size.height, size.width]);

    const applyViewport = useCallback((next: ViewportTransform | ((prev: ViewportTransform) => ViewportTransform)) => {
        setViewport((prev) => {
            const value = typeof next === "function" ? next(prev) : next;
            viewportRef.current = value;
            return value;
        });
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const isPointInRect = useCallback((clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">, padding = 0) => {
        return clientX >= rect.left - padding && clientX <= rect.right + padding && clientY >= rect.top - padding && clientY <= rect.bottom + padding;
    }, []);

    const isPointerInNodeToolbarZone = useCallback(
        (clientX: number, clientY: number) => {
            const nodeId = toolbarNodeIdRef.current;
            if (!nodeId) return false;
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (!node) return false;

            const currentViewport = viewportRef.current;
            const nodeRect = {
                left: currentViewport.x + node.position.x * currentViewport.k,
                top: currentViewport.y + node.position.y * currentViewport.k,
                right: currentViewport.x + (node.position.x + node.width) * currentViewport.k,
                bottom: currentViewport.y + (node.position.y + node.height) * currentViewport.k,
            };
            const toolbarRect = document.querySelector<HTMLElement>("[data-canvas-node-toolbar]")?.getBoundingClientRect();
            if (isPointInRect(clientX, clientY, nodeRect, 12)) return true;
            if (toolbarRect && isPointInRect(clientX, clientY, toolbarRect, 18)) return true;
            if (!toolbarRect) return false;
            const bridgeRect = {
                left: Math.min(nodeRect.left, toolbarRect.left),
                top: Math.min(nodeRect.top, toolbarRect.top),
                right: Math.max(nodeRect.right, toolbarRect.right),
                bottom: Math.max(nodeRect.bottom, toolbarRect.bottom),
            };
            return isPointInRect(clientX, clientY, bridgeRect, 10);
        },
        [isPointInRect],
    );

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || toolbarImageSettingsOpenRef.current) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            toolbarNodeIdRef.current = nodeId;
            setToolbarGroupRootId(null);
            setToolbarNodeId((current) => (current === nodeId ? current : nodeId));
        },
        [nodeImageSettingsOpen],
    );

    const closeToolbar = useCallback(() => {
        toolbarNodeIdRef.current = null;
        setToolbarNodeId(null);
    }, []);

    const hideNodeToolbar = useCallback(
        (delay = 360) => {
            if (toolbarImageSettingsOpenRef.current) return;
            if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
            const schedule = (nextDelay: number) => {
                toolbarHideTimerRef.current = setTimeout(() => {
                    if (toolbarImageSettingsOpenRef.current) return;
                    const point = lastPointerPointRef.current;
                    if (point && isPointerInNodeToolbarZone(point.clientX, point.clientY)) {
                        toolbarHideTimerRef.current = null;
                        schedule(180);
                        return;
                    }
                    toolbarNodeIdRef.current = null;
                    setToolbarNodeId(null);
                    toolbarHideTimerRef.current = null;
                }, nextDelay);
            };
            schedule(delay);
        },
        [isPointerInNodeToolbarZone],
    );

    const keepGroupToolbar = useCallback((rootId: string) => {
        if (nodeDraggingRef.current || groupToolbarMenuOpenRef.current) return;
        if (groupToolbarHideTimerRef.current) {
            clearTimeout(groupToolbarHideTimerRef.current);
            groupToolbarHideTimerRef.current = null;
        }
        setToolbarNodeId(null);
        setToolbarGroupRootId((current) => (current === rootId ? current : rootId));
    }, []);

    const closeGroupToolbar = useCallback(() => setToolbarGroupRootId(null), []);

    const hideGroupToolbar = useCallback(() => {
        if (groupToolbarMenuOpenRef.current) return;
        if (groupToolbarHideTimerRef.current) clearTimeout(groupToolbarHideTimerRef.current);
        groupToolbarHideTimerRef.current = setTimeout(() => {
            if (groupToolbarMenuOpenRef.current) return;
            setToolbarGroupRootId(null);
            groupToolbarHideTimerRef.current = null;
        }, 120);
    }, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId, toNodeId }]);
            }
            setContextMenu(null);
        },
        [message],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count) } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            const targetHandleSide: "left" | "right" = current.handleType === "source" ? "left" : "right";
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                .reverse()
                .forEach((node) => {
                    const handlePoint = getConnectionHandlePoint(node, targetHandleSide, scale);
                    const dx = world.x - handlePoint.x;
                    const dy = world.y - handlePoint.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsHandle ? 0 : hitsInside ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const finishConnectionDragRef = useRef(0);
    const finishConnectionDrag = useCallback(
        (clientX: number, clientY: number) => {
            const now = Date.now();
            if (now - finishConnectionDragRef.current < 40) return;
            finishConnectionDragRef.current = now;
            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (!currentConnection) return;

            const dropTarget = getConnectionDropTarget(clientX, clientY, currentConnection);
            if (dropTarget.nodeId) {
                connectNodes(currentConnection, dropTarget.nodeId);
            } else {
                setMouseWorld(screenToCanvas(clientX, clientY));
                setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(clientX, clientY) });
            }
            setConnecting(null);
        },
        [connectNodes, getConnectionDropTarget, screenToCanvas, setConnecting],
    );

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const visibleNodes = useMemo(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const bounds = getCanvasViewBounds(viewport, width, height);
        return nodes.filter((node) => !isHiddenBatchChild(node, nodeById, collapsingBatchIds) && isNodeInView(node, bounds));
    }, [collapsingBatchIds, nodeById, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const videoFrameNode = videoFrameNodeId ? nodeById.get(videoFrameNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.metadata?.isBatchRoot) map.set(node.id, (node.metadata.batchChildIds?.length || 0) + 1);
        });
        return map;
    }, [nodes]);
    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections]);

    const visibleConnections = useMemo(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const bounds = getCanvasViewBounds(viewport, width, height);
        return connections.filter((connection) => {
            const from = nodeById.get(connection.fromNodeId);
            const to = nodeById.get(connection.toNodeId);
            if (!from || !to || isHiddenBatchConnectionEndpoint(from, nodeById) || isHiddenBatchConnectionEndpoint(to, nodeById)) return false;
            if (selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)) return true;
            return isConnectionInView(from, to, bounds);
        });
    }, [connections, nodeById, relatedHighlight.connectionIds, selectedConnectionId, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);
    const resourceContextNodeId = dialogNodeId || activeNodeId;
    const canvasResourceReferences = useMemo(() => buildCanvasResourceReferences(nodes, connections, resourceContextNodeId), [connections, nodes, resourceContextNodeId]);
    const resourceReferenceByNodeId = useMemo(() => new Map(canvasResourceReferences.map((reference) => [reference.nodeId, reference])), [canvasResourceReferences]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);
    const nodeGroups = useMemo(() => listNodeGroups(nodes), [nodes]);
    const toolbarGroupBounds = toolbarGroupRootId ? nodeGroups.find((bounds) => bounds.rootId === toolbarGroupRootId) || null : null;
    const isGroupActive = useCallback(
        (bounds: (typeof nodeGroups)[number]) => bounds.memberIds.some((id) => selectedNodeIds.has(id)),
        [selectedNodeIds],
    );
    const packagedNodeIds = useMemo(() => {
        const ids = new Set<string>();
        nodeGroups.forEach((bounds) => {
            if (!isGroupSelected(bounds, selectedNodeIds)) return;
            bounds.memberIds.forEach((id) => ids.add(id));
        });
        return ids;
    }, [nodeGroups, selectedNodeIds]);
    const agentSnapshot = useMemo<CanvasAgentSnapshot>(
        () => ({ projectId, title: currentProject?.title || "未命名画布", nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport, creativeProjectState }),
        [connections, creativeProjectState, currentProject?.title, nodes, projectId, selectedNodeIds, viewport],
    );
    const addDirectorStageCaptures = useCallback(
        async (captures: DirectorStageCapture[]) => {
            if (!captures.length) return [];
            const images = await Promise.all(captures.map((capture) => uploadImage(capture.dataUrl)));
            const currentNodes = nodesRef.current;
            const center = getCanvasCenter();
            const maxRight = currentNodes.length ? Math.max(...currentNodes.map((node) => node.position.x + node.width)) : center.x - 720;
            const baseX = maxRight + 96;
            const baseY = center.y - 220;
            const width = 320;
            const height = 180;
            const gap = 34;
            const columns = Math.min(4, captures.length);
            const batchId = `preview-${Date.now()}-${nanoid(6)}`;
            const capturedNodes: CanvasNodeData[] = captures.map((capture, index) => ({
                id: `director-shot-${capture.shotId}-${nanoid(6)}`,
                type: CanvasNodeType.Image,
                title: `分镜预览 ${String(capture.slot).padStart(2, "0")} · ${capture.title}`,
                position: { x: baseX + (index % columns) * (width + gap), y: baseY + Math.floor(index / columns) * (height + 76) },
                width,
                height,
                metadata: {
                    ...imageMetadata(images[index]),
                    prompt: capture.prompt,
                    creativeArtifact: {
                        kind: "preview_grid",
                        version: 1,
                        status: "review",
                        ownerAgent: "分镜预览 Agent",
                        userConfirmed: false,
                        qualityGate: ["节奏密度可读", "镜头内容不过载", "空间与上下文连续", "平台审核风险可接受"],
                        updatedAt: new Date().toISOString(),
                    },
                    directorStage: { shotId: capture.shotId, slot: capture.slot, dramaticFunction: capture.title, source: "3d-director-stage", batchId },
                },
            }));
            const ids = capturedNodes.map((node) => node.id);
            const ops: CanvasAgentOp[] = [
                ...capturedNodes.map((node): CanvasAgentOp => ({
                    type: "add_node",
                    id: node.id,
                    nodeType: node.type,
                    title: node.title,
                    position: node.position,
                    width: node.width,
                    height: node.height,
                    metadata: node.metadata,
                })),
                { type: "select_nodes", ids },
            ];
            const apply = applyAgentOpsRef.current;
            if (!apply) throw new Error("画布事务尚未就绪");
            apply(ops);
            return ids;
        },
        [getCanvasCenter],
    );
    const executeDirectorStageAction = useCallback<DirectorStageActionHandler>(async (name, input) => {
        const stage = directorStageRef.current;
        if (!stage) throw new Error("3D 导演台尚未就绪");
        const result = await stage.execute(name, input);
        if (name !== "canvas_director_capture_shot" && name !== "canvas_director_capture_all") return result;
        const canvasSnapshot: CanvasAgentSnapshot = {
            projectId,
            title: currentProject?.title || "未命名画布",
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            selectedNodeIds: Array.from(selectedNodeIdsRef.current),
            viewport: viewportRef.current,
            creativeProjectState: creativeProjectStateRef.current,
        };
        return result && typeof result === "object" && !Array.isArray(result) ? { ...result, canvasSnapshot } : { result, canvasSnapshot };
    }, [currentProject?.title, projectId]);
    const applyAgentOps = useCallback(
        (ops?: CanvasAgentOp[]) => {
            const safeOps = Array.isArray(ops) ? ops.filter((op) => op?.type) : [];
            const before = { projectId, title: currentProject?.title || "未命名画布", nodes: nodesRef.current, connections: connectionsRef.current, selectedNodeIds: Array.from(selectedNodeIdsRef.current), viewport: viewportRef.current, creativeProjectState: creativeProjectStateRef.current };
            const generationOps = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation" && Boolean(op.nodeId));
            const next = applyCanvasAgentOps(before, safeOps.filter((op) => op.type !== "run_generation"));
            const explicitProjectState = creativeProjectStateFromOps(safeOps);
            const nextProjectState = reconcileCreativeProjectState(next.nodes, explicitProjectState || creativeProjectStateRef.current);
            next.creativeProjectState = nextProjectState;
            nodesRef.current = next.nodes;
            connectionsRef.current = next.connections;
            selectedNodeIdsRef.current = new Set(next.selectedNodeIds);
            viewportRef.current = next.viewport;
            creativeProjectStateRef.current = nextProjectState;
            setAgentUndoSnapshot(before);
            setNodes(next.nodes);
            setConnections(next.connections);
            setSelectedNodeIds(new Set(next.selectedNodeIds));
            setSelectedConnectionId(null);
            setViewport(next.viewport);
            setCreativeProjectState(nextProjectState);
            setContextMenu(null);
            if (generationOps.length) {
                queueMicrotask(() =>
                    generationOps.forEach((op) => {
                        const target = nodesRef.current.find((node) => node.id === op.nodeId);
                        const prompt = op.prompt?.trim() ? op.prompt : target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "";
                        void generateNodeRef.current?.(op.nodeId, op.mode || target?.metadata?.generationMode || "image", prompt);
                    }),
                );
            }
            return { ...next, projectId, title: currentProject?.title || "未命名画布" };
        },
        [currentProject?.title, projectId],
    );
    useLayoutEffect(() => {
        applyAgentOpsRef.current = applyAgentOps;
    }, [applyAgentOps]);
    const undoAgentOps = useCallback(() => {
        if (!agentUndoSnapshot) return null;
        nodesRef.current = agentUndoSnapshot.nodes;
        connectionsRef.current = agentUndoSnapshot.connections;
        selectedNodeIdsRef.current = new Set(agentUndoSnapshot.selectedNodeIds);
        viewportRef.current = agentUndoSnapshot.viewport;
        const restoredProjectState = reconcileCreativeProjectState(agentUndoSnapshot.nodes, agentUndoSnapshot.creativeProjectState);
        creativeProjectStateRef.current = restoredProjectState;
        setNodes(agentUndoSnapshot.nodes);
        setConnections(agentUndoSnapshot.connections);
        setSelectedNodeIds(new Set(agentUndoSnapshot.selectedNodeIds));
        setSelectedConnectionId(null);
        setViewport(agentUndoSnapshot.viewport);
        setCreativeProjectState(restoredProjectState);
        setContextMenu(null);
        setAgentUndoSnapshot(null);
        return { ...agentUndoSnapshot, projectId, title: currentProject?.title || "未命名画布", creativeProjectState: restoredProjectState };
    }, [agentUndoSnapshot, currentProject?.title, projectId]);
    const createNode = useCallback(
        (type: CanvasNodeType, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                      }
                    : undefined;
            const newNode = createCanvasNode(type, targetPosition, configMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            nodesRef.current.forEach((node) => {
                if (ids.has(node.id)) {
                    node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
                    node.metadata?.groupMemberIds?.forEach((memberId) => allIds.add(memberId));
                }
            });
            const { affectedNodeIds, affectedRunningIds } = cancelGenerationRequestsForNodeIds(allIds);
            setNodes((prev) => {
                const next = prev.filter((node) => !allIds.has(node.id));
                return next.map((node) => {
                    let nextNode = node;
                    const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                    if (node.metadata?.isBatchRoot && childIds && childIds.length !== node.metadata.batchChildIds?.length) {
                        const primaryImageId = childIds.includes(node.metadata.primaryImageId || "") ? node.metadata.primaryImageId : childIds[0];
                        const primaryNode = next.find((item) => item.id === primaryImageId);
                        nextNode = {
                            ...node,
                            metadata: {
                                ...node.metadata,
                                batchChildIds: childIds,
                                primaryImageId,
                                content: primaryNode?.metadata?.content || node.metadata.content,
                                naturalWidth: primaryNode?.metadata?.naturalWidth || node.metadata.naturalWidth,
                                naturalHeight: primaryNode?.metadata?.naturalHeight || node.metadata.naturalHeight,
                            },
                        };
                    } else if (node.metadata?.isGroupRoot) {
                        const groupMemberIds = node.metadata?.groupMemberIds?.filter((memberId) => !allIds.has(memberId));
                        if (groupMemberIds && groupMemberIds.length !== node.metadata?.groupMemberIds?.length) {
                            nextNode = {
                                ...node,
                                metadata: {
                                    ...node.metadata,
                                    groupMemberIds,
                                    isGroupRoot: groupMemberIds.length > 0,
                                },
                            };
                        }
                    } else if (node.metadata?.groupRootId && allIds.has(node.metadata.groupRootId)) {
                        const { groupRootId, ...rest } = node.metadata;
                        nextNode = { ...node, metadata: rest };
                    }
                    if (affectedNodeIds.has(nextNode.id) && nextNode.metadata?.status === NODE_STATUS_LOADING) {
                        return {
                            ...nextNode,
                            metadata: {
                                ...nextNode.metadata,
                                status: NODE_STATUS_IDLE,
                                errorDetails: undefined,
                                generationProgress: undefined,
                                generationStage: undefined,
                            },
                        };
                    }
                    return nextNode;
                });
            });
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setVideoFrameNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && (allIds.has(current) || affectedRunningIds.has(current)) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [cancelGenerationRequestsForNodeIds, chatSessions, cleanupCanvasFiles, projectId],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const disconnectReference = useCallback(
        (targetNodeId: string, sourceNodeId: string) => {
            const inputTargetId = getReferenceInputTargetNodeId(targetNodeId, nodesRef.current, connectionsRef.current);
            const connection = connectionsRef.current.find((item) => item.toNodeId === inputTargetId && item.fromNodeId === sourceNodeId);
            if (connection) deleteConnection(connection.id);
        },
        [deleteConnection],
    );

    const openConnectionMenu = useCallback((nodeId: string, handleType: "source" | "target") => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node) return;
        const menuWidth = 300;
        const gap = 28;
        const position =
            handleType === "source"
                ? { x: node.position.x + node.width + gap, y: node.position.y + node.height / 2 - 24 }
                : { x: node.position.x - menuWidth - gap, y: node.position.y + node.height / 2 - 24 };
        setPendingConnectionCreate({ connection: { nodeId, handleType }, position });
        setConnecting(null);
    }, [setConnecting]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        cancelAllGenerationRequests();
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setVideoFrameNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cancelAllGenerationRequests, cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: CanvasNodeData = {
            ...source,
            id,
            title: `${source.title} Copy`,
            position: { x: source.position.x + 36, y: source.position.y + 36 },
        };

        setNodes((prev) => [...prev, next]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, []);

    const pasteCopiedNodes = useCallback((anchor?: Position) => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = anchor || getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const fromNodeId = idMap.get(connection.fromNodeId);
            const toNodeId = idMap.get(connection.toNodeId);
            if (!fromNodeId || !toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...nextNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(nextNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

    const resetViewport = useCallback(() => {
        const { width, height } = getContainerSize();
        applyViewport({ x: width / 2, y: height / 2, k: 1 });
        setContextMenu(null);
    }, [applyViewport, getContainerSize]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            const { width, height } = getContainerSize();
            applyViewport((prev) => ({
                x: width / 2 - ((width / 2 - prev.x) / prev.k) * nextScale,
                y: height / 2 - ((height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [applyViewport, getContainerSize],
    );

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        creativeProjectStateRef.current = entry.creativeProjectState;
        setCreativeProjectState(entry.creativeProjectState);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(() => {
        const id = createProject(`卡藏画布 ${useCanvasStore.getState().projects.length + 1}`);
        router.push(`/canvas/${id}`);
    }, [createProject, router]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([projectId]);
        cleanupAssetImages();
        router.push("/canvas");
    }, [cleanupAssetImages, deleteProjects, projectId, router]);

    const closeAssistantPanel = useCallback(() => {
        if (!assistantMounted || assistantClosing) return;
        setAssistantCollapsed(true);
        setAssistantClosing(true);
    }, [assistantClosing, assistantMounted]);

    const closeCanvasSidebars = useCallback(() => {
        setAssetDrawerOpen(false);
        closeAssistantPanel();
    }, [closeAssistantPanel]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;
            closeCanvasSidebars();

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            setEditingNodeId(null);
            setNodeImageSettingsOpen(false);
        },
        [cancelPendingConnectionCreate, closeCanvasSidebars, screenToCanvas],
    );

    const startNodeDrag = useCallback((event: ReactMouseEvent | ReactPointerEvent, dragIds: Set<string>, selectedIds: Set<string>) => {
        const currentNodes = nodesRef.current;
        const initialSelectedNodes = currentNodes.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
        setSelectedNodeIds(selectedIds);
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes,
            initialSelectedNodeMap: new Map(initialSelectedNodes.map((node) => [node.id, { x: node.x, y: node.y }])),
        };
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, []);

    const handleGroupMouseDown = useCallback(
        (event: ReactMouseEvent, rootId: string) => {
            event.stopPropagation();
            setContextMenu(null);
            setHoveredNodeId(null);
            setSelectedConnectionId(null);

            const memberIds = collectGroupDragNodeIds(rootId, nodesRef.current);
            const nextSelected = new Set(memberIds);
            keepGroupToolbar(rootId);
            startNodeDrag(event, memberIds, nextSelected);
        },
        [keepGroupToolbar, startNodeDrag],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent | ReactPointerEvent, nodeId: string) => {
        if (nodeResizingRef.current) return;
        if ((event.target as HTMLElement).closest("[data-resize-handle]")) return;
        event.stopPropagation();
        setContextMenu(null);
        setHoveredNodeId(null);
        setSelectedConnectionId(null);

        const currentSelected = selectedNodeIdsRef.current;
        const currentNodes = nodesRef.current;
        let nextSelected = new Set(currentSelected);

        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) {
                nextSelected.delete(nodeId);
            } else {
                nextSelected.add(nodeId);
            }
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }

        const dragIds = collectDragNodeIds(nextSelected, currentNodes, false);
        startNodeDrag(event, dragIds, nextSelected);
    }, [startNodeDrag]);

    const groupSelectedNodes = useCallback(() => {
        const ids = Array.from(selectedNodeIdsRef.current);
        const selectedNodes = nodesRef.current.filter((node) => ids.includes(node.id));
        if (!canGroupNodes(selectedNodes)) {
            message.warning("请选择至少两个未分组的节点");
            return;
        }
        setNodes((prev) => createGroupPatch(prev, ids));
        setSelectedNodeIds(new Set(ids));
    }, [message]);

    const ungroupSelectedNodes = useCallback(() => {
        const ids = Array.from(selectedNodeIdsRef.current);
        const rootIds = new Set<string>();
        ids.forEach((id) => {
            const node = nodesRef.current.find((item) => item.id === id);
            if (!node) return;
            const rootId = getGroupRootId(node);
            if (rootId) rootIds.add(rootId);
        });
        if (!rootIds.size) {
            message.warning("当前选择里没有可拆分的组合");
            return;
        }
        setNodes((prev) => {
            let next = prev;
            rootIds.forEach((rootId) => {
                next = ungroupPatch(next, rootId);
            });
            return next;
        });
    }, [message]);

    const setGroupColor = useCallback((rootId: string, color: string) => {
        setNodes((prev) => withGroupColor(prev, rootId, color));
    }, []);

    const setGroupName = useCallback((rootId: string, name: string) => {
        setNodes((prev) => withGroupName(prev, rootId, name));
    }, []);

    const arrangeGroupLayout = useCallback((rootId: string) => {
        setNodes((prev) => arrangeGroupLayoutPatch(prev, rootId));
    }, []);

    const ungroupGroupByRoot = useCallback((rootId: string) => {
        const root = nodesRef.current.find((node) => node.id === rootId);
        const memberIds = root ? getGroupNodeIds(root) : [rootId];
        setNodes((prev) => ungroupPatch(prev, rootId));
        setSelectedNodeIds((prev) => {
            const next = new Set(prev);
            memberIds.forEach((id) => next.delete(id));
            return next;
        });
        closeGroupToolbar();
    }, [closeGroupToolbar]);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodeMap;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            setNodes((prev) =>
                prev.map((node) => {
                    const initial = initialPositions.get(node.id);
                    if (!initial) return node;
                    return { ...node, position: { x: initial.x + dx, y: initial.y + dy } };
                }),
            );
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = [];
        dragRef.current.initialSelectedNodeMap = new Map();
        if (wasClick && clickedNodeId) {
            keepNodeToolbar(clickedNodeId);
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            if (clickedNode?.type === CanvasNodeType.Text) {
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else {
                setDialogNodeId(clickedNodeId);
            }
        }
    }, [keepNodeToolbar]);

    const applyNodeDragMove = useCallback((clientX: number, clientY: number) => {
        if (!dragRef.current.isDraggingNode) return;
        if (nodeResizingRef.current) return;

        const currentViewport = viewportRef.current;
        const dx = (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodeMap;
        if (Math.abs(clientX - dragRef.current.startX) > 3 || Math.abs(clientY - dragRef.current.startY) > 3) {
            dragRef.current.hasMoved = true;
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            setNodes((prev) =>
                prev.map((node) => {
                    const initial = initialPositions.get(node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                }),
            );
            rafRef.current = null;
        });
    }, []);

    const trackConnectionPointer = useCallback(
        (clientX: number, clientY: number) => {
            if (!connectingParamsRef.current || pendingConnectionCreateRef.current) return;
            const dropTarget = getConnectionDropTarget(clientX, clientY, connectingParamsRef.current);
            connectionTargetNodeIdRef.current = dropTarget.nodeId;
            setConnectionTargetNodeId(dropTarget.nodeId);
            setMouseWorld(screenToCanvas(clientX, clientY));
        },
        [getConnectionDropTarget, screenToCanvas],
    );

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            lastPointerPointRef.current = { clientX: event.clientX, clientY: event.clientY };
            if (dragRef.current.isDraggingNode) {
                applyNodeDragMove(event.clientX, event.clientY);
                return;
            }

            trackConnectionPointer(event.clientX, event.clientY);
        },
        [applyNodeDragMove, trackConnectionPointer],
    );

    const handleCanvasPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [screenToCanvas],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            lastPointerPointRef.current = { clientX: event.clientX, clientY: event.clientY };
            if (dragRef.current.isDraggingNode) {
                applyNodeDragMove(event.clientX, event.clientY);
                return;
            }
            trackConnectionPointer(event.clientX, event.clientY);
            handleCanvasPointerMove(event as unknown as ReactPointerEvent<HTMLDivElement>);
        },
        [applyNodeDragMove, handleCanvasPointerMove, trackConnectionPointer],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            lastPointerPointRef.current = { clientX: event.clientX, clientY: event.clientY };
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            finishConnectionDrag(event.clientX, event.clientY);
        },
        [finishConnectionDrag, finishNodeDrag],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => {
            lastPointerPointRef.current = { clientX: event.clientX, clientY: event.clientY };
            finishNodeDrag(event.clientX, event.clientY);
            finishConnectionDrag(event.clientX, event.clientY);
        };
        const cancelNodeDrag = () => finishNodeDrag();
        const switchNodeDragToPinch = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("canvas-touch-pinch-start", switchNodeDragToPinch);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("canvas-touch-pinch-start", switchNodeDragToPinch);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishConnectionDrag, finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file, { source: "upload" });
        const size = fitNodeSize(image.width, image.height);
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: imageMetadata(image),
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video", { source: "upload" });
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio", { source: "upload" });
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
    }, []);

    const createTextNodeFromClipboard = useCallback(
        (text: string, position?: Position) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, position || getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const pasteSystemClipboard = useCallback(async (anchor?: Position) => {
        if (!navigator.clipboard) return;

        const position = anchor || getCanvasCenter();
        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, position);
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text, position)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setVideoFrameNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, deleteConnection, deleteNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, undoCanvas]);

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting],
    );

    const handleNodeResizeActiveChange = useCallback((active: boolean) => {
        nodeResizingRef.current = active;
        if (!active) return;
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = [];
        dragRef.current.initialSelectedNodeMap = new Map();
        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
    }, []);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => {
            const node = prev.find((item) => item.id === nodeId);
            if (!node) return prev;
            const nextPosition = position || node.position;
            if (nodeGeometryMatches(node, width, height, nextPosition)) return prev;
            return prev.map((item) => (item.id === nodeId ? { ...item, width, height, position: nextPosition } : item));
        });
    }, []);

    const handleSelectedNodeWheelResize = useCallback((nodeId: string, deltaY: number) => {
        if (!selectedNodeIdsRef.current.has(nodeId)) return false;
        const requestedFactor = Math.pow(1.1, -deltaY / 100);
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const minFactor = Math.max(WHEEL_RESIZE_MIN_WIDTH / node.width, WHEEL_RESIZE_MIN_HEIGHT / node.height);
                const maxFactor = Math.min(WHEEL_RESIZE_MAX_EDGE / node.width, WHEEL_RESIZE_MAX_EDGE / node.height);
                const factor = Math.min(maxFactor, Math.max(minFactor, requestedFactor));
                if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.0001) return node;
                const width = node.width * factor;
                const height = node.height * factor;
                return {
                    ...node,
                    width,
                    height,
                    position: {
                        x: node.position.x + (node.width - width) / 2,
                        y: node.position.y + (node.height - height) / 2,
                    },
                };
            }),
        );
        return true;
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...node.metadata,
                              content: child.metadata?.content,
                              primaryImageId: child.id,
                              naturalWidth: child.metadata?.naturalWidth,
                              naturalHeight: child.metadata?.naturalHeight,
                              freeResize: child.metadata?.freeResize,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const metadata = { ...node.metadata, prompt };
                if (node.type === CanvasNodeType.Video) {
                    metadata.videoReferenceAssets = toVideoReferenceAssets(resolveActiveVideoReferences(prompt, buildNodeMentionReferences(node, prev, connectionsRef.current)));
                }
                return { ...node, metadata };
            }),
        );
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => {
            const node = prev.find((item) => item.id === nodeId);
            if (!node) return prev;
            const next = applyNodeConfigPatch(node, patch);
            if (nodeGeometryMatches(node, next.width, next.height, next.position) && metadataShallowEqual(node.metadata, next.metadata)) return prev;
            return prev.map((item) => (item.id === nodeId ? next : item));
        });
    }, []);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error("没有可保存的文本");
                addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success("已加入我的资产");
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
                addAsset({ kind: "video", title: node.metadata?.prompt?.slice(0, 24) || "画布视频", coverUrl: "", tags: [], source: "Canvas", data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" }, metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt } });
                message.success("已加入我的资产");
                return;
            }
            if (!node.metadata?.content) return message.error("没有可保存的图片");
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success("已加入我的资产");
        },
        [addAsset, message],
    );

    const getPromptHubSession = usePromptHubStore((state) => state.getSession);

    const saveNodeToPromptHub = useCallback(
        async (node: CanvasNodeData) => {
            if (!canSaveImageNodeToPromptHub(node)) {
                message.warning("当前节点没有可保存的图片");
                return;
            }
            let session = await getPromptHubSession();
            if (!session) {
                message.warning("请先在设置里连接 Prompt Hub 账号");
                openConfigDialog(false);
                return;
            }
            const prompt = resolveImageNodePrompt(node, nodes, connections);
            const hide = message.loading("正在保存到 Prompt Hub…", 0);
            try {
                const imageBase64 = await imageNodeToBase64(node);
                if (!prompt && !imageBase64) {
                    throw new Error("没有可保存的提示词或图片");
                }
                const result = await savePromptHubQuickCard(
                    {
                        prompt,
                        title: prompt.slice(0, 48) || node.title || "画布图片",
                        imageBase64,
                        sourceUrl: `infinite-canvas://node/${node.id}`,
                        tags: ["#卡藏画布"],
                        publishToCommunity: false,
                    },
                    session,
                    { apiBase: usePromptHubStore.getState().apiBase },
                );
                message.success(result?.data?.message || "已保存到 Prompt Hub 卡片库");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "保存失败");
            } finally {
                hide();
            }
        },
        [connections, getPromptHubSession, message, nodes, openConfigDialog],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(
                    CanvasNodeType.Text,
                    { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY },
                    { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 },
                ),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
                { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id },
            ]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message],
    );

    const createImageFromVideoFrame = useCallback(
        async (node: CanvasNodeData, dataUrl: string) => {
            try {
                const image = await uploadImage(dataUrl);
                const gap = 96;
                const size = fitNodeSize(image.width, image.height);
                const childId = nanoid();
                const child: CanvasNodeData = {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: `${node.title || "视频"} 截帧`,
                    position: { x: node.position.x + node.width + gap, y: node.position.y + node.height / 2 - size.height / 2 },
                    width: size.width,
                    height: size.height,
                    metadata: {
                        ...imageMetadata(image),
                        prompt: node.metadata?.prompt,
                    },
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
                setSelectedNodeIds(new Set([childId]));
                setSelectedConnectionId(null);
                setDialogNodeId(childId);
                setVideoFrameNodeId(null);
                setContextMenu(null);
                message.success("已生成图片节点");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "生成图片节点失败");
            }
        },
        [message],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Cropped Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
        setCropNodeId(null);
    }, []);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            setSplitNodeId(null);
            const pieces = await splitDataUrl(node.metadata.content, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const childNodes = await Promise.all(
                pieces.map(async (piece) => {
                    const image = await uploadImage(piece.dataUrl);
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                }),
            );
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已切分为 ${childNodes.length} 个子节点`);
        },
        [message],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
            const childId = nanoid();
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            setMaskEditNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || "局部编辑结果",
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [source], { id: `${node.id}-mask`, name: "mask.png", type: "image/png", dataUrl: payload.maskDataUrl }, { signal: controller.signal }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, isGenerationRequestActive, message, openConfigDialog, startGenerationRequest],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        setUpscaleNodeId(null);
        const upscaled = await upscaleDataUrl(node.metadata.content, params);
        const image = await uploadImage(upscaled);
        const size = fitNodeSize(image.width, image.height);
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Upscaled Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width: size.width,
            height: size.height,
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
    }, []);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }], undefined, { signal: controller.signal }).then(
                    (items) => items[0],
                );
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, openConfigDialog, startGenerationRequest],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleVideoPersisted = useCallback((nodeId: string, file: UploadedFile) => {
        setNodes((prev) =>
            prev.map((node) =>
                node.id === nodeId
                    ? (() => {
                          const media = videoNodeMedia(file, undefined, {
                              width: node.metadata?.naturalWidth || node.width,
                              height: node.metadata?.naturalHeight || node.height,
                          });
                          return {
                              ...node,
                              width: media.size.width,
                              height: media.size.height,
                              position: {
                                  x: node.position.x + node.width / 2 - media.size.width / 2,
                                  y: node.position.y + node.height / 2 - media.size.height / 2,
                              },
                              metadata: {
                                  ...node.metadata,
                                  ...media.metadata,
                              },
                          };
                      })()
                    : node,
            ),
        );
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file))) return;

            if (target?.nodeId) {
                if (isAudioFile(file)) {
                    const audio = await uploadMediaFile(file, "audio", { source: "upload" });
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? { ...node, type: CanvasNodeType.Audio, title: file.name, position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined } } : node)));
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video", { source: "upload" });
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? { ...node, type: CanvasNodeType.Video, title: file.name, position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined } } : node)));
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                const image = await uploadImage(file, { source: "upload" });
                const size = fitNodeSize(image.width, image.height);
                setNodes((prev) =>
                    syncVideoReferenceAssetsForNodes(
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Image,
                                      title: file.name,
                                      width: size.width,
                                      height: size.height,
                                      metadata: {
                                          ...node.metadata,
                                          ...imageMetadata(image),
                                          errorDetails: undefined,
                                          freeResize: false,
                                          isBatchRoot: undefined,
                                          batchRootId: undefined,
                                          batchChildIds: undefined,
                                          batchUsesReferenceImages: undefined,
                                          generationType: undefined,
                                          model: undefined,
                                          size: undefined,
                                          quality: undefined,
                                          count: undefined,
                                          references: undefined,
                                          primaryImageId: undefined,
                                          imageBatchExpanded: undefined,
                                      },
                                  }
                                : node,
                        ),
                        connectionsRef.current,
                        target.nodeId,
                    ),
                );
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void (isAudioFile(file) ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const droppedAsset = parseAssetDragPayload(event.dataTransfer.getData(CANVAS_ASSET_DRAG_TYPE));
            if (droppedAsset) {
                const position = screenToCanvas(event.clientX, event.clientY);
                assetInsertRef.current?.(droppedAsset, position);
                return;
            }

            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item));
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void (isAudioFile(file) ? createAudioFileNode(file, pos) : file.type.startsWith("video/") ? createVideoFileNode(file, pos) : createImageFileNode(file, pos));
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            if ((event.target as HTMLElement).closest("[data-node-id]")) return;
            event.preventDefault();
            event.stopPropagation();
            const world = screenToCanvas(event.clientX, event.clientY);
            if (!selectedNodeIdsRef.current.size) {
                setSelectedNodeIds(new Set());
            }
            setSelectedConnectionId(null);
            setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY, worldX: world.x, worldY: world.y });
        },
        [screenToCanvas],
    );

    const copyNodeToClipboard = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node) return;
        clipboardRef.current = {
            nodes: [{ ...node, position: { ...node.position }, metadata: node.metadata ? { ...node.metadata } : undefined }],
            connections: [],
        };
    }, []);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const phModelId = parsePromptHubModelId(generationConfig.model);
            const promptHubState = usePromptHubStore.getState();
            const promptHubModel = phModelId ? promptHubState.imageModels.find((model) => model.id === phModelId) : null;
            const promptHubCountRange = promptHubModel ? promptHubImageCountRange(promptHubModel) : null;
            const promptHubMaxReferences = promptHubModel ? promptHubImageMaxReferences(promptHubModel) : null;
            const promptHubSession = phModelId ? await promptHubState.getSession() : null;
            const usePromptHubGen = !!promptHubSession && !!phModelId;
            if (!usePromptHubGen && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            setRunningNodeId(nodeId);
            const runController = startGenerationRequest(nodeId, nodeId, nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt),
            );
            const effectivePrompt = generationContext.prompt.trim();
            if (runController.signal.aborted) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            const statusPrompt = sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: statusPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                if (mode === "image") {
                    const imageRunStartedAt = performance.now();
                    const successfulUploads: UploadedImage[] = [];
                    const requestedCount = getGenerationCount(generationConfig.count);
                    const count = promptHubCountRange
                        ? Math.max(promptHubCountRange.min, Math.min(promptHubCountRange.max, requestedCount))
                        : requestedCount;
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
                    const selfReference =
                        isImageNode && sourceNode?.metadata?.content
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = generationContext.referenceImages.length ? generationContext.referenceImages : selfReference;
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const useHubSidecarLayout =
                        count > 1 &&
                        ((!isConfigNode && sourceNode?.type === CanvasNodeType.Text) ||
                            (isImageNode && Boolean(sourceNode?.metadata?.content) && !isEmptyImageNode));
                    const useSidecarSibling = count > 1 && isImageNode && Boolean(sourceNode?.metadata?.content) && !isEmptyImageNode;
                    const sidecarPlan = useHubSidecarLayout
                        ? useSidecarSibling
                            ? buildPromptHubSiblingImageNodes({
                                  anchor: sourceNode!,
                                  prompt: effectivePrompt,
                                  count,
                                  generationMetadata,
                              })
                            : buildPromptHubImageNodes({
                                  anchor: resolvePromptHubAnchor(sourceNode!, sourceNode!.position, NODE_DEFAULT_SIZE[CanvasNodeType.Text]),
                                  prompt: effectivePrompt,
                                  count,
                                  generationMetadata,
                              })
                        : null;
                    const rootId = isEmptyImageNode ? nodeId : nanoid();
                    const childIds = count > 1 && !useHubSidecarLayout ? Array.from({ length: count - 1 }, () => nanoid()) : [];
                    pendingChildIds = useHubSidecarLayout ? [nodeId] : isEmptyImageNode ? [nodeId, ...childIds] : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
                        },
                        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
                        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            isBatchRoot: count > 1,
                            batchChildIds: count > 1 ? childIds : undefined,
                            batchUsesReferenceImages: referenceImages.length > 0,
                            ...generationMetadata,
                            imageBatchExpanded: count > 1 ? true : undefined,
                            ...loadingProgressMetadata(4, "准备生成"),
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
                        },
                        width: imageConfig.width,
                        height: imageConfig.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, batchRootId: count > 1 ? rootId : undefined, ...generationMetadata, ...loadingProgressMetadata(4, "准备生成") },
                    }));
                    const batchConnections = sidecarPlan
                        ? buildPromptHubConnections(nodeId, sidecarPlan.ids)
                        : useHubSidecarLayout
                          ? []
                          : [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? {
                                          ...node,
                                          metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined },
                                      }
                                    : isEmptyImageNode
                                      ? useHubSidecarLayout
                                          ? {
                                                ...node,
                                                metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined, ...loadingProgressMetadata(4, "准备生成") },
                                            }
                                          : {
                                                ...node,
                                                position: rootNode.position,
                                                width: rootNode.width,
                                                height: rootNode.height,
                                                title: rootNode.title,
                                                metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                            }
                                      : isImageNode
                                        ? {
                                              ...node,
                                              metadata: {
                                                  ...node.metadata,
                                                  status: useHubSidecarLayout ? NODE_STATUS_LOADING : NODE_STATUS_SUCCESS,
                                                  errorDetails: undefined,
                                                  ...(useHubSidecarLayout ? loadingProgressMetadata(4, "准备生成") : {}),
                                              },
                                          }
                                        : useHubSidecarLayout
                                          ? {
                                                ...node,
                                                metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined, ...loadingProgressMetadata(4, "准备生成") },
                                            }
                                          : {
                                                ...node,
                                                type: CanvasNodeType.Text,
                                                title: prompt.slice(0, 32) || "Prompt",
                                                width: parentConfig.width,
                                                height: parentConfig.height,
                                                metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                            }
                                : node,
                        ),
                        ...(sidecarPlan ? sidecarPlan.nodes : useHubSidecarLayout || isEmptyImageNode ? [] : [rootNode]),
                        ...(sidecarPlan || useHubSidecarLayout ? [] : childNodes),
                    ]);
                    if (batchConnections.length) setConnections((prev) => [...prev, ...batchConnections]);
                    setSelectedNodeIds(new Set([nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const controller = runController;
                    const progressNodeIds = sidecarPlan ? sidecarPlan.ids : useHubSidecarLayout ? [nodeId] : count > 1 ? [rootId, ...childIds] : [rootId];
                    progressNodeIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, nodeId, controller));
                    let hasSuccess = false;
                    let hasFailure = false;
                    let stopProgressTicker: (() => void) | null = null;
                    const updateProgressNodes = (progress: number, stage: string) => {
                        setNodes((prev) =>
                            prev.map((node) =>
                                progressNodeIds.includes(node.id) && node.metadata?.status === NODE_STATUS_LOADING
                                    ? { ...node, metadata: { ...node.metadata, ...loadingProgressMetadata(progress, stage) } }
                                    : node,
                            ),
                        );
                    };
                    try {
                        updateProgressNodes(8, usePromptHubGen ? (referenceImages.length ? "准备参考图" : "准备提交任务") : count > 1 ? "请求生成" : "生成中");
                        if (!usePromptHubGen) {
                            stopProgressTicker = startGenerationProgressTicker(updateProgressNodes, { start: 10, max: 82, stage: count > 1 ? "批量生成" : "生成中" });
                        }
                        const phStore = usePromptHubStore.getState();
                        const items = usePromptHubGen && promptHubSession && phModelId
                            ? await requestPromptHubCanvasImages({
                                  session: promptHubSession,
                                  apiBase: phStore.apiBase,
                                  prompt: effectivePrompt,
                                  count,
                                  model: phModelId,
                                  resolution: mapPromptHubResolution(generationConfig),
                                  size: generationConfig.size,
                                  referenceImages: referenceImages.length ? referenceImages : undefined,
                                  maxReferences: promptHubMaxReferences,
                                  signal: controller.signal,
                                  onStage: ({ progress, stage }) => updateProgressNodes(progress, stage),
                              })
                            : referenceImages.length
                              ? await requestEdit({ ...generationConfig, count: String(count) }, effectivePrompt, referenceImages, undefined, { signal: controller.signal })
                              : await requestGeneration({ ...generationConfig, count: String(count) }, effectivePrompt, { signal: controller.signal });
                        if (usePromptHubGen) void phStore.refreshGenerationAccount();
                        stopProgressTicker?.();
                        stopProgressTicker = null;
                        if (!isGenerationRequestActive(nodeId, controller)) return;
                        if (!items.length) throw new Error("接口没有返回图片");

                        const usePromptTextHub = items.length > 1 && !isConfigNode && sourceNode?.type === CanvasNodeType.Text;
                        const usePromptSiblingHub = items.length > 1 && isImageNode && Boolean(sourceNode?.metadata?.content);

                        if (usePromptTextHub || usePromptSiblingHub) {
                            const anchorNode = nodesRef.current.find((node) => node.id === nodeId) || sourceNode!;
                            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                            let hubPlan =
                                sidecarPlan ||
                                (usePromptSiblingHub
                                    ? buildPromptHubSiblingImageNodes({
                                          anchor: anchorNode,
                                          prompt: effectivePrompt,
                                          count: items.length,
                                          generationMetadata,
                                      })
                                    : buildPromptHubImageNodes({
                                          anchor: resolvePromptHubAnchor(anchorNode, anchorNode.position, textSpec),
                                          prompt: effectivePrompt,
                                          count: items.length,
                                          generationMetadata,
                                      }));
                            if (items.length > hubPlan.ids.length) {
                                const extraPlan = usePromptSiblingHub
                                    ? buildPromptHubSiblingImageNodes({
                                          anchor: anchorNode,
                                          prompt: effectivePrompt,
                                          count: items.length,
                                          generationMetadata,
                                          ids: [...hubPlan.ids, ...Array.from({ length: items.length - hubPlan.ids.length }, () => nanoid())],
                                      })
                                    : buildPromptHubImageNodes({
                                          anchor: resolvePromptHubAnchor(anchorNode, anchorNode.position, textSpec),
                                          prompt: effectivePrompt,
                                          count: items.length,
                                          generationMetadata,
                                          ids: [...hubPlan.ids, ...Array.from({ length: items.length - hubPlan.ids.length }, () => nanoid())],
                                      });
                                hubPlan = {
                                    nodes: [
                                        ...hubPlan.nodes,
                                        ...extraPlan.nodes.filter((node) => !hubPlan!.ids.includes(node.id)),
                                    ],
                                    ids: extraPlan.ids,
                                };
                            }
                            const hubConnections = buildPromptHubConnections(nodeId, hubPlan.ids);
                            hubPlan.ids.forEach((targetId) => startGenerationRequest(targetId, nodeId, nodeId, controller));
                            if (!isGenerationRequestActive(nodeId, controller)) return;

                            setNodes((prev) => {
                                const next = prev.map((node) => {
                                    if (node.id !== nodeId) return node;
                                    if (usePromptSiblingHub) {
                                        return { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_SUCCESS, errorDetails: undefined } };
                                    }
                                    return buildPromptTextNodePatch(node, effectivePrompt, textSpec);
                                });
                                const existingIds = new Set(next.map((node) => node.id));
                                return [...next, ...hubPlan.nodes.filter((node) => !existingIds.has(node.id))];
                            });
                            if (!sidecarPlan) setConnections((prev) => [...prev, ...hubConnections]);
                            if (items.length > 1) message.success(`接口返回 ${items.length} 张图片，已自动展开`);

                            for (let index = 0; index < items.length; index += 1) {
                                const targetId = hubPlan.ids[index];
                                const item = items[index];
                                if (!targetId || !item) continue;
                                const saveProgress = Math.round(((index + 0.5) / items.length) * 100);
                                setNodes((prev) =>
                                    prev.map((node) =>
                                        node.id === targetId
                                            ? { ...node, metadata: { ...node.metadata, ...loadingProgressMetadata(saveProgress, `保存 ${index + 1}/${items.length}`) } }
                                            : node,
                                    ),
                                );
                                try {
                                    const uploaded = await uploadImage(item.dataUrl);
                                    if (!isGenerationRequestActive(targetId, controller)) return;
                                    successfulUploads.push(uploaded);
                                    setNodes((prev) => prev.map((node) => (node.id === targetId ? applyUploadedImageToNode(node, uploaded) : node)));
                                    hasSuccess = true;
                                } catch (error) {
                                    if (isGenerationCanceled(error)) continue;
                                    hasFailure = true;
                                    const errorDetails = error instanceof Error ? error.message : "生成失败";
                                    setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                } finally {
                                    finishGenerationRequest(targetId, controller);
                                }
                            }
                            for (let index = items.length; index < hubPlan.ids.length; index += 1) {
                                const targetId = hubPlan.ids[index];
                                if (!targetId) continue;
                                hasFailure = true;
                                setNodes((prev) =>
                                    prev.map((node) =>
                                        node.id === targetId
                                            ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "未返回图片" } }
                                            : node,
                                    ),
                                );
                                finishGenerationRequest(targetId, controller);
                            }

                            if (controller.signal.aborted) {
                                setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                                return;
                            }
                            if (hasFailure) {
                                const failureSummary = pickGenerationFailureDetails(nodesRef.current, hubPlan.ids);
                                message.error(hasSuccess ? "部分图片生成失败" : failureSummary);
                            }
                            recordCanvasImageGeneration({ prompt: effectivePrompt, config: generationConfig, references: referenceImages, images: successfulUploads, startedAt: imageRunStartedAt });
                            finishGenerationRequest(nodeId, controller);
                            setNodes((prev) => {
                                const failureDetails = pickGenerationFailureDetails(prev, hubPlan.ids);
                                return prev.map((node) =>
                                    node.id === nodeId
                                        ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : failureDetails } }
                                        : node,
                                );
                            });
                            return;
                        }

                        let assignChildIds = count > 1 ? [...childIds] : [];
                        let assignRootAsBatch = count > 1;
                        let newChildIds: string[] = [];

                        if (items.length > (assignRootAsBatch ? assignChildIds.length + 1 : 1)) {
                            if (!assignRootAsBatch) {
                                assignRootAsBatch = true;
                                assignChildIds = items.slice(1).map(() => nanoid());
                                newChildIds = assignChildIds;
                            } else {
                                const missing = items.length - (assignChildIds.length + 1);
                                newChildIds = Array.from({ length: missing }, () => nanoid());
                                assignChildIds = [...assignChildIds, ...newChildIds];
                            }
                            const rootSnapshot = nodesRef.current.find((node) => node.id === rootId);
                            if (rootSnapshot && newChildIds.length) {
                                const batchMetadata = { prompt: effectivePrompt, status: NODE_STATUS_LOADING, batchRootId: rootId, ...generationMetadata };
                                const startIndex = childIds.length;
                                const extraNodes = newChildIds.map((id, offset) => createBatchChildNode(rootSnapshot, startIndex + offset, effectivePrompt, batchMetadata, id));
                                setNodes((prev) => {
                                    const next = prev.map((node) =>
                                        node.id === rootId
                                            ? {
                                                  ...node,
                                                  metadata: {
                                                      ...node.metadata,
                                                      isBatchRoot: true,
                                                      batchChildIds: assignChildIds,
                                                      imageBatchExpanded: true,
                                                      primaryImageId: node.metadata?.primaryImageId || rootId,
                                                  },
                                              }
                                            : node,
                                    );
                                    return [...next, ...extraNodes];
                                });
                                setConnections((prev) => [...prev, ...createBatchConnections(rootId, newChildIds)]);
                                newChildIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, nodeId, controller));
                            }
                            if (items.length > 1 && count === 1) {
                                message.success(`接口返回 ${items.length} 张图片，已自动展开`);
                            }
                        }

                        const assignTargetIds = assignRootAsBatch ? [rootId, ...assignChildIds] : [rootId];
                        const slotCount = Math.max(assignTargetIds.length, items.length);

                        for (let index = 0; index < slotCount; index += 1) {
                            const targetId = assignTargetIds[index];
                            const item = items[index];
                            const saveProgress = Math.round(((index + (item ? 0.5 : 1)) / Math.max(items.length, 1)) * 100);
                            if (targetId) {
                                setNodes((prev) =>
                                    prev.map((node) =>
                                        node.id === targetId
                                            ? {
                                                  ...node,
                                                  metadata: {
                                                      ...node.metadata,
                                                      ...loadingProgressMetadata(saveProgress, item ? `保存 ${index + 1}/${items.length}` : "等待结果"),
                                                  },
                                              }
                                            : node,
                                    ),
                                );
                            }
                            if (!item || !targetId) {
                                if (targetId) {
                                    hasFailure = true;
                                    setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "未返回图片" } } : node)));
                                    finishGenerationRequest(targetId, controller);
                                }
                                continue;
                            }
                            try {
                                const uploaded = await uploadImage(item.dataUrl);
                                if (!isGenerationRequestActive(targetId, controller)) return;
                                successfulUploads.push(uploaded);
                                setNodes((prev) =>
                                    prev.map((node) => {
                                        if (node.id !== targetId) return node;
                                        const updated = applyUploadedImageToNode(node, uploaded);
                                        if (!assignRootAsBatch || node.id !== rootId) return updated;
                                        return {
                                            ...updated,
                                            metadata: {
                                                ...updated.metadata,
                                                isBatchRoot: true,
                                                batchChildIds: assignChildIds,
                                                primaryImageId: rootId,
                                                imageBatchExpanded: true,
                                            },
                                        };
                                    }),
                                );
                                hasSuccess = true;
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                            } catch (error) {
                                if (isGenerationCanceled(error)) continue;
                                hasFailure = true;
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                            } finally {
                                finishGenerationRequest(targetId, controller);
                            }
                        }
                    } catch (error) {
                        if (!isGenerationCanceled(error)) {
                            const errorDetails = error instanceof Error ? error.message : "生成失败";
                            hasFailure = true;
                            setNodes((prev) =>
                                prev.map((node) =>
                                    progressNodeIds.includes(node.id) ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node,
                                ),
                            );
                        }
                    } finally {
                        stopProgressTicker?.();
                        if (count > 1) finishGenerationRequest(rootId, controller);
                    }
                    if (controller.signal.aborted) {
                        setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    if (hasFailure) {
                        const failureSummary = pickGenerationFailureDetails(nodesRef.current, progressNodeIds);
                        message.error(hasSuccess ? "部分图片生成失败" : failureSummary);
                    }
                    recordCanvasImageGeneration({ prompt: effectivePrompt, config: generationConfig, references: referenceImages, images: successfulUploads, startedAt: imageRunStartedAt });
                    setNodes((prev) => {
                        const failureDetails = pickGenerationFailureDetails(prev, progressNodeIds);
                        return prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : failureDetails } }
                                : node.id === nodeId && isEmptyImageNode
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : failureDetails } }
                                  : node.id === rootId && !hasSuccess
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: failureDetails } }
                                    : node,
                        );
                    });
                    return;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
                    const videoId = isEmptyVideoNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoReferenceAssets = toVideoReferenceAssets(
                        resolveActiveVideoReferences(prompt, buildNodeMentionReferences(sourceNode || { id: nodeId, type: CanvasNodeType.Video, title: "", position: parent, width: spec.width, height: spec.height }, nodesRef.current, connectionsRef.current)),
                    );
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: isEmptyVideoNode ? sourceNode.width : spec.width,
                        height: isEmptyVideoNode ? sourceNode.height : spec.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            model: generationConfig.model,
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            references: generationReferenceUrls(generationContext),
                            videoReferenceAssets,
                        },
                    };
                    pendingChildIds = [videoId];
                    setNodes((prev) => (isEmptyVideoNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode, metadata: { ...videoNode.metadata, ...loadingProgressMetadata(0, "准备生成") } } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), { ...videoNode, metadata: { ...videoNode.metadata, ...loadingProgressMetadata(0, "准备生成") } }]));
                    if (!isEmptyVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
                    try {
                        const updateVideoProgress = (percent: number, stage: string) => {
                            setNodes((prev) =>
                                prev.map((node) =>
                                    node.id === videoId
                                        ? { ...node, metadata: { ...node.metadata, generationProgress: percent, generationStage: stage } }
                                        : node,
                                ),
                            );
                        };
                        let generated: VideoGenerationResult;
                        if (usePromptHubGen && promptHubSession && phModelId) {
                            const phStore = usePromptHubStore.getState();
                            const result = await requestPromptHubCanvasVideo({
                                session: promptHubSession,
                                apiBase: phStore.apiBase,
                                model: phModelId,
                                prompt: effectivePrompt,
                                duration: promptHubVideoDuration(generationConfig),
                                ratio: promptHubVideoRatio(generationConfig),
                                resolution: promptHubVideoResolution(generationConfig),
                                referenceImages: generationContext.referenceImages,
                                referenceVideos: generationContext.referenceVideos,
                                referenceAudios: generationContext.referenceAudios,
                                signal: controller.signal,
                                onStage: ({ progress, stage }) => updateVideoProgress(progress, stage),
                            });
                            generated = { blob: result.blob, taskId: result.job.jobId, provider: "openai", model: generationConfig.model, mimeType: result.blob.type || "video/mp4" };
                            void phStore.refreshGenerationAccount();
                        } else {
                            generated = await requestVideoGeneration(generationConfig, effectivePrompt, generationContext.referenceImages, generationContext.referenceVideos, generationContext.referenceAudios, {
                                signal: controller.signal,
                                onProgress: (progress) => updateVideoProgress(progress.percent, progress.message),
                            });
                        }
                        if (!isGenerationRequestActive(videoId, controller)) return;
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === videoId ? { ...node, metadata: { ...node.metadata, ...loadingProgressMetadata(94, "保存视频") } } : node,
                            ),
                        );
                        const video = await storeGeneratedVideo(generated, generationConfig);
                        if (!isGenerationRequestActive(videoId, controller)) return;
                        const media = videoNodeMedia(video, generated, spec);
                        setNodes((prev) => prev.map((node) => (node.id === videoId ? { ...node, width: media.size.width, height: media.size.height, position: { x: node.position.x + node.width / 2 - media.size.width / 2, y: node.position.y + node.height / 2 - media.size.height / 2 }, metadata: { ...node.metadata, ...media.metadata, prompt: effectivePrompt, model: generationConfig.model, size: generationConfig.size, seconds: generationConfig.videoSeconds, vquality: generationConfig.vquality, generateAudio: generationConfig.videoGenerateAudio, watermark: generationConfig.videoWatermark, references: generationReferenceUrls(generationContext), videoReferenceAssets, generationProgress: undefined, generationStage: undefined } } : node)));
                    } catch (error) {
                        if (isGenerationCanceled(error)) return;
                        const errorDetails = error instanceof Error ? error.message : "视频生成失败";
                        message.error(errorDetails);
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === videoId
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, generationProgress: undefined, generationStage: undefined } }
                                    : node,
                            ),
                        );
                    } finally {
                        finishGenerationRequest(videoId, controller);
                    }
                    return;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
                    const audioId = isEmptyAudioNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: isEmptyAudioNode ? sourceNode.width : spec.width,
                        height: isEmptyAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
                    };
                    pendingChildIds = [audioId];
                    setNodes((prev) => (isEmptyAudioNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode]));
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
                    try {
                        const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal }), generationConfig.audioFormat);
                        if (!isGenerationRequestActive(audioId, controller)) return;
                        setNodes((prev) => prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return;
                }

                let streamed = "";
                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode) {
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Text,
                        title: effectivePrompt.slice(0, 32) || "Generated Text",
                        position: {
                            x: parentPosition.x + parentConfig.width + 96,
                            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
                        },
                        width: textConfig.width,
                        height: textConfig.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, fontSize: 14 },
                    }));
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
                }

                const controller = runController;
                const textTargetIds = childIds.length ? childIds : [nodeId];
                textTargetIds.forEach((targetNodeId) => startGenerationRequest(targetNodeId, nodeId, nodeId, controller));
                const responseMessages = buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt });
                const answers = await Promise.all(
                    textTargetIds.map((targetNodeId) => {
                        let localStreamed = "";
                        const request = usePromptHubGen && promptHubSession && phModelId
                            ? requestPromptHubText(promptHubSession, phModelId, responseMessages, { apiBase: usePromptHubStore.getState().apiBase, signal: controller.signal })
                            : requestImageQuestion(generationConfig, responseMessages, (text) => {
                                  localStreamed = text;
                                  streamed = text;
                                  if (isConfigNode) return;
                                  setNodes((prev) => prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)));
                              }, { signal: controller.signal });
                        return request
                            .then((answer) => ({ nodeId: targetNodeId, content: answer || localStreamed }))
                            .finally(() => finishGenerationRequest(targetNodeId, controller));
                    }),
                );
                if (usePromptHubGen) void usePromptHubStore.getState().refreshGenerationAccount();
                if (controller.signal.aborted) return;
                const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
                setNodes((prev) =>
                    prev.map((node) =>
                        childIds.includes(node.id)
                            ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                            : node.id === nodeId && isConfigNode
                              ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                              : node.id === nodeId && !editingTextNode
                                ? { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                                : node,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } }) : node)),
                );
            } finally {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, isGenerationRequestActive, message, openConfigDialog, startGenerationRequest],
    );
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            const phModelId = parsePromptHubModelId(generationConfig.model);
            const promptHubSession = phModelId ? await usePromptHubStore.getState().getSession() : null;
            const usePromptHubGen = Boolean(phModelId && promptHubSession);
            if (!usePromptHubGen && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];

            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, ...loadingProgressMetadata(8, "生成中") } } : item)));
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);
            let stopProgressTicker: (() => void) | null = null;

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const messages = buildNodeResponseMessages({ ...context, prompt });
                    const answer = usePromptHubGen && promptHubSession && phModelId
                        ? await requestPromptHubText(promptHubSession, phModelId, messages, { apiBase: usePromptHubStore.getState().apiBase, signal: controller.signal })
                        : await requestImageQuestion(generationConfig, messages, (text) => {
                              streamed = text;
                              setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
                          }, { signal: controller.signal });
                    if (!isGenerationRequestActive(node.id, controller)) return;
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...loadingProgressMetadata(0, "准备生成") } } : item)));
                    const updateProgress = (percent: number, stage: string) => setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, generationProgress: percent, generationStage: stage } } : item));
                    let generated: VideoGenerationResult;
                    if (usePromptHubGen && promptHubSession && phModelId) {
                        const result = await requestPromptHubCanvasVideo({
                            session: promptHubSession,
                            apiBase: usePromptHubStore.getState().apiBase,
                            model: phModelId,
                            prompt,
                            duration: promptHubVideoDuration(generationConfig),
                            ratio: promptHubVideoRatio(generationConfig),
                            resolution: promptHubVideoResolution(generationConfig),
                            referenceImages: retryImages,
                            referenceVideos: context?.referenceVideos || [],
                            referenceAudios: context?.referenceAudios || [],
                            signal: controller.signal,
                            onStage: ({ progress, stage }) => updateProgress(progress, stage),
                        });
                        generated = { blob: result.blob, taskId: result.job.jobId, provider: "openai", model: generationConfig.model, mimeType: result.blob.type || "video/mp4" };
                    } else {
                        generated = await requestVideoGeneration(generationConfig, prompt, retryImages, context?.referenceVideos || [], context?.referenceAudios || [], {
                            signal: controller.signal,
                            onProgress: (progress) => updateProgress(progress.percent, progress.message),
                        });
                    }
                    if (!isGenerationRequestActive(node.id, controller)) return;
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id ? { ...item, metadata: { ...item.metadata, ...loadingProgressMetadata(94, "保存视频") } } : item,
                        ),
                    );
                    const video = await storeGeneratedVideo(generated, generationConfig);
                    if (!isGenerationRequestActive(node.id, controller)) return;
                    const fallbackSpec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || { width: node.width, height: node.height };
                    const media = videoNodeMedia(video, generated, fallbackSpec);
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, width: media.size.width, height: media.size.height, position: { x: item.position.x + item.width / 2 - media.size.width / 2, y: item.position.y + item.height / 2 - media.size.height / 2 }, metadata: { ...item.metadata, ...media.metadata, prompt, model: generationConfig.model, size: generationConfig.size, seconds: generationConfig.videoSeconds, vquality: generationConfig.vquality, generateAudio: generationConfig.videoGenerateAudio, watermark: generationConfig.videoWatermark } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal }), generationConfig.audioFormat);
                    if (!isGenerationRequestActive(node.id, controller)) return;
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                stopProgressTicker = startGenerationProgressTicker((progress, stage) => {
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id && item.metadata?.status === NODE_STATUS_LOADING
                                ? { ...item, metadata: { ...item.metadata, ...loadingProgressMetadata(progress, stage) } }
                                : item,
                        ),
                    );
                }, { stage: "生成中" });
                const items: GeneratedImageItem[] = usePromptHubGen && promptHubSession && phModelId
                    ? await requestPromptHubCanvasImages({
                          session: promptHubSession,
                          apiBase: usePromptHubStore.getState().apiBase,
                          prompt,
                          count: 1,
                          model: phModelId,
                          resolution: mapPromptHubResolution(generationConfig),
                          size: generationConfig.size,
                          referenceImages: retryImages,
                          signal: controller.signal,
                      })
                    : useReferenceImages
                      ? await requestEdit(generationConfig, prompt, retryImages, undefined, { signal: controller.signal })
                      : await requestGeneration(generationConfig, prompt, { signal: controller.signal });
                stopProgressTicker?.();
                stopProgressTicker = null;
                if (!isGenerationRequestActive(node.id, controller)) return;
                if (!items.length) throw new Error("接口没有返回图片");

                const generationMetadata = savedImageMetadata?.generationType
                    ? { generationType: savedImageMetadata.generationType, model: generationConfig.model, size: generationConfig.size, quality: generationConfig.quality, count: items.length, references: savedImageMetadata.references }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, items.length, retryImages);

                const isEmptyImageNode = node.type === CanvasNodeType.Image && !node.metadata?.content;
                const usePromptTextHub = false;
                const usePromptSiblingHub = items.length > 1 && node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);

                if (usePromptTextHub || usePromptSiblingHub) {
                    const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                    const hubPlan = usePromptSiblingHub
                        ? buildPromptHubSiblingImageNodes({ anchor: node, prompt, count: items.length, generationMetadata })
                        : buildPromptHubImageNodes({
                              anchor: resolvePromptHubAnchor(node, node.position, textSpec),
                              prompt,
                              count: items.length,
                              generationMetadata,
                          });
                    if (!isGenerationRequestActive(node.id, controller)) return;
                    setNodes((prev) => {
                        const next = prev.map((item) => {
                            if (item.id !== node.id) return item;
                            if (usePromptSiblingHub) {
                                return { ...item, metadata: { ...item.metadata, prompt, status: NODE_STATUS_SUCCESS, errorDetails: undefined } };
                            }
                            return buildPromptTextNodePatch(item, prompt, textSpec);
                        });
                        const existingIds = new Set(next.map((entry) => entry.id));
                        return [...next, ...hubPlan.nodes.filter((entry) => !existingIds.has(entry.id))];
                    });
                    setConnections((prev) => [...prev, ...buildPromptHubConnections(node.id, hubPlan.ids)]);
                    if (items.length > 1) message.success(`已获取 ${items.length} 张图片`);

                    for (let index = 0; index < items.length; index += 1) {
                        const targetId = hubPlan.ids[index];
                        setNodes((prev) =>
                            prev.map((item) =>
                                item.id === targetId
                                    ? { ...item, metadata: { ...item.metadata, ...loadingProgressMetadata(Math.round(((index + 0.5) / items.length) * 100), `保存 ${index + 1}/${items.length}`) } }
                                    : item,
                            ),
                        );
                        const uploaded = await uploadImage(items[index].dataUrl);
                        if (!isGenerationRequestActive(node.id, controller)) return;
                        setNodes((prev) => prev.map((item) => (item.id === targetId ? applyUploadedImageToNode(item, uploaded) : item)));
                    }
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, prompt, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : item)));
                    return;
                }

                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const uploadedImages = [];
                for (let index = 0; index < items.length; index += 1) {
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id
                                ? { ...item, metadata: { ...item.metadata, ...loadingProgressMetadata(Math.round(((index + 0.5) / items.length) * 100), `保存 ${index + 1}/${items.length}`) } }
                                : item,
                        ),
                    );
                    const uploaded = await uploadImage(items[index].dataUrl);
                    if (!isGenerationRequestActive(node.id, controller)) return;
                    uploadedImages.push(uploaded);
                }

                const [firstUploaded, ...restUploaded] = uploadedImages;
                const firstSize = fitNodeSize(firstUploaded.width, firstUploaded.height, imageConfig.width, imageConfig.height);
                const extraNodes: CanvasNodeData[] = restUploaded.map((uploaded, index) => {
                    const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                    return {
                        id: nanoid(),
                        type: CanvasNodeType.Image,
                        title: prompt.slice(0, 32) || "Generated Image",
                        position: { x: node.position.x + (index + 1) * (size.width + 36), y: node.position.y },
                        width: size.width,
                        height: size.height,
                        metadata: { ...imageMetadata(uploaded), prompt, ...generationMetadata, batchRootId: items.length > 1 ? node.id : undefined },
                    };
                });

                if (!isGenerationRequestActive(node.id, controller)) return;
                setNodes((prev) => {
                    const next = prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  type: CanvasNodeType.Image,
                                  width: firstSize.width,
                                  height: firstSize.height,
                                  metadata: {
                                      ...item.metadata,
                                      ...imageMetadata(firstUploaded),
                                      prompt,
                                      ...generationMetadata,
                                      isBatchRoot: items.length > 1 ? true : undefined,
                                      batchChildIds: extraNodes.length ? extraNodes.map((child) => child.id) : undefined,
                                      primaryImageId: node.id,
                                      imageBatchExpanded: items.length > 1 ? true : undefined,
                                  },
                              }
                            : item,
                    );
                    return extraNodes.length ? [...next, ...extraNodes] : next;
                });
                if (extraNodes.length) {
                    setConnections((prev) => [...prev, ...extraNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
                    if (items.length > 1) message.success(`已获取 ${items.length} 张图片`);
                }
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                stopProgressTicker?.();
                if (usePromptHubGen) void usePromptHubStore.getState().refreshGenerationAccount();
                finishGenerationRequest(node.id, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, isGenerationRequestActive, message, openConfigDialog, startGenerationRequest],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage, position?: Position) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string, position?: Position) => {
            const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload, position?: Position) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, position);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [...prev, { id, type: CanvasNodeType.Video, title: payload.title, position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height } }]);
                setSelectedNodeIds(new Set([id]));
            } else {
                insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.prompt || payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey }, position);
            }
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    useLayoutEffect(() => {
        assetInsertRef.current = handleAssetInsert;
    }, [handleAssetInsert]);

    const assistantOpen = assistantMounted && !assistantCollapsed;
    const openAgent = (mode: CanvasAgentMode = agentMode) => {
        setAgentMode(mode);
        setAssistantMounted(true);
        setAssistantClosing(false);
        setAssistantCollapsed(false);
    };
    const closeAgent = () => {
        closeAssistantPanel();
    };

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => router.push("/")}
                    onProjects={() => router.push("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    agentOpen={assistantOpen}
                    compactAgentStatus={codexCompactAgent ? { connected: localAgentConnected, enabled: localAgentEnabled, activity: localAgentActivity } : undefined}
                    onToggleAgent={() => (assistantOpen ? closeAgent() : openAgent())}
                    onSaveNow={() => void saveCurrentProjectNow()}
                    savePending={savePending}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    worldLayerRef={worldLayerRef}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        viewportRef.current = next;
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasPointerMove={handleCanvasPointerMove}
                    onCanvasDeselect={deselectCanvas}
                    onNodeWheelResize={handleSelectedNodeWheelResize}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {visibleConnections.map((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                if (!from || !to) return null;

                                return (
                                    <ConnectionPath
                                        key={connection.id}
                                        connection={connection}
                                        from={from}
                                        to={to}
                                        active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                        onSelect={() => {
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu(null);
                                        }}
                                        onContextMenu={(event) => {
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                        }}
                                    />
                                );
                            })}
                        {connectingParams ? <ActiveConnectionPath scale={viewport.k} node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {nodeGroups.map((bounds) => (
                        <CanvasNodeGroupBackdrop
                            key={`${bounds.rootId}-backdrop`}
                            bounds={bounds}
                            selected={isGroupActive(bounds)}
                            onMouseDown={handleGroupMouseDown}
                            onPointerEnter={keepGroupToolbar}
                            onPointerLeave={hideGroupToolbar}
                        />
                    ))}

                    {visibleNodes.map((node) => {
                        const activeConnection = connectingParams ?? pendingConnectionCreate?.connection ?? null;
                        let connectionDropSides: Array<"left" | "right"> | undefined;
                        if (connectingParams && connectingParams.nodeId !== node.id && normalizeConnection(connectingParams.nodeId, node.id, nodes, connectingParams.handleType)) {
                            connectionDropSides = connectingParams.handleType === "source" ? ["left"] : ["right"];
                        }

                        return (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isGroupPackaged={packagedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            connectionDropSides={connectionDropSides}
                            activeConnectHandle={activeConnection}
                            editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                            showPanel={dialogNodeId === node.id && !selectionBox}
                            batchCount={batchChildCountById.get(node.id) || 0}
                            batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                            batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                            batchOpening={openingBatchIds.has(node.id)}
                            batchRecovering={collapsingBatchIds.has(node.id)}
                            batchMotion={batchMotionById.get(node.id)}
                            showImageInfo={showImageInfo}
                            resourceLabel={resourceReferenceByNodeId.get(node.id)}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || []}
                            renderPanel={(panelNode) =>
                                panelNode.type === CanvasNodeType.Config ? (
                                    <CanvasConfigComposer
                                        value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                                        inputs={configInputsById.get(panelNode.id) || []}
                                        onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                                        onClose={() => setDialogNodeId(null)}
                                    />
                                ) : (
                                    <CanvasNodePromptPanel
                                        node={panelNode}
                                        isRunning={runningNodeId === panelNode.id}
                                        mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || []}
                                        onPromptChange={handleNodePromptChange}
                                        onConfigChange={handleConfigNodeChange}
                                        onGenerate={handleGenerateNode}
                                        onStop={confirmStopGeneration}
                                        onDisconnectReference={(nodeId, sourceNodeId) => disconnectReference(nodeId, sourceNodeId)}
                                        onImageSettingsOpenChange={(open) => {
                                            setNodeImageSettingsOpen(open);
                                            if (open) setToolbarNodeId(null);
                                        }}
                                    />
                                )
                            }
                            renderNodeContent={(contentNode) => (
                                <CanvasConfigNodePanel
                                    node={contentNode}
                                    isRunning={runningNodeId === contentNode.id}
                                    inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                                    onConfigChange={handleConfigNodeChange}
                                    onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                                    onStop={confirmStopGeneration}
                                    onGenerate={(nodeId) => {
                                        const target = nodesRef.current.find((item) => item.id === nodeId);
                                        void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                                    }}
                                />
                            )}
                            onMouseDown={handleNodeMouseDown}
                            onHoverStart={(nodeId) => {
                                if (nodeDraggingRef.current) return;
                                setHoveredNodeId((current) => (current === nodeId ? current : nodeId));
                                keepNodeToolbar(nodeId);
                            }}
                            onHoverEnd={(nodeId) => {
                                setHoveredNodeId((current) => (current === nodeId ? null : current));
                                hideNodeToolbar();
                            }}
                            onConnectStart={handleConnectStart}
                            onConnectMenu={openConnectionMenu}
                            onResize={handleNodeResize}
                            onResizeActiveChange={handleNodeResizeActiveChange}
                            onContentChange={handleNodeContentChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={(node) => void handleRetryNode(node)}
                            onGenerateImage={generateImageFromTextNode}
                            onViewImage={(node) => setPreviewNodeId(node.id)}
                            onContextMenu={(event, id) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const world = screenToCanvas(event.clientX, event.clientY);
                                if (!selectedNodeIdsRef.current.has(id)) {
                                    setSelectedNodeIds(new Set([id]));
                                }
                                setSelectedConnectionId(null);
                                setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id, worldX: world.x, worldY: world.y });
                            }}
                            onVideoPersisted={handleVideoPersisted}
                            onRegisterVideoControl={registerVideoControl}
                        />
                        );
                    })}

                    {selectionBox ? (
                        <div
                            className="pointer-events-none absolute z-[100] border"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                                borderColor: theme.canvas.selectionStroke,
                                background: theme.canvas.selectionFill,
                            }}
                        />
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                </InfiniteCanvas>

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                    viewport={viewport}
                    onClose={closeToolbar}
                    onPointerEnter={() => {
                        if (toolbarNode) keepNodeToolbar(toolbarNode.id);
                    }}
                    onPointerLeave={() => hideNodeToolbar()}
                    onImageToolSettingsOpenChange={setToolbarImageSettingsOpen}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onEditText={openTextEditor}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={(node) => setPreviewNodeId(node.id)}
                    onReversePrompt={createImageReversePromptNodes}
                    onCaptureVideoFrame={(node) => {
                        if (!node.metadata?.content) {
                            message.warning("视频节点为空，无法选帧");
                            return;
                        }
                        setVideoFrameNodeId(node.id);
                    }}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                />

                <CanvasNodeGroupHoverToolbar
                    bounds={isNodeDragging ? null : toolbarGroupBounds}
                    viewport={viewport}
                    selected={toolbarGroupBounds ? isGroupSelected(toolbarGroupBounds, selectedNodeIds) : false}
                    onClose={closeGroupToolbar}
                    onPointerEnter={() => {
                        if (toolbarGroupBounds) keepGroupToolbar(toolbarGroupBounds.rootId);
                    }}
                    onPointerLeave={() => hideGroupToolbar()}
                    onColorChange={setGroupColor}
                    onArrangeLayout={arrangeGroupLayout}
                    onRename={setGroupName}
                    onUngroup={ungroupGroupByRoot}
                    onMenuOpenChange={(open) => {
                        groupToolbarMenuOpenRef.current = open;
                    }}
                />

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onDeselect={deselectCanvas}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    onOpenMyAssets={() => {
                        setAssetDrawerOpen((value) => !value);
                    }}
                    onOpenDirectorStage={() => directorStageRef.current?.open()}
                />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={(next) => { viewportRef.current = next; setViewport(next); }} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        selectedCount={selectedNodeIds.size}
                        canGroup={selectedNodeIds.size >= 2 && canGroupNodes(nodes.filter((node) => selectedNodeIds.has(node.id)))}
                        canUngroup={Array.from(selectedNodeIds).some((id) => {
                            const node = nodes.find((item) => item.id === id);
                            return node ? Boolean(getGroupRootId(node)) : false;
                        })}
                        onGroup={() => {
                            groupSelectedNodes();
                            setContextMenu(null);
                        }}
                        onUngroup={() => {
                            ungroupSelectedNodes();
                            setContextMenu(null);
                        }}
                        canPaste={Boolean(clipboardRef.current?.nodes.length)}
                        onClose={() => setContextMenu(null)}
                        onUpload={() => {
                            if (contextMenu.type === "canvas") {
                                handleUploadRequest(undefined, { x: contextMenu.worldX, y: contextMenu.worldY });
                            } else if (contextMenu.type === "node") {
                                handleUploadRequest(contextMenu.nodeId);
                            }
                            setContextMenu(null);
                        }}
                        onAddImage={() => {
                            if (contextMenu.type === "canvas") createNode(CanvasNodeType.Image, { x: contextMenu.worldX, y: contextMenu.worldY });
                            setContextMenu(null);
                        }}
                        onAddVideo={() => {
                            if (contextMenu.type === "canvas") createNode(CanvasNodeType.Video, { x: contextMenu.worldX, y: contextMenu.worldY });
                            setContextMenu(null);
                        }}
                        onAddAudio={() => {
                            if (contextMenu.type === "canvas") createNode(CanvasNodeType.Audio, { x: contextMenu.worldX, y: contextMenu.worldY });
                            setContextMenu(null);
                        }}
                        onAddText={() => {
                            if (contextMenu.type === "canvas") createNode(CanvasNodeType.Text, { x: contextMenu.worldX, y: contextMenu.worldY });
                            setContextMenu(null);
                        }}
                        onAddConfig={() => {
                            if (contextMenu.type === "canvas") createNode(CanvasNodeType.Config, { x: contextMenu.worldX, y: contextMenu.worldY });
                            setContextMenu(null);
                        }}
                        onPaste={() => {
                            if (contextMenu.type === "canvas" || contextMenu.type === "node") {
                                pasteCopiedNodes({ x: contextMenu.worldX, y: contextMenu.worldY });
                            }
                            setContextMenu(null);
                        }}
                        onCopy={
                            contextMenu.type === "node"
                                ? () => {
                                      copyNodeToClipboard(contextMenu.nodeId);
                                      setContextMenu(null);
                                  }
                                : undefined
                        }
                        showSaveToAssetLibrary={
                            contextMenu.type === "node"
                            && (() => {
                                const node = nodes.find((item) => item.id === contextMenu.nodeId);
                                if (!node) return false;
                                if (node.type === CanvasNodeType.Text) return Boolean(node.metadata?.content?.trim());
                                if (node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Image) {
                                    return Boolean(node.metadata?.content);
                                }
                                return false;
                            })()
                        }
                        onSaveToAssetLibrary={() => {
                            if (contextMenu.type !== "node") return;
                            const node = nodes.find((item) => item.id === contextMenu.nodeId);
                            if (!node) return;
                            setContextMenu(null);
                            void saveNodeAsset(node);
                        }}
                        showSaveToPromptHub={
                            contextMenu.type === "node"
                            && canSaveImageNodeToPromptHub(nodes.find((item) => item.id === contextMenu.nodeId))
                        }
                        onSaveToPromptHub={() => {
                            if (contextMenu.type !== "node") return;
                            const node = nodes.find((item) => item.id === contextMenu.nodeId);
                            if (!node) return;
                            setContextMenu(null);
                            void saveNodeToPromptHub(node);
                        }}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                const ids = selectedNodeIds.size > 1 && selectedNodeIds.has(contextMenu.nodeId) ? selectedNodeIds : new Set([contextMenu.nodeId]);
                                deleteNodes(ids);
                            } else if (contextMenu.type === "connection") {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}
                {videoFrameNode?.metadata?.content ? (
                    <CanvasNodeVideoFrameDialog
                        node={videoFrameNode}
                        open={Boolean(videoFrameNode)}
                        initialPlayUrl={videoPlayerRef.current.get(videoFrameNode.id)?.getPlayUrl() || ""}
                        onClose={() => setVideoFrameNodeId(null)}
                        onConfirm={(dataUrl) => {
                            setVideoFrameNodeId(null);
                            setVideoFrameCrop({ node: videoFrameNode, dataUrl });
                        }}
                    />
                ) : null}
                {videoFrameCrop ? (
                    <CanvasNodeCropDialog
                        dataUrl={videoFrameCrop.dataUrl}
                        open
                        onClose={() => setVideoFrameCrop(null)}
                        onConfirm={(crop) => {
                            const payload = videoFrameCrop;
                            setVideoFrameCrop(null);
                            void cropDataUrl(payload.dataUrl, crop).then((cropped) => createImageFromVideoFrame(payload.node, cropped));
                        }}
                    />
                ) : null}

                {maskEditNode?.metadata?.content ? <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} /> : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode?.metadata?.content ? <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} /> : null}

                <Modal title="AI 超分" open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => setSuperResolveNodeId(null)}>
                    <div className="py-8 text-center text-base font-medium">暂未实现</div>
                </Modal>

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    title={previewNode?.type === CanvasNodeType.Video ? "视频预览" : "图片详情"}
                    open={Boolean(previewNode?.metadata?.content)}
                    centered
                    destroyOnHidden
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: previewNode?.type === CanvasNodeType.Video ? 12 : 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "85vh" } }}
                >
                    {previewNode?.metadata?.content ? (
                        previewNode.type === CanvasNodeType.Video ? (
                            <div className="w-[min(96vw,1080px)]" style={{ height: "min(85vh, 640px)" }}>
                                <CanvasVideoPlayer
                                    variant="preview"
                                    content={previewNode.metadata.content}
                                    storageKey={previewNode.metadata.storageKey}
                                    mimeType={previewNode.metadata.mimeType}
                                    taskId={previewNode.metadata.videoTaskId}
                                    provider={previewNode.metadata.videoProvider}
                                    model={previewNode.metadata.model}
                                />
                            </div>
                        ) : (
                            <img
                                src={previewNode.metadata.content}
                                alt={previewNode.title || "图片"}
                                style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }}
                            />
                        )
                    ) : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                <CanvasAssetDrawer open={assetDrawerOpen} onInsert={handleAssetInsert} onClose={() => setAssetDrawerOpen(false)} />
                <CanvasDirectorStage ref={directorStageRef} onCapture={addDirectorStageCaptures} />
                {codexCompactAgent && (!assistantMounted || (assistantClosing && agentMode !== "local")) ? <CanvasLocalAgentPanel headless snapshot={agentSnapshot} canUndoOps={Boolean(agentUndoSnapshot)} onApplyOps={applyAgentOps} onUndoOps={undoAgentOps} onDirectorAction={executeDirectorStageAction} autoConnect={codexAutoConnect} /> : null}
            </section>
            {assistantMounted ? (
                <CanvasAssistantPanel
                    key={projectId}
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    snapshot={agentSnapshot}
                    sessions={chatSessions}
                    activeSessionId={activeChatId}
                    onSelectNodeIds={setSelectedNodeIds}
                    onSessionsChange={handleAssistantSessionsChange}
                    onApplyOps={applyAgentOps}
                    canUndoOps={Boolean(agentUndoSnapshot)}
                    onUndoOps={undoAgentOps}
                    onDirectorAction={executeDirectorStageAction}
                    agentMode={agentMode}
                    onAgentModeChange={setAgentMode}
                    autoConnectLocal={codexAutoConnect}
                    closing={assistantClosing}
                    onCollapse={closeAgent}
                />
            ) : null}
        </main>
    );
}

function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onImportImage,
    onUndo,
    onRedo,
    agentOpen,
    compactAgentStatus,
    onToggleAgent,
    onSaveNow,
    savePending,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    agentOpen: boolean;
    compactAgentStatus?: { connected: boolean; enabled: boolean; activity: string };
    onToggleAgent: () => void;
    onSaveNow: () => void;
    savePending: boolean;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const stopTopBarPointerEvent = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();
    const handleAgentButtonClick = (event: ReactMouseEvent<HTMLElement>) => {
        event.stopPropagation();
        onToggleAgent();
    };

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-14 items-center justify-between px-2 sm:h-16 sm:px-4">
                <div className="pointer-events-auto flex min-w-0 items-center gap-2 sm:gap-3">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "home", icon: <Home className="size-4" />, label: "主页", onClick: onHome },
                                { key: "projects", icon: <Images className="size-4" />, label: "我的画布", onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: "导入素材", onClick: onImportImage },
                                { type: "divider" },
                                { key: "save", icon: <Save className="size-4" />, label: "立即保存", onClick: onSaveNow },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button type="button" className="grid size-9 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label="打开画布菜单">
                            <Menu className="size-5" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="max-w-[38vw] bg-transparent p-0 text-left text-base font-semibold tracking-normal outline-none sm:max-w-[280px] sm:text-lg"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[38vw] truncate border-b border-dashed border-transparent text-left text-base font-semibold tracking-normal transition hover:border-current sm:max-w-[280px] sm:text-lg"
                                onDoubleClick={onStartTitleEditing}
                                title="双击修改画布名称"
                            >
                                {title}
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className="canvas-toolbar-pill inline-flex h-9 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition hover:opacity-90 sm:h-8 sm:px-2.5"
                        style={{ color: theme.node.muted, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
                        title="立即保存当前画布"
                        onClick={onSaveNow}
                    >
                        <Save className="size-3.5" />
                        <span className="hidden sm:inline">{savePending ? "保存中…" : "已保存"}</span>
                    </button>
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
                    {compactAgentStatus ? <CompactAgentStatus status={compactAgentStatus} onClick={onToggleAgent} /> : null}
                    <div className="hidden sm:block">
                        <UserStatusActions
                            variant="canvas"
                            onOpenShortcuts={() => setShortcutsOpen(true)}
                        />
                    </div>
                    <span className="hidden h-6 w-px sm:block" style={{ background: theme.toolbar.border }} />
                    <Button
                        type="text"
                        className="!h-9 !w-9 !min-w-9 !rounded-xl !p-0 !font-medium sm:!h-10 sm:!w-auto sm:!px-3"
                        style={{ background: agentOpen ? theme.toolbar.activeBg : theme.toolbar.panel, color: theme.node.text, boxShadow: "0 10px 30px rgba(28,25,23,.10)" }}
                        aria-label={agentOpen ? "收起 Agent 面板" : "打开 Agent 面板"}
                        title={agentOpen ? "收起 Agent 面板" : "打开 Agent 面板"}
                        data-testid="canvas-agent-toggle"
                        icon={<Bot className="size-4" />}
                        onPointerDown={stopTopBarPointerEvent}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={handleAgentButtonClick}
                    >
                        <span className="hidden sm:inline">Agent</span>
                    </Button>
                </div>
            </div>
            <CanvasReferenceHoverPreviewHost />
            <CanvasShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function CompactAgentStatus({ status, onClick }: { status: { connected: boolean; enabled: boolean; activity: string }; onClick: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const label = status.connected ? "已连接到本地 Codex" : status.enabled ? status.activity || "连接中" : "正在连接本地 Codex";
    const dotColor = status.connected ? "#22c55e" : status.enabled ? "#f59e0b" : theme.node.muted;
    return (
        <button
            type="button"
            className="hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:opacity-85 md:flex"
            style={{ background: theme.toolbar.panel, color: theme.node.text, boxShadow: "0 10px 30px rgba(28,25,23,.10)" }}
            onClick={onClick}
            title="打开本地 Codex 面板"
        >
            <span className="size-2 rounded-full" style={{ background: dotColor }} />
            <span className="max-w-[180px] truncate">{label}</span>
        </button>
    );
}

function creativeProjectStateFromOps(ops: CanvasAgentOp[]) {
    for (let index = ops.length - 1; index >= 0; index -= 1) {
        const op = ops[index];
        if (op.type !== "add_node" && op.type !== "update_node") continue;
        const state = op.type === "add_node" ? op.metadata?.creativeProjectState : op.metadata?.creativeProjectState || op.patch?.metadata?.creativeProjectState;
        if (state?.schemaVersion === 2) return state;
    }
    return undefined;
}

function expireRestoredCreativeAction(state: CreativeProjectState): CreativeProjectState {
    if (state.pendingAction?.status !== "awaiting_user_confirmation") return state;
    return {
        ...state,
        pendingAction: undefined,
        awaitingUserConfirmation: false,
        userConfirmed: false,
        nextGap: state.recommendedAction.label,
        updatedAt: new Date().toISOString(),
    };
}

function expirePendingAssistantSessions(sessions: CanvasAssistantSession[]) {
    return sessions.map((session) => ({
        ...session,
        messages: session.messages.map((item) => {
            const detail = item.detail && typeof item.detail === "object" && !Array.isArray(item.detail) ? item.detail as Record<string, unknown> : null;
            if (item.role !== "tool" || detail?.status !== "pending") return item;
            return {
                ...item,
                title: "确认已过期",
                text: "页面刷新后执行上下文已失效，请让 Agent 重新提出该动作。",
                detail: { ...detail, status: "expired" },
            };
        }),
    }));
}

function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

function recordCanvasImageGeneration(input: { prompt: string; config: AiConfig; references: ReferenceImage[]; images: UploadedImage[]; startedAt: number }) {
    if (!input.images.length) return;
    void appendImageGenerationLogFromCanvas({
        prompt: input.prompt,
        model: input.config.model || input.config.imageModel || "",
        config: {
            model: input.config.model,
            imageModel: input.config.imageModel,
            quality: input.config.quality,
            size: input.config.size,
            count: String(input.images.length),
        },
        references: input.references,
        images: input.images,
        durationMs: performance.now() - input.startedAt,
    });
}

function videoMetadata(video: UploadedFile, result?: VideoGenerationResult): CanvasNodeMetadata {
    return {
        content: video.url,
        storageKey: video.storageKey,
        status: "success",
        naturalWidth: video.width,
        naturalHeight: video.height,
        bytes: video.bytes,
        mimeType: video.mimeType || "video/mp4",
        durationMs: video.durationMs,
        videoTaskId: result?.taskId,
        videoProvider: result?.provider,
    };
}

function videoNodeMedia(video: UploadedFile, result: VideoGenerationResult | undefined, fallback: { width: number; height: number }) {
    const dimensions = videoDimensionsForNode(video, fallback);
    return {
        size: fitNodeSize(dimensions.width, dimensions.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT),
        metadata: {
            ...videoMetadata(video, result),
            naturalWidth: dimensions.width,
            naturalHeight: dimensions.height,
        },
    };
}

function videoDimensionsForNode(video: UploadedFile, fallback: { width: number; height: number }) {
    const width = video.width || 0;
    const height = video.height || 0;
    const hasMeasuredFile = Boolean(video.storageKey || video.bytes > 0);
    const isGenericRemoteFallback = width === 1280 && height === 720 && !hasMeasuredFile;
    if (width > 0 && height > 0 && !isGenericRemoteFallback) return { width, height };
    return { width: Math.max(1, fallback.width), height: Math.max(1, fallback.height) };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", durationMs: audio.durationMs };
}

function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        size: config.size,
        quality: config.quality,
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
    return {
        model: config.model,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioInstructions: config.audioInstructions,
    };
}

function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            if (node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) {
                if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveMediaUrl(node.metadata.storageKey, content) } };
                if (node.type === CanvasNodeType.Video && content && /^https?:\/\//i.test(content) && !node.metadata?.storageKey) {
                    try {
                        const config = useConfigStore.getState().config;
                        const blob = config.baseUrl.trim() && config.apiKey.trim() ? await downloadRemoteVideoBlob(config, content) : null;
                        const video = blob ? await uploadMediaFile(blob, "video") : await uploadMediaFile(content, "video");
                        const media = videoNodeMedia(video, undefined, {
                            width: node.metadata?.naturalWidth || node.width,
                            height: node.metadata?.naturalHeight || node.height,
                        });
                        return {
                            ...node,
                            width: media.size.width,
                            height: media.size.height,
                            position: {
                                x: node.position.x + node.width / 2 - media.size.width / 2,
                                y: node.position.y + node.height / 2 - media.size.height / 2,
                            },
                            metadata: { ...node.metadata, ...media.metadata },
                        };
                    } catch {
                        return node;
                    }
                }
                return node;
            }
            if (node.type !== CanvasNodeType.Image || !content) return node;
            if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content) } };
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

function nodeGeometryMatches(node: CanvasNodeData, width: number, height: number, position: Position) {
    return (
        Math.abs(node.width - width) < 0.5 &&
        Math.abs(node.height - height) < 0.5 &&
        Math.abs(node.position.x - position.x) < 0.5 &&
        Math.abs(node.position.y - position.y) < 0.5
    );
}

function metadataShallowEqual(a?: CanvasNodeData["metadata"], b?: CanvasNodeData["metadata"]) {
    if (a === b) return true;
    if (!a || !b) return !a && !b;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
    }
    return true;
}

function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeData["metadata"]>) {
    const safePatch = patch || {};
    const next = { ...node, metadata: { ...node.metadata, ...safePatch } };
    const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = typeof safePatch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height) : null;
    return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

function getConnectionHandlePoint(node: CanvasNodeData, side: "left" | "right", scale: number) {
    const outset = CONNECTION_HANDLE_SCREEN_OFFSET / Math.max(scale, 0.05);
    const y = node.position.y + node.height / 2;
    return {
        x: side === "left" ? node.position.x - outset : node.position.x + node.width + outset,
        y,
    };
}

function getReferenceInputTargetNodeId(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configConnection = connections.find((connection) => connection.fromNodeId === nodeId && nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config);
    return configConnection?.toNodeId || nodeId;
}

function syncVideoReferenceAssetsForNodes(nodes: CanvasNodeData[], connections: CanvasConnection[], sourceNodeId?: string) {
    const affectedVideoIds = new Set<string>();
    connections.forEach((connection) => {
        if (sourceNodeId && connection.fromNodeId !== sourceNodeId) return;
        const targetNode = nodes.find((node) => node.id === connection.toNodeId);
        if (targetNode?.type === CanvasNodeType.Video) affectedVideoIds.add(connection.toNodeId);
    });
    if (!affectedVideoIds.size) return nodes;
    return nodes.map((node) => {
        if (!affectedVideoIds.has(node.id)) return node;
        const assets = toVideoReferenceAssets(resolveActiveVideoReferences(node.metadata?.prompt || "", buildNodeMentionReferences(node, nodes, connections)));
        return { ...node, metadata: { ...node.metadata, videoReferenceAssets: assets } };
    });
}

function mapPromptHubResolution(config: AiConfig): "1k" | "2k" | "4k" {
    const q = String(config.quality || "").toLowerCase();
    if (q.includes("4k")) return "4k";
    if (q.includes("2k")) return "2k";
    const s = String(config.size || "").toLowerCase();
    if (s.includes("4k") || s.includes("4096")) return "4k";
    if (s.includes("2k") || s.includes("2048")) return "2k";
    return "1k";
}

function promptHubVideoDuration(config: AiConfig) {
    const seconds = Math.round(Number(config.videoSeconds) || 0);
    return seconds > 0 ? Math.min(60, seconds) : 5;
}

function promptHubVideoRatio(config: AiConfig) {
    const modelId = parsePromptHubModelId(config.model || config.videoModel);
    const model = modelId ? usePromptHubStore.getState().models.find((candidate) => candidate.id === modelId) : null;
    return normalizePromptHubVideoRatio(config.size, promptHubVideoAspectRatios(model, modelId));
}

function promptHubVideoResolution(config: AiConfig) {
    const value = String(config.vquality || "").trim().toLowerCase();
    if (value.includes("4k")) return "4k";
    if (value.includes("1080")) return "1080p";
    if (value.includes("480")) return "480p";
    return "720p";
}

function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}

function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? config.audioModel : config.textModel;
    const rawQuality = node?.metadata?.quality || config.quality || defaultConfig.quality;
    return {
        ...config,
        model: node?.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : config.model || defaultConfig.model),
        quality: mode === "image" ? normalizeJimengQualityValue(rawQuality) : rawQuality,
        size: node?.metadata?.size || config.size || defaultConfig.size,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        count: String(node?.metadata?.count || (mode === "image" ? config.canvasImageCount || config.count : config.count) || defaultConfig.count),
    };
}

function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => (node.metadata?.status === "loading" ? { ...node, metadata: { ...node.metadata, status: "error" as const, errorDetails: "页面刷新后生成已中断，请重新生成。" } } : node));
}

function pickGenerationFailureDetails(nodes: CanvasNodeData[], nodeIds: string[], fallback = "全部图片生成失败") {
    for (const id of nodeIds) {
        const details = nodes.find((node) => node.id === id)?.metadata?.errorDetails?.trim();
        if (details && details !== "全部图片生成失败" && details !== "部分图片生成失败") return details;
    }
    for (const id of nodeIds) {
        const details = nodes.find((node) => node.id === id)?.metadata?.errorDetails?.trim();
        if (details) return details;
    }
    return fallback;
}

function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
}

function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

function findCanvasNode(nodes: CanvasNodeData[] | Map<string, CanvasNodeData>, id: string) {
    return Array.isArray(nodes) ? nodes.find((item) => item.id === id) : nodes.get(id);
}

function isHiddenBatchChild(node: CanvasNodeData, nodes: CanvasNodeData[] | Map<string, CanvasNodeData>, collapsingBatchIds?: Set<string>) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = findCanvasNode(nodes, rootId);
    if (root && collapsingBatchIds?.has(rootId)) return false;
    return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function isHiddenBatchConnectionEndpoint(node: CanvasNodeData, nodes: CanvasNodeData[] | Map<string, CanvasNodeData>) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = findCanvasNode(nodes, rootId);
    return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? "正面视角" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
