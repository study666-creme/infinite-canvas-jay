import {
    CanvasNodeType,
    type CanvasNodeData,
    type CreativeActionKind,
    type CreativeActionStatus,
    type CreativeArtifactKind,
    type CreativeArtifactMetadata,
    type CreativeArtifactRecord,
    type CreativeArtifactStatus,
    type CreativeProjectAction,
    type CreativeProjectMode,
    type CreativeProductionType,
    type CreativeProjectStage,
    type CreativeProjectState,
} from "../types";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "./canvas-agent-ops";

export const CREATIVE_BLACKBOARD_TITLE = "项目黑板";
export const CREATIVE_STAGE_ORDER: CreativeProjectStage[] = ["brief", "story", "episodes", "script", "assets", "storyboard", "review", "preview", "generation", "rework"];
export const DEFAULT_CREATIVE_TARGETS: CreativeArtifactKind[] = ["character_assets", "scene_assets", "prop_assets", "storyboard"];

const GENERATED_ASSET_KINDS = new Set<CreativeArtifactKind>(["character_assets", "scene_assets", "prop_assets"]);
const NON_SUBSTANTIVE_NODE_PATCH_KEYS = new Set(["position", "width", "height", "metadata"]);
const NON_SUBSTANTIVE_NODE_METADATA_KEYS = new Set(["status", "errorDetails", "naturalWidth", "naturalHeight", "freeResize", "generationProgress", "generationStage"]);

export type CreativeArtifactUpdate = {
    id?: string;
    nodeId?: string;
    kind: CreativeArtifactKind;
    title?: string;
    status?: CreativeArtifactStatus;
    version?: number;
    ownerAgent?: string;
    userConfirmed?: boolean;
    qualityGate?: string[];
};

export type CreativeProjectStatePatch = {
    mode?: CreativeProjectMode;
    productionType?: CreativeProductionType;
    currentStage?: CreativeProjectStage;
    completion?: number;
    targetDeliverables?: CreativeArtifactKind[];
    confirmedConstants?: string[];
    activityConstraints?: string[];
    openQuestions?: string[];
    nextGap?: string;
    artifactUpdates?: CreativeArtifactUpdate[];
    pendingAction?: CreativeProjectAction | null;
    lastConfirmedActionId?: string;
    userConfirmed?: boolean;
};

export type CreativeToolActionInput = {
    id: string;
    toolNames: string[];
    ops?: CanvasAgentOp[];
    label?: string;
};

export function createInitialCreativeProjectState(): CreativeProjectState {
    return deriveCreativeProjectState([]);
}

export function reconcileCreativeProjectState(nodes: CanvasNodeData[], preferred?: CreativeProjectState | null): CreativeProjectState {
    const next = deriveCreativeProjectState(nodes, preferred);
    if (projectStateSemanticSignature(next) === projectStateSemanticSignature(preferred)) return next;
    const updatedAt = new Date().toISOString();
    return { ...next, updatedAt, recommendedAction: { ...next.recommendedAction, proposedAt: updatedAt } };
}

export function mirrorCreativeProjectBlackboard(nodes: CanvasNodeData[], state: CreativeProjectState): CanvasNodeData[] {
    const blackboard = nodes.find(isCreativeBlackboardNode);
    const content = renderCreativeProjectBlackboard(state);
    const artifactByNodeId = new Map(state.artifacts.flatMap((item) => (item.nodeId ? [[item.nodeId, item] as const] : [])));
    let changed = false;
    const next = nodes.map<CanvasNodeData>((node) => {
        if (blackboard && node.id === blackboard.id) {
            if (projectStateSemanticSignature(node.metadata?.creativeProjectState) === projectStateSemanticSignature(state) && node.metadata?.content === content) return node;
            changed = true;
            return {
                  ...node,
                  title: CREATIVE_BLACKBOARD_TITLE,
                  height: Math.max(node.height, 660),
                  metadata: {
                      ...node.metadata,
                      content,
                      status: "success" as const,
                      creativeProjectState: state,
                      creativeArtifact: {
                          kind: "project_blackboard",
                          version: Math.max(1, (node.metadata?.creativeArtifact?.version || 0) + 1),
                          status: state.awaitingUserConfirmation ? "review" : "approved",
                          ownerAgent: "总控 Agent",
                          userConfirmed: !state.awaitingUserConfirmation,
                          qualityGate: ["项目状态与画布产物一致", "活动约束只在存在时启用", "进入任何创作动作前等待用户确认"],
                          updatedAt: state.updatedAt,
                      },
                  },
              };
        }
        const record = artifactByNodeId.get(node.id);
        if (!record) return node;
        const artifact = artifactMetadataFromRecord(record);
        if (artifactMetadataSignature(node.metadata?.creativeArtifact) === artifactMetadataSignature(artifact)) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, creativeArtifact: artifact } };
    });
    return changed ? next : nodes;
}

