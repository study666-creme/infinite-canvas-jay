export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";
export type CreativeProjectStage = "brief" | "story" | "episodes" | "script" | "assets" | "storyboard" | "review" | "preview" | "generation" | "rework";
export type CreativeArtifactStatus = "missing" | "draft" | "review" | "approved" | "blocked";
export type CreativeArtifactKind = "project_blackboard" | "activity_constraints" | "story" | "episodes" | "script" | "asset_manifest" | "character_assets" | "scene_assets" | "prop_assets" | "storyboard" | "storyboard_review" | "preview_grid" | "video_batch" | "rework_log";
export type CreativeProjectMode = "standard" | "activity";
export type CreativeProductionType = "unspecified" | "series" | "short_film";
export type CreativeActionKind = "clarify" | "choose" | "create" | "review" | "revise" | "generate" | "ready";
export type CreativeActionStatus = "suggested" | "awaiting_user_confirmation" | "approved" | "rejected" | "executed";

export type CreativeArtifactMetadata = {
    kind: CreativeArtifactKind;
    version: number;
    status: CreativeArtifactStatus;
    ownerAgent?: string;
    userConfirmed?: boolean;
    qualityGate?: string[];
    updatedAt?: string;
};

export type CreativeArtifactRecord = CreativeArtifactMetadata & {
    id: string;
    nodeId?: string;
    title: string;
    contentFingerprint?: string;
    source: "declared" | "node_metadata" | "title_inference";
};

export type CreativeProjectAction = {
    id: string;
    kind: CreativeActionKind;
    status: CreativeActionStatus;
    stage: CreativeProjectStage;
    label: string;
    reason: string;
    ownerAgents: string[];
    targetArtifactKinds: CreativeArtifactKind[];
    proposedAt: string;
    decidedAt?: string;
};

export type CreativeProjectState = {
    schemaVersion: 2;
    mode: CreativeProjectMode;
    productionType: CreativeProductionType;
    currentStage: CreativeProjectStage;
    completion: number;
    targetDeliverables: CreativeArtifactKind[];
    artifacts: CreativeArtifactRecord[];
    confirmedConstants: string[];
    activityConstraints: string[];
    openQuestions: string[];
    nextGap: string;
    recommendedAction: CreativeProjectAction;
    pendingAction?: CreativeProjectAction;
    lastConfirmedActionId?: string;
    awaitingUserConfirmation: boolean;
    /** @deprecated Use awaitingUserConfirmation and artifact-level approval. */
    userConfirmed: boolean;
    updatedAt: string;
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    videoReferenceAssets?: Array<{
        kind: "image" | "video" | "audio";
        label: string;
        previewUrl?: string;
        nodeId: string;
        title: string;
    }>;
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    isGroupRoot?: boolean;
    groupRootId?: string;
    groupMemberIds?: string[];
    groupColor?: string;
    groupName?: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    videoTaskId?: string;
    videoProvider?: "openai" | "seedance" | "xai";
    generationProgress?: number;
    generationStage?: string;
    creativeArtifact?: CreativeArtifactMetadata;
    creativeProjectState?: CreativeProjectState;
    directorStage?: {
        shotId: string;
        slot: number;
        dramaticFunction?: string;
        source?: "3d-director-stage";
        batchId?: string;
    };
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    creativeMode?: "general" | "short_drama";
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "canvas";
          x: number;
          y: number;
          worldX: number;
          worldY: number;
      }
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
          worldX: number;
          worldY: number;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
