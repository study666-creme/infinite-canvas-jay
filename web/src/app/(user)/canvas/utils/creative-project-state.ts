import { CanvasNodeType, type CanvasNodeData, type CreativeArtifactKind, type CreativeArtifactMetadata, type CreativeProjectStage, type CreativeProjectState } from "../types";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "./canvas-agent-ops";

export const CREATIVE_BLACKBOARD_TITLE = "项目黑板";

export type CreativeProjectStatePatch = {
    currentStage?: CreativeProjectStage;
    completion?: number;
    confirmedConstants?: string[];
    activityConstraints?: string[];
    openQuestions?: string[];
    nextGap?: string;
    userConfirmed?: boolean;
};

const stageOrder: CreativeProjectStage[] = ["brief", "story", "episodes", "script", "assets", "storyboard", "review", "preview", "generation", "rework"];

export function deriveCreativeProjectState(nodes: CanvasNodeData[]): CreativeProjectState {
    const blackboard = nodes.find(isCreativeBlackboardNode);
    const stored = blackboard?.metadata?.creativeProjectState;
    const inferredStage = inferCurrentStage(nodes);
    const now = stored?.updatedAt || "";
    return {
        schemaVersion: 1,
        currentStage: normalizeStage(stored?.currentStage) || inferredStage,
        completion: clampCompletion(stored?.completion ?? inferCompletion(nodes, inferredStage)),
        confirmedConstants: normalizeStringList(stored?.confirmedConstants),
        activityConstraints: normalizeStringList(stored?.activityConstraints),
        openQuestions: normalizeStringList(stored?.openQuestions),
        nextGap: String(stored?.nextGap || inferNextGap(nodes, inferredStage)),
        userConfirmed: stored?.userConfirmed === true,
        updatedAt: now,
    };
}

export function updateCreativeProjectBlackboardOps(snapshot: CanvasAgentSnapshot, patch: CreativeProjectStatePatch): CanvasAgentOp[] {
    const existing = snapshot.nodes.find(isCreativeBlackboardNode);
    const current = deriveCreativeProjectState(snapshot.nodes);
    const nextStage = normalizeStage(patch.currentStage) || current.currentStage;
    const next: CreativeProjectState = {
        ...current,
        ...patch,
        schemaVersion: 1,
        currentStage: nextStage,
        completion: clampCompletion(patch.completion ?? current.completion),
        confirmedConstants: patch.confirmedConstants ? normalizeStringList(patch.confirmedConstants) : current.confirmedConstants,
        activityConstraints: patch.activityConstraints ? normalizeStringList(patch.activityConstraints) : current.activityConstraints,
        openQuestions: patch.openQuestions ? normalizeStringList(patch.openQuestions) : current.openQuestions,
        nextGap: String(patch.nextGap ?? (nextStage !== current.currentStage ? inferNextGap(snapshot.nodes, nextStage) : current.nextGap)).trim(),
        userConfirmed: patch.userConfirmed ?? current.userConfirmed,
        updatedAt: new Date().toISOString(),
    };
    const artifact: CreativeArtifactMetadata = {
        kind: "project_blackboard",
        version: Math.max(1, (existing?.metadata?.creativeArtifact?.version || 0) + 1),
        status: next.userConfirmed ? "approved" : "draft",
        ownerAgent: "coordinator",
        userConfirmed: next.userConfirmed,
        qualityGate: ["阶段与现有画布成果一致", "活动硬约束已记录", "下一缺口明确"],
        updatedAt: next.updatedAt,
    };
    const metadata = { content: renderCreativeProjectBlackboard(next), status: "success" as const, fontSize: 14, creativeProjectState: next, creativeArtifact: artifact };
    if (existing) return [{ type: "update_node", id: existing.id, patch: { title: CREATIVE_BLACKBOARD_TITLE }, metadata }];
    return [{ type: "add_node", id: `project-blackboard-${Date.now()}`, nodeType: CanvasNodeType.Text, title: CREATIVE_BLACKBOARD_TITLE, position: { x: nextCanvasX(snapshot), y: 0 }, width: 420, height: 520, metadata }];
}