export function deriveCreativeProjectState(nodes: CanvasNodeData[], preferred?: CreativeProjectState | null): CreativeProjectState {
    const blackboard = nodes.find(isCreativeBlackboardNode);
    const stored = objectRecord(preferred || blackboard?.metadata?.creativeProjectState);
    const targetDeliverables = normalizeArtifactKinds(stored.targetDeliverables, DEFAULT_CREATIVE_TARGETS);
    const priorArtifacts = normalizeArtifactRecords(stored.artifacts);
    const artifacts = collectCreativeArtifacts(nodes, priorArtifacts);
    const activityConstraints = normalizeStringList(stored.activityConstraints);
    const mode = normalizeMode(stored.mode, activityConstraints);
    const productionType = normalizeProductionType(stored.productionType, artifacts);
    const normalizedAction = normalizeAction(stored.pendingAction);
    const pendingAction = normalizedAction?.status === "awaiting_user_confirmation" ? normalizedAction : undefined;
    const recommendedAction = recommendCreativeProjectAction(artifacts, targetDeliverables, mode, productionType, normalizeStringList(stored.openQuestions), String(stored.updatedAt || ""));
    const currentStage = pendingAction?.status === "awaiting_user_confirmation" ? pendingAction.stage : inferCurrentStage(artifacts, normalizeStage(stored.currentStage));
    const awaitingUserConfirmation = pendingAction?.status === "awaiting_user_confirmation";

    return {
        schemaVersion: 2,
        mode,
        productionType,
        currentStage,
        completion: inferCompletion(artifacts, targetDeliverables),
        targetDeliverables,
        artifacts,
        confirmedConstants: normalizeStringList(stored.confirmedConstants),
        activityConstraints,
        openQuestions: normalizeStringList(stored.openQuestions),
        nextGap: pendingAction?.label || recommendedAction.label,
        recommendedAction,
        ...(pendingAction ? { pendingAction } : {}),
        ...(typeof stored.lastConfirmedActionId === "string" && stored.lastConfirmedActionId.trim() ? { lastConfirmedActionId: stored.lastConfirmedActionId.trim() } : {}),
        awaitingUserConfirmation,
        userConfirmed: stored.userConfirmed === true && !awaitingUserConfirmation,
        updatedAt: String(stored.updatedAt || ""),
    };
}

export function updateCreativeProjectBlackboardOps(snapshot: CanvasAgentSnapshot, patch: CreativeProjectStatePatch): CanvasAgentOp[] {
    const existing = snapshot.nodes.find(isCreativeBlackboardNode);
    const current = deriveCreativeProjectState(snapshot.nodes, snapshot.creativeProjectState);
    const updatedArtifacts = applyArtifactUpdates(current.artifacts, patch.artifactUpdates, snapshot.nodes);
    const pendingAction = patch.pendingAction === null ? undefined : normalizeAction(patch.pendingAction) || current.pendingAction;
    const activityConstraints = patch.activityConstraints === undefined ? current.activityConstraints : normalizeStringList(patch.activityConstraints);
    const targetDeliverables = patch.targetDeliverables === undefined ? current.targetDeliverables : normalizeArtifactKinds(patch.targetDeliverables, current.targetDeliverables);
    const mode = normalizeMode(patch.mode || current.mode, activityConstraints);
    const productionType = normalizeProductionType(patch.productionType || current.productionType, updatedArtifacts);
    const now = new Date().toISOString();
    const recommendedAction = recommendCreativeProjectAction(updatedArtifacts, targetDeliverables, mode, productionType, patch.openQuestions === undefined ? current.openQuestions : normalizeStringList(patch.openQuestions), now);
    const nextStage = pendingAction?.status === "awaiting_user_confirmation" ? pendingAction.stage : normalizeStage(patch.currentStage) || inferCurrentStage(updatedArtifacts, current.currentStage);
    const awaitingUserConfirmation = pendingAction?.status === "awaiting_user_confirmation";
    const next: CreativeProjectState = {
        schemaVersion: 2,
        mode,
        productionType,
        currentStage: nextStage,
        completion: patch.completion === undefined ? inferCompletion(updatedArtifacts, targetDeliverables) : clampCompletion(patch.completion),
        targetDeliverables,
        artifacts: updatedArtifacts,
        confirmedConstants: patch.confirmedConstants === undefined ? current.confirmedConstants : normalizeStringList(patch.confirmedConstants),
        activityConstraints,
        openQuestions: patch.openQuestions === undefined ? current.openQuestions : normalizeStringList(patch.openQuestions),
        nextGap: pendingAction?.label || String(patch.nextGap || recommendedAction.label).trim(),
        recommendedAction,
        ...(pendingAction ? { pendingAction } : {}),
        ...(patch.lastConfirmedActionId || current.lastConfirmedActionId ? { lastConfirmedActionId: patch.lastConfirmedActionId || current.lastConfirmedActionId } : {}),
        awaitingUserConfirmation,
        userConfirmed: patch.userConfirmed === true && !awaitingUserConfirmation,
        updatedAt: now,
    };
    const artifact: CreativeArtifactMetadata = {
        kind: "project_blackboard",
        version: Math.max(1, (existing?.metadata?.creativeArtifact?.version || 0) + 1),
        status: awaitingUserConfirmation ? "review" : "approved",
        ownerAgent: "总控 Agent",
        userConfirmed: !awaitingUserConfirmation,
        qualityGate: ["项目状态与画布产物一致", "活动约束只在存在时启用", "进入任何创作动作前等待用户确认"],
        updatedAt: now,
    };
    const metadata = { content: renderCreativeProjectBlackboard(next), status: "success" as const, fontSize: 14, creativeProjectState: next, creativeArtifact: artifact };
    const artifactMirrorOps = (patch.artifactUpdates || []).flatMap((update): CanvasAgentOp[] => {
        if (!update.nodeId) return [];
        const record = updatedArtifacts.find((item) => item.nodeId === update.nodeId && item.kind === update.kind);
        const node = snapshot.nodes.find((item) => item.id === update.nodeId);
        if (!record || !node) return [];
        return [{
            type: "update_node",
            id: node.id,
            metadata: {
                creativeArtifact: artifactMetadataFromRecord(record),
            },
        }];
    });
    const blackboardOp: CanvasAgentOp = existing
        ? { type: "update_node", id: existing.id, patch: { title: CREATIVE_BLACKBOARD_TITLE }, metadata }
        : { type: "add_node", id: `project-blackboard-${Date.now()}`, nodeType: CanvasNodeType.Text, title: CREATIVE_BLACKBOARD_TITLE, position: { x: nextCanvasX(snapshot), y: 0 }, width: 440, height: 660, metadata };
    return [...artifactMirrorOps, blackboardOp];
}

export function buildCreativeToolAction(snapshot: CanvasAgentSnapshot, input: CreativeToolActionInput): CreativeProjectAction {
    const state = deriveCreativeProjectState(snapshot.nodes, snapshot.creativeProjectState);
    const targetKinds = inferToolArtifactKinds(input.toolNames, input.ops, state);
    const stage = targetKinds.length ? artifactStage(targetKinds[0]) : state.recommendedAction.stage;
    const toolLabels = [...new Set(input.toolNames.map(creativeToolLabel).filter(Boolean))];
    return {
        id: input.id,
        kind: inferActionKind(input.toolNames, input.ops, stage),
        status: "awaiting_user_confirmation",
        stage,
        label: input.label?.trim() || `确认后${toolLabels.join("、") || state.recommendedAction.label}`,
        reason: state.recommendedAction.reason,
        ownerAgents: ownerAgentsForStage(stage),
        targetArtifactKinds: targetKinds.length ? targetKinds : state.recommendedAction.targetArtifactKinds,
        proposedAt: new Date().toISOString(),
    };
}

export function updateCreativeActionStatusOps(snapshot: CanvasAgentSnapshot, actionId: string, status: Exclude<CreativeActionStatus, "suggested" | "awaiting_user_confirmation">): CanvasAgentOp[] {
    const state = deriveCreativeProjectState(snapshot.nodes, snapshot.creativeProjectState);
    const action = state.pendingAction?.id === actionId ? state.pendingAction : undefined;
    if (!action) return [];
    return updateCreativeProjectBlackboardOps(snapshot, {
        pendingAction: null,
        ...(status === "approved" || status === "executed" ? { lastConfirmedActionId: actionId, userConfirmed: true } : { userConfirmed: false }),
    });
}

export function isSubstantiveCreativeOps(ops?: CanvasAgentOp[]) {
    return (ops || []).some((op) => {
        if (op.type === "set_viewport" || op.type === "select_nodes") return false;
        if (op.type !== "update_node") return true;

        const patchKeys = Object.keys(op.patch || {});
        if (patchKeys.some((key) => !NON_SUBSTANTIVE_NODE_PATCH_KEYS.has(key))) return true;

        const metadataKeys = [...Object.keys(op.patch?.metadata || {}), ...Object.keys(op.metadata || {})];
        return metadataKeys.some((key) => !NON_SUBSTANTIVE_NODE_METADATA_KEYS.has(key));
    });
}

export function renderCreativeProjectBlackboard(state: CreativeProjectState) {
    const artifactLines = state.artifacts.length
        ? state.artifacts.slice(-12).map((item) => `- ${artifactLabel(item.kind)} v${item.version}｜${artifactStatusLabel(item.status)}${item.userConfirmed ? "｜已确认" : ""}`)
        : ["- 暂无已识别产物"];
    const pending = state.pendingAction?.status === "awaiting_user_confirmation" ? `等待确认：${state.pendingAction.label}\n负责：${state.pendingAction.ownerAgents.join("、")}` : "无待确认执行动作";
    return `项目模式：${state.mode === "activity" ? "活动/参赛约束" : "常规创作"}\n创作形态：${productionTypeLabel(state.productionType)}\n当前工作区：${stageLabel(state.currentStage)}\n目标完成度：${state.completion}%\n执行状态：${pending}\n\n目标产物：\n${listText(state.targetDeliverables.map(artifactLabel))}\n\n已有产物：\n${artifactLines.join("\n")}\n\n活动约束：\n${listText(state.activityConstraints)}\n\n已确认常量：\n${listText(state.confirmedConstants)}\n\n待确认问题：\n${listText(state.openQuestions)}\n\n建议下一步（不会自动执行）：\n- ${state.recommendedAction.label}\n- 原因：${state.recommendedAction.reason}\n- 负责：${state.recommendedAction.ownerAgents.join("、")}\n\n更新时间：${state.updatedAt || "尚未写入"}`;
}

export function isCreativeBlackboardNode(node: CanvasNodeData) {
    return node.metadata?.creativeArtifact?.kind === "project_blackboard" || node.title.trim() === CREATIVE_BLACKBOARD_TITLE;
}