export function renderCreativeProjectBlackboard(state: CreativeProjectState) {
    return `当前阶段：${stageLabel(state.currentStage)}\n完成度：${state.completion}%\n用户已确认：${state.userConfirmed ? "是" : "否"}\n\n活动约束：\n${listText(state.activityConstraints)}\n\n已确认常量：\n${listText(state.confirmedConstants)}\n\n待确认问题：\n${listText(state.openQuestions)}\n\n下一缺口：\n${state.nextGap || "由总控根据当前成果判断"}\n\n更新时间：${state.updatedAt || "尚未写入"}`;
}

export function isCreativeBlackboardNode(node: CanvasNodeData) {
    return node.metadata?.creativeArtifact?.kind === "project_blackboard" || node.title.trim() === CREATIVE_BLACKBOARD_TITLE;
}

function inferCurrentStage(nodes: CanvasNodeData[]): CreativeProjectStage {
    let best: CreativeProjectStage = "brief";
    nodes.forEach((node) => {
        const stage = artifactStage(node.metadata?.creativeArtifact?.kind || inferArtifactKind(node.title));
        if (stageOrder.indexOf(stage) > stageOrder.indexOf(best)) best = stage;
    });
    return best;
}

function inferCompletion(nodes: CanvasNodeData[], stage: CreativeProjectStage) {
    if (!nodes.length) return 0;
    return Math.round((stageOrder.indexOf(stage) / (stageOrder.length - 1)) * 100);
}

function inferNextGap(nodes: CanvasNodeData[], stage: CreativeProjectStage) {
    if (!nodes.length && stage === "brief") return "补充活动要求、故事点子或现有剧本";
    const next = stageOrder[Math.min(stageOrder.length - 1, stageOrder.indexOf(stage) + 1)];
    return next === stage ? "检查当前生成结果并记录返工原因" : `推进到${stageLabel(next)}`;
}

function inferArtifactKind(title: string): CreativeArtifactKind | undefined {
    if (/活动约束/.test(title)) return "activity_constraints";
    if (/前三集|分集剧情/.test(title)) return "episodes";
    if (/故事骨架|故事总纲/.test(title)) return "story";
    if (/单集剧本|剧本/.test(title)) return "script";
    if (/资产清单/.test(title)) return "asset_manifest";
    if (/角色资产/.test(title)) return "character_assets";
    if (/场景资产/.test(title)) return "scene_assets";
    if (/道具资产/.test(title)) return "prop_assets";
    if (/分镜审核|二次分镜/.test(title)) return "storyboard_review";
    if (/文字分镜|分镜/.test(title)) return "storyboard";
    if (/25宫格|预览/.test(title)) return "preview_grid";
    if (/视频生成|生成批次/.test(title)) return "video_batch";
    if (/返工/.test(title)) return "rework_log";
    return undefined;
}

function artifactStage(kind?: CreativeArtifactKind): CreativeProjectStage {
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

function normalizeStage(value: unknown): CreativeProjectStage | undefined {
    return stageOrder.includes(value as CreativeProjectStage) ? (value as CreativeProjectStage) : undefined;
}

function clampCompletion(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function normalizeStringList(value: unknown) {
    return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 30) : [];
}

function listText(items: string[]) {
    return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

function stageLabel(stage: CreativeProjectStage) {
    return ({ brief: "需求/活动约束", story: "故事骨架", episodes: "前三集剧情", script: "单集剧本", assets: "资产确立", storyboard: "文字分镜", review: "分镜审核", preview: "25宫格预览", generation: "视频生成", rework: "返工复盘" })[stage];
}

function nextCanvasX(snapshot: CanvasAgentSnapshot) {
    return snapshot.nodes.length ? Math.max(...snapshot.nodes.map((node) => node.position.x + node.width)) + 80 : 0;
}