function collectCreativeArtifacts(nodes: CanvasNodeData[], prior: CreativeArtifactRecord[]) {
    const collected = dedupeArtifacts(prior);
    const priorByNodeId = new Map(collected.flatMap((item, index) => (item.nodeId ? [[item.nodeId, { item, index }] as const] : [])));
    const priorIds = new Set(collected.map((item) => item.id));
    nodes.forEach((node) => {
        if (isCreativeBlackboardNode(node)) return;
        const metadata = node.metadata?.creativeArtifact;
        const kind = normalizeArtifactKind(metadata?.kind) || inferArtifactKind(node.title);
        if (!kind || kind === "project_blackboard") return;
        const id = `artifact:${node.id}`;
        const fingerprint = artifactContentFingerprint(node);
        const previous = priorByNodeId.get(node.id);
        if (previous) {
            if (previous.item.contentFingerprint && previous.item.contentFingerprint !== fingerprint) {
                collected[previous.index] = {
                    ...previous.item,
                    title: node.title || previous.item.title,
                    version: previous.item.version + 1,
                    status: inferNodeArtifactStatus(node),
                    userConfirmed: false,
                    contentFingerprint: fingerprint,
                    updatedAt: new Date().toISOString(),
                };
            } else if (!previous.item.contentFingerprint) {
                collected[previous.index] = { ...previous.item, contentFingerprint: fingerprint };
            }
            return;
        }
        if (priorIds.has(id)) return;
        const inferredStatus = normalizeArtifactStatus(metadata?.status) || inferNodeArtifactStatus(node);
        const userConfirmed = metadata?.userConfirmed === true;
        const status = userConfirmed ? "approved" : inferredStatus === "approved" ? "review" : inferredStatus;
        collected.push({
            id,
            nodeId: node.id,
            kind,
            title: node.title || artifactLabel(kind),
            version: Math.max(1, Number(metadata?.version || 1)),
            status,
            ownerAgent: metadata?.ownerAgent || ownerAgentsForStage(artifactStage(kind))[0],
            userConfirmed,
            contentFingerprint: fingerprint,
            qualityGate: normalizeStringList(metadata?.qualityGate),
            updatedAt: metadata?.updatedAt,
            source: metadata ? "node_metadata" : "title_inference",
        });
        priorByNodeId.set(node.id, { item: collected[collected.length - 1], index: collected.length - 1 });
        priorIds.add(id);
    });
    return dedupeArtifacts(collected);
}

function applyArtifactUpdates(artifacts: CreativeArtifactRecord[], updates: CreativeArtifactUpdate[] | undefined, nodes: CanvasNodeData[]) {
    if (!updates?.length) return artifacts;
    const next = [...artifacts];
    updates.forEach((update) => {
        const index = next.findIndex((item) => (update.id && item.id === update.id) || (update.nodeId && item.nodeId === update.nodeId) || (!update.nodeId && item.kind === update.kind));
        const current = index >= 0 ? next[index] : undefined;
        const node = update.nodeId ? nodes.find((item) => item.id === update.nodeId) : undefined;
        const nextVersion = Math.max(1, Math.floor(update.version || current?.version || 1));
        const changedVersion = Boolean(current && nextVersion !== current.version);
        const requestedStatus = normalizeArtifactStatus(update.status) || current?.status || "draft";
        const userConfirmed = update.userConfirmed === true || (update.userConfirmed === undefined && !changedVersion && !update.status && current?.userConfirmed === true);
        const status = userConfirmed ? "approved" : requestedStatus === "approved" ? "review" : requestedStatus;
        const record: CreativeArtifactRecord = {
            id: update.id || current?.id || `artifact:${update.nodeId || `${update.kind}:${next.length + 1}`}`,
            ...(update.nodeId || current?.nodeId ? { nodeId: update.nodeId || current?.nodeId } : {}),
            kind: update.kind,
            title: update.title || node?.title || current?.title || artifactLabel(update.kind),
            version: nextVersion,
            status,
            ownerAgent: update.ownerAgent || current?.ownerAgent || ownerAgentsForStage(artifactStage(update.kind))[0],
            userConfirmed,
            contentFingerprint: node ? artifactContentFingerprint(node) : current?.contentFingerprint,
            qualityGate: normalizeStringList(update.qualityGate || current?.qualityGate),
            updatedAt: new Date().toISOString(),
            source: "declared",
        };
        if (index >= 0) next[index] = record;
        else next.push(record);
    });
    return dedupeArtifacts(next);
}

function recommendCreativeProjectAction(artifacts: CreativeArtifactRecord[], targets: CreativeArtifactKind[], mode: CreativeProjectMode, productionType: CreativeProductionType, openQuestions: string[], now: string): CreativeProjectAction {
    const make = (kind: CreativeActionKind, stage: CreativeProjectStage, label: string, reason: string, targetArtifactKinds: CreativeArtifactKind[]): CreativeProjectAction => ({
        id: `suggested:${kind}:${stage}`,
        kind,
        status: "suggested",
        stage,
        label,
        reason,
        ownerAgents: ownerAgentsForStage(stage),
        targetArtifactKinds,
        proposedAt: now,
    });
    const meaningful = artifacts.filter((item) => item.kind !== "project_blackboard");
    const approved = new Set(meaningful.filter((item) => item.status === "approved" && item.userConfirmed).map((item) => item.kind));
    const assetTargets = targets.filter(isAssetKind);
    const missingAsset = assetTargets.find((kind) => !approved.has(kind));
    const latestApprovedStageIndex = meaningful.reduce((latest, item) => {
        if (item.status !== "approved" || !item.userConfirmed) return latest;
        return Math.max(latest, CREATIVE_STAGE_ORDER.indexOf(artifactStage(item.kind)));
    }, -1);
    const relevant = meaningful.filter((item) => {
        if (item.status === "approved" && item.userConfirmed) return true;
        if (approved.has(item.kind)) return false;
        if (item.kind === "asset_manifest" && !targets.includes("asset_manifest") && !missingAsset) return false;
        if (targets.includes(item.kind)) return true;
        return CREATIVE_STAGE_ORDER.indexOf(artifactStage(item.kind)) >= latestApprovedStageIndex;
    });
    const unresolved = [...relevant]
        .filter((item) => item.status !== "approved" || !item.userConfirmed)
        .sort((a, b) => CREATIVE_STAGE_ORDER.indexOf(artifactStage(b.kind)) - CREATIVE_STAGE_ORDER.indexOf(artifactStage(a.kind)))[0];
    if (unresolved) {
        const blocked = unresolved.status === "blocked";
        return make(blocked ? "revise" : "review", artifactStage(unresolved.kind), `${blocked ? "修正" : "确认"}${artifactLabel(unresolved.kind)}「${unresolved.title}」`, blocked ? "该产物处于阻塞状态，先局部修正再决定是否继续。" : "该产物尚未得到用户确认，不能据此自动进入后续环节。", [unresolved.kind]);
    }

    const missingTarget = targets.find((kind) => !approved.has(kind));
    if (approved.has("video_batch")) return make("ready", "generation", "检查成片并决定验收或局部返工", "已有视频成片，下一步取决于用户观看后的具体反馈。", ["video_batch", "rework_log"]);
    if (approved.has("storyboard")) {
        if (targets.includes("storyboard_review") && !approved.has("storyboard_review")) return make("review", "review", "进行分镜连续性、空间和可生成性二审", "文字分镜已确认，但目标中要求独立审核。", ["storyboard_review"]);
        if (targets.includes("preview_grid") && !approved.has("preview_grid")) return make("generate", "preview", "生成分镜预览批次并由用户检查", "文字分镜已确认，预览只用于检查，不约束最终视频生成。", ["preview_grid"]);
        if (targets.includes("video_batch") && !approved.has("video_batch")) return make("generate", "generation", "用文字分镜和已确认参考资产生成视频", "视频是目标产物，且文字分镜已经确认。", ["video_batch"]);
        if (!missingTarget) return make("ready", "storyboard", "当前目标产物已齐，等待用户决定扩展或生成视频", "目标产物均已确认，不自动附加下一阶段。", []);
    }
    if (approved.has("script")) {
        if (missingAsset && !approved.has("asset_manifest")) return make("create", "assets", "从已确认剧本提取实际出现的资产清单", "仍有目标资产需要生成，先建立稳定 ID、用途和一致性要求。", ["asset_manifest"]);
        if (missingAsset) return make("generate", "assets", `制作${artifactLabel(missingAsset)}参考图并等待用户选定`, "只补当前目标中缺失的资产，不默认生成全部角度图。", [missingAsset]);
        if (!approved.has("storyboard")) return make("create", "storyboard", "按单集时长和动作连续性制作文字分镜", "剧本与所需资产均已确认，可以开始按可生成视频段落拆分。", ["storyboard"]);
    }
    if (approved.has("episodes")) return make("create", "script", "选择一集扩写为目标时长的可拍剧本", "分集骨架已经确认，但具体写哪一集仍由用户决定。", ["script"]);
    if (approved.has("story")) {
        if (productionType === "series") return make("create", "episodes", "为 AI 短剧规划首批分集骨架", "分集短剧需要管理集间推进、钩子和跨集一致性；首批默认只做到足够验证方向。", ["episodes"]);
        if (productionType === "short_film") return make("create", "script", "把故事骨架扩写为单片完整剧本", "AI 短片只需完成一个作品闭环，不强制前三集、集尾钩子或连载结构。", ["script"]);
        return make("choose", "brief", "确认创作形态是 AI 短剧（分集）还是 AI 短片（单片）", "故事骨架已确认，但分集与单片需要不同的结构、资产和审核策略。", ["episodes", "script"]);
    }
    if (approved.has("activity_constraints") || mode === "activity") return make("create", "story", "根据活动约束提出故事方向，确认后再扩展", "活动要求属于本次创作约束，不是独立知识库或固定 Agent。", ["story"]);
    if (relevant.length) return make("choose", inferCurrentStage(relevant, "brief"), "说明要沿用、审核还是改写现有材料", "画布已有材料，但缺少用户对其用途和确认状态的判断。", [...new Set(relevant.map((item) => item.kind))]);
    return make("clarify", "brief", openQuestions.length ? "先回答项目黑板中的待确认问题" : productionType === "unspecified" ? "说明要做 AI 短剧（分集）还是 AI 短片（单片），并提供任意已有材料" : "提供点子、故事、剧本、活动要求或现有资产中的任意一种", "当前没有可据以继续的已确认产物，Agent 只建议入口，不自动创作。", []);
}

function inferToolArtifactKinds(toolNames: string[], ops: CanvasAgentOp[] | undefined, state: CreativeProjectState) {
    const kinds: CreativeArtifactKind[] = [];
    const add = (kind?: CreativeArtifactKind) => {
        if (kind && kind !== "project_blackboard" && !kinds.includes(kind)) kinds.push(kind);
    };
    (ops || []).forEach((op) => {
        if (op.type === "run_generation") {
            if (op.mode === "video") add("video_batch");
            if (op.mode === "image") add(state.recommendedAction.targetArtifactKinds.find((kind) => ["character_assets", "scene_assets", "prop_assets", "preview_grid"].includes(kind)) || "character_assets");
            if (op.mode === "text") state.recommendedAction.targetArtifactKinds.forEach(add);
        }
        if (op.type === "add_node" || op.type === "update_node") {
            const metadata = op.type === "add_node" ? op.metadata : { ...op.patch?.metadata, ...op.metadata };
            add(normalizeArtifactKind(metadata?.creativeArtifact?.kind));
            const title = op.type === "add_node" ? op.title : op.patch?.title;
            if (title) add(inferArtifactKind(title));
        }
    });
    toolNames.forEach((name) => {
        if (name === "canvas_generate_video") add("video_batch");
        if (name === "canvas_generate_image" || name === "canvas_create_image_prompt_flow") state.recommendedAction.targetArtifactKinds.forEach(add);
        if (name === "canvas_director_capture_all" || name === "canvas_director_capture_shot") add("preview_grid");
    });
    return kinds;
}

function inferActionKind(toolNames: string[], ops: CanvasAgentOp[] | undefined, stage: CreativeProjectStage): CreativeActionKind {
    if (toolNames.some((name) => name.includes("generate") || name.includes("capture")) || (ops || []).some((op) => op.type === "run_generation")) return "generate";
    if (toolNames.some((name) => name.includes("delete"))) return "revise";
    if (stage === "review" || toolNames.some((name) => name.includes("review"))) return "review";
    return "create";
}

function inferCurrentStage(artifacts: Array<Pick<CreativeArtifactRecord, "kind">>, fallback: CreativeProjectStage = "brief") {
    return artifacts.reduce<CreativeProjectStage>((best, artifact) => {
        const stage = artifactStage(artifact.kind);
        return CREATIVE_STAGE_ORDER.indexOf(stage) > CREATIVE_STAGE_ORDER.indexOf(best) ? stage : best;
    }, fallback);
}

function inferCompletion(artifacts: CreativeArtifactRecord[], targets: CreativeArtifactKind[]) {
    if (!targets.length) return 0;
    const score = targets.reduce((total, kind) => {
        const matches = artifacts.filter((item) => item.kind === kind);
        if (matches.some((item) => item.status === "approved" && item.userConfirmed)) return total + 1;
        if (matches.length) return total + 0.5;
        return total;
    }, 0);
    return Math.round((score / targets.length) * 100);
}

function inferNodeArtifactStatus(node: CanvasNodeData): CreativeArtifactStatus {
    if (node.metadata?.status === "error") return "blocked";
    if (node.metadata?.status === "loading") return "draft";
    return node.metadata?.content || node.metadata?.composerContent || node.metadata?.prompt ? "review" : "draft";
}

export function inferArtifactKind(title: string): CreativeArtifactKind | undefined {
    if (/项目黑板/.test(title)) return "project_blackboard";
    if (/活动约束|参赛要求|活动规则/.test(title)) return "activity_constraints";
    if (/分镜审核|二次分镜|连续性审核|空间审核/.test(title)) return "storyboard_review";
    if (/25宫格|二十五宫格|分镜预览/.test(title)) return "preview_grid";
    if (/视频生成|生成批次|成片/.test(title)) return "video_batch";
    if (/角色资产|人物资产|角色三视图/.test(title)) return "character_assets";
    if (/场景资产|场景多角度/.test(title)) return "scene_assets";
    if (/道具资产|道具多角度/.test(title)) return "prop_assets";
    if (/资产清单|资产提示词/.test(title)) return "asset_manifest";
    if (/文字分镜|分镜提示词|分镜/.test(title)) return "storyboard";
    if (/前三集|分集剧情/.test(title)) return "episodes";
    if (/单集剧本|剧本/.test(title)) return "script";
    if (/故事骨架|故事总纲|故事设定/.test(title)) return "story";
    if (/返工|问题镜头/.test(title)) return "rework_log";
    return undefined;
}

export function artifactStage(kind?: CreativeArtifactKind): CreativeProjectStage {
    if (kind === "activity_constraints") return "brief";
    if (kind === "story") return "story";
    if (kind === "episodes") return "episodes";
    if (kind === "script") return "script";
    if (kind === "asset_manifest" || kind === "character_assets" || kind === "scene_assets" || kind === "prop_assets") return "assets";
    if (kind === "storyboard") return "storyboard";
    if (kind === "storyboard_review") return "review";
    if (kind === "preview_grid") return "preview";
    if (kind === "video_batch") return "generation";
    if (kind === "rework_log") return "rework";
    return "brief";
}

export function stageLabel(stage: CreativeProjectStage) {
    return ({ brief: "需求与约束", story: "故事骨架", episodes: "分集规划", script: "单集剧本", assets: "资产确立", storyboard: "文字分镜", review: "分镜审核", preview: "分镜预览", generation: "视频生成", rework: "返工复盘" })[stage];
}

export function artifactLabel(kind: CreativeArtifactKind) {
    return ({ project_blackboard: "项目黑板", activity_constraints: "活动约束", story: "故事骨架", episodes: "分集剧情", script: "单集剧本", asset_manifest: "资产清单", character_assets: "角色资产", scene_assets: "场景资产", prop_assets: "道具资产", storyboard: "文字分镜", storyboard_review: "分镜审核", preview_grid: "分镜预览", video_batch: "视频成片", rework_log: "返工记录" })[kind];
}

function artifactStatusLabel(status: CreativeArtifactStatus) {
    return ({ missing: "缺失", draft: "草稿", review: "待审核", approved: "已确认", blocked: "受阻" })[status];
}

function isAssetKind(kind: CreativeArtifactKind) {
    return GENERATED_ASSET_KINDS.has(kind);
}

function ownerAgentsForStage(stage: CreativeProjectStage) {
    return ({
        brief: ["总控 Agent", "活动约束分析 Agent"],
        story: ["故事策划 Agent", "总控 Agent"],
        episodes: ["分集策划 Agent", "故事审核 Agent"],
        script: ["编剧 Agent", "人物与对白 Agent"],
        assets: ["资产导演 Agent", "视觉设计 Agent"],
        storyboard: ["分镜导演 Agent", "AI 视频提示词 Agent"],
        review: ["连续性与空间审核 Agent", "平台风险审核 Agent"],
        preview: ["预览编排 Agent", "总控 Agent"],
        generation: ["视频生成 Agent", "一致性监督 Agent"],
        rework: ["问题诊断 Agent", "对应环节 Agent"],
    } as Record<CreativeProjectStage, string[]>)[stage];
}

function creativeToolLabel(name: string) {
    if (name.includes("generate_video")) return "生成视频";
    if (name.includes("generate_image") || name.includes("image_prompt_flow")) return "生成图片";
    if (name.includes("generate_text")) return "生成文本";
    if (name.includes("capture")) return "生成预览图";
    if (name.includes("update_project_blackboard")) return "更新项目状态";
    if (name.includes("update")) return "修改现有产物";
    if (name.includes("delete")) return "删除产物";
    if (name.includes("create") || name.includes("apply_ops")) return "创建或调整产物";
    return "";
}

function normalizeArtifactRecords(value: unknown): CreativeArtifactRecord[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): CreativeArtifactRecord[] => {
        const record = objectRecord(item);
        const kind = normalizeArtifactKind(record.kind);
        const rawStatus = normalizeArtifactStatus(record.status);
        if (!kind || kind === "project_blackboard" || !rawStatus) return [];
        const nodeId = typeof record.nodeId === "string" && record.nodeId.trim() ? record.nodeId.trim() : undefined;
        const userConfirmed = record.userConfirmed === true;
        const status = userConfirmed ? "approved" : rawStatus === "approved" ? "review" : rawStatus;
        return [{
            id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `artifact:${nodeId || kind}`,
            ...(nodeId ? { nodeId } : {}),
            kind,
            title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : artifactLabel(kind),
            version: Math.max(1, Math.floor(Number(record.version) || 1)),
            status,
            ownerAgent: typeof record.ownerAgent === "string" ? record.ownerAgent : undefined,
            userConfirmed,
            contentFingerprint: typeof record.contentFingerprint === "string" ? record.contentFingerprint : undefined,
            qualityGate: normalizeStringList(record.qualityGate),
            updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
            source: record.source === "node_metadata" || record.source === "title_inference" ? record.source : "declared",
        }];
    });
}

function normalizeAction(value: unknown): CreativeProjectAction | undefined {
    const action = objectRecord(value);
    const kind = normalizeActionKind(action.kind);
    const status = normalizeActionStatus(action.status);
    const stage = normalizeStage(action.stage);
    if (!kind || !status || !stage || typeof action.id !== "string" || typeof action.label !== "string") return undefined;
    return {
        id: action.id,
        kind,
        status,
        stage,
        label: action.label.trim(),
        reason: typeof action.reason === "string" ? action.reason.trim() : "由当前产物缺口触发",
        ownerAgents: normalizeStringList(action.ownerAgents),
        targetArtifactKinds: normalizeArtifactKinds(action.targetArtifactKinds, []),
        proposedAt: typeof action.proposedAt === "string" ? action.proposedAt : "",
        ...(typeof action.decidedAt === "string" ? { decidedAt: action.decidedAt } : {}),
    };
}

function normalizeMode(value: unknown, activityConstraints: string[]): CreativeProjectMode {
    return value === "activity" || activityConstraints.length ? "activity" : "standard";
}

function normalizeProductionType(value: unknown, artifacts: CreativeArtifactRecord[]): CreativeProductionType {
    if (value === "series" || value === "short_film") return value;
    if (artifacts.some((artifact) => artifact.kind === "episodes")) return "series";
    if (artifacts.some((artifact) => artifact.kind === "script" && /短片|单片/.test(artifact.title))) return "short_film";
    return "unspecified";
}

function normalizeStage(value: unknown): CreativeProjectStage | undefined {
    return CREATIVE_STAGE_ORDER.includes(value as CreativeProjectStage) ? (value as CreativeProjectStage) : undefined;
}

function normalizeArtifactKind(value: unknown): CreativeArtifactKind | undefined {
    const kinds: CreativeArtifactKind[] = ["project_blackboard", "activity_constraints", "story", "episodes", "script", "asset_manifest", "character_assets", "scene_assets", "prop_assets", "storyboard", "storyboard_review", "preview_grid", "video_batch", "rework_log"];
    return kinds.includes(value as CreativeArtifactKind) ? (value as CreativeArtifactKind) : undefined;
}

function normalizeArtifactKinds(value: unknown, fallback: CreativeArtifactKind[]) {
    if (!Array.isArray(value)) return [...fallback];
    const result = [...new Set(value.map(normalizeArtifactKind).filter((item): item is CreativeArtifactKind => Boolean(item && item !== "project_blackboard")))];
    return result.length ? result : [...fallback];
}

function normalizeArtifactStatus(value: unknown): CreativeArtifactStatus | undefined {
    return value === "missing" || value === "draft" || value === "review" || value === "approved" || value === "blocked" ? value : undefined;
}

function normalizeActionKind(value: unknown): CreativeActionKind | undefined {
    return value === "clarify" || value === "choose" || value === "create" || value === "review" || value === "revise" || value === "generate" || value === "ready" ? value : undefined;
}

function normalizeActionStatus(value: unknown): CreativeActionStatus | undefined {
    return value === "suggested" || value === "awaiting_user_confirmation" || value === "approved" || value === "rejected" || value === "executed" ? value : undefined;
}

function clampCompletion(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function normalizeStringList(value: unknown) {
    return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 40) : [];
}

function dedupeArtifacts(artifacts: CreativeArtifactRecord[]) {
    const byId = new Map<string, CreativeArtifactRecord>();
    artifacts.forEach((item) => byId.set(item.id, item));
    return [...byId.values()].slice(0, 120);
}

function objectRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function projectStateSemanticSignature(value: unknown) {
    const state = objectRecord(value);
    const artifacts = Array.isArray(state.artifacts)
        ? state.artifacts.map((item) => {
              const artifact = objectRecord(item);
              return [artifact.id, artifact.nodeId, artifact.kind, artifact.version, artifact.status, artifact.userConfirmed, artifact.title, artifact.contentFingerprint, artifact.ownerAgent, artifact.qualityGate, artifact.updatedAt];
          })
        : [];
    const pending = objectRecord(state.pendingAction);
    const recommended = objectRecord(state.recommendedAction);
    return JSON.stringify({
        schemaVersion: state.schemaVersion,
        mode: state.mode,
        productionType: state.productionType,
        currentStage: state.currentStage,
        completion: state.completion,
        targetDeliverables: state.targetDeliverables,
        artifacts,
        confirmedConstants: state.confirmedConstants,
        activityConstraints: state.activityConstraints,
        openQuestions: state.openQuestions,
        nextGap: state.nextGap,
        recommendedAction: [recommended.id, recommended.kind, recommended.status, recommended.stage, recommended.label, recommended.reason, recommended.ownerAgents, recommended.targetArtifactKinds],
        pendingAction: [pending.id, pending.kind, pending.status, pending.stage, pending.label, pending.reason, pending.ownerAgents, pending.targetArtifactKinds, pending.proposedAt, pending.decidedAt],
        lastConfirmedActionId: state.lastConfirmedActionId,
        awaitingUserConfirmation: state.awaitingUserConfirmation,
    });
}

function artifactContentFingerprint(node: CanvasNodeData) {
    const value = JSON.stringify([
        node.title,
        node.type,
        node.metadata?.content || "",
        node.metadata?.composerContent || "",
        node.metadata?.prompt || "",
        node.metadata?.storageKey || "",
        node.metadata?.videoTaskId || "",
    ]);
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return `${value.length}:${(hash >>> 0).toString(36)}`;
}

function artifactMetadataFromRecord(record: CreativeArtifactRecord): CreativeArtifactMetadata {
    return {
        kind: record.kind,
        version: record.version,
        status: record.status,
        ownerAgent: record.ownerAgent,
        userConfirmed: record.userConfirmed,
        qualityGate: record.qualityGate,
        updatedAt: record.updatedAt,
    };
}

function artifactMetadataSignature(value: CreativeArtifactMetadata | undefined) {
    if (!value) return "";
    return JSON.stringify([value.kind, value.version, value.status, value.ownerAgent, value.userConfirmed, value.qualityGate, value.updatedAt]);
}

function listText(items: string[]) {
    return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

function productionTypeLabel(value: CreativeProductionType) {
    if (value === "series") return "AI 短剧（分集）";
    if (value === "short_film") return "AI 短片（单片）";
    return "待判断";
}

function nextCanvasX(snapshot: CanvasAgentSnapshot) {
    return snapshot.nodes.length ? Math.max(...snapshot.nodes.map((node) => node.position.x + node.width)) + 80 : 0;
}
