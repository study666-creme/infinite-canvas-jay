import assert from "node:assert/strict";
import test from "node:test";

import {
    createInitialCreativeProjectState,
    deriveCreativeProjectState,
    isSubstantiveCreativeOps,
    mirrorCreativeProjectBlackboard,
    updateCreativeActionStatusOps,
    updateCreativeProjectBlackboardOps,
} from "./creative-project-state";
import { normalizeDirectorStagePacket } from "./director-stage-types";
import {
    CanvasNodeType,
    type CanvasNodeData,
    type CreativeArtifactKind,
    type CreativeArtifactStatus,
    type CreativeProjectAction,
} from "../types";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "./canvas-agent-ops";

function artifactNode(
    kind: CreativeArtifactKind,
    options: { status?: CreativeArtifactStatus; userConfirmed?: boolean } = {},
): CanvasNodeData {
    const status = options.status ?? "approved";
    const userConfirmed = options.userConfirmed ?? status === "approved";

    return {
        id: `node-${kind}`,
        type: CanvasNodeType.Text,
        title: kind,
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata: {
            content: `${kind} content`,
            creativeArtifact: {
                kind,
                version: 1,
                status,
                userConfirmed,
            },
        },
    };
}

test("an empty project only suggests an input and does not execute anything", () => {
    const state = deriveCreativeProjectState([]);

    assert.equal(state.productionType, "unspecified");
    assert.equal(state.currentStage, "brief");
    assert.equal(state.recommendedAction.kind, "clarify");
    assert.equal(state.recommendedAction.status, "suggested");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, []);
    assert.equal(state.pendingAction, undefined);
    assert.equal(state.awaitingUserConfirmation, false);
    assert.equal(state.userConfirmed, false);
});

test("a series story suggests episode planning", () => {
    const state = deriveCreativeProjectState(
        [artifactNode("story")],
        { ...createInitialCreativeProjectState(), productionType: "series" },
    );

    assert.equal(state.productionType, "series");
    assert.equal(state.recommendedAction.stage, "episodes");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, ["episodes"]);
});

test("a short film story skips episodes and suggests one complete script", () => {
    const state = deriveCreativeProjectState(
        [artifactNode("story")],
        { ...createInitialCreativeProjectState(), productionType: "short_film" },
    );

    assert.equal(state.productionType, "short_film");
    assert.equal(state.recommendedAction.stage, "script");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, ["script"]);
    assert.equal(state.recommendedAction.targetArtifactKinds.includes("episodes"), false);
});

test("legacy projects with episode artifacts normalize to series", () => {
    const state = deriveCreativeProjectState([artifactNode("episodes")]);

    assert.equal(state.productionType, "series");
});

test("a confirmed script can skip story and episodes and move to assets", () => {
    const state = deriveCreativeProjectState([artifactNode("script")]);

    assert.equal(state.currentStage, "script");
    assert.equal(state.artifacts.some((artifact) => artifact.kind === "story"), false);
    assert.equal(state.artifacts.some((artifact) => artifact.kind === "episodes"), false);
    assert.equal(state.recommendedAction.kind, "create");
    assert.equal(state.recommendedAction.stage, "assets");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, ["asset_manifest"]);
});

test("an unconfirmed script must be reviewed before later stages", () => {
    const state = deriveCreativeProjectState([
        artifactNode("script", { status: "review", userConfirmed: false }),
    ]);

    assert.equal(state.recommendedAction.kind, "review");
    assert.equal(state.recommendedAction.stage, "script");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, ["script"]);
    assert.equal(state.recommendedAction.status, "suggested");
});

test("artifact updates remain authoritative over stale node metadata", () => {
    const staleScript = artifactNode("script", { status: "review", userConfirmed: false });
    const snapshot: CanvasAgentSnapshot = {
        projectId: "project-1",
        title: "Project",
        nodes: [staleScript],
        connections: [],
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, k: 1 },
    };
    const ops = updateCreativeProjectBlackboardOps(snapshot, {
        artifactUpdates: [{ nodeId: staleScript.id, kind: "script", status: "approved", userConfirmed: true }],
    });
    const blackboardOp = ops.find((op) => op.type === "add_node" && op.metadata?.creativeProjectState);
    const artifactMirrorOp = ops.find((op): op is Extract<CanvasAgentOp, { type: "update_node" }> => op.type === "update_node" && op.id === staleScript.id);

    if (!blackboardOp || blackboardOp.type !== "add_node") assert.fail("expected a project blackboard node");
    assert.equal(artifactMirrorOp?.metadata?.creativeArtifact?.userConfirmed, true);
    const authoritativeState = blackboardOp.metadata?.creativeProjectState;
    assert.ok(authoritativeState);

    const state = deriveCreativeProjectState([...snapshot.nodes, artifactNode("scene_assets")], authoritativeState);
    const script = state.artifacts.find((artifact) => artifact.nodeId === staleScript.id);
    assert.ok(script);
    assert.equal(script.status, "approved");
    assert.equal(script.userConfirmed, true);
    assert.equal(state.artifacts.filter((artifact) => artifact.nodeId === staleScript.id).length, 1);
    assert.equal(state.artifacts.some((artifact) => artifact.kind === "scene_assets"), true);
});

test("approved status alone never implies user confirmation", () => {
    const state = deriveCreativeProjectState([artifactNode("script", { status: "approved", userConfirmed: false })]);
    const script = state.artifacts.find((artifact) => artifact.kind === "script");

    assert.ok(script);
    assert.equal(script.status, "review");
    assert.equal(script.userConfirmed, false);
    assert.equal(state.recommendedAction.kind, "review");
});

test("editing confirmed artifact content creates a new unconfirmed version", () => {
    const original = artifactNode("script");
    const confirmed = deriveCreativeProjectState([original]);
    const changed: CanvasNodeData = {
        ...original,
        metadata: { ...original.metadata, content: "changed script content" },
    };
    const state = deriveCreativeProjectState([changed], confirmed);
    const script = state.artifacts.find((artifact) => artifact.kind === "script");

    assert.ok(script);
    assert.equal(script.version, 2);
    assert.equal(script.status, "review");
    assert.equal(script.userConfirmed, false);
    const mirrored = mirrorCreativeProjectBlackboard([changed], state)[0];
    assert.equal(mirrored.metadata?.creativeArtifact?.version, 2);
    assert.equal(mirrored.metadata?.creativeArtifact?.status, "review");
    assert.equal(mirrored.metadata?.creativeArtifact?.userConfirmed, false);
});

test("a confirmed storyboard skips an unrelated old story draft", () => {
    const state = deriveCreativeProjectState(
        [artifactNode("story", { status: "draft", userConfirmed: false }), artifactNode("storyboard")],
        { ...createInitialCreativeProjectState(), targetDeliverables: ["storyboard"] },
    );

    assert.equal(state.currentStage, "storyboard");
    assert.equal(state.recommendedAction.kind, "ready");
    assert.equal(state.recommendedAction.targetArtifactKinds.includes("story"), false);
});

test("approved target assets lead to a storyboard suggestion", () => {
    const state = deriveCreativeProjectState([
        artifactNode("script"),
        artifactNode("asset_manifest"),
        artifactNode("character_assets"),
        artifactNode("scene_assets"),
        artifactNode("prop_assets"),
    ]);

    assert.equal(state.recommendedAction.kind, "create");
    assert.equal(state.recommendedAction.stage, "storyboard");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, ["storyboard"]);
});

test("complete target assets do not require an unrelated asset manifest", () => {
    const state = deriveCreativeProjectState([
        artifactNode("script"),
        artifactNode("asset_manifest", { status: "draft", userConfirmed: false }),
        artifactNode("character_assets"),
        artifactNode("scene_assets"),
        artifactNode("prop_assets"),
    ]);

    assert.equal(state.recommendedAction.kind, "create");
    assert.equal(state.recommendedAction.stage, "storyboard");
    assert.deepEqual(state.recommendedAction.targetArtifactKinds, ["storyboard"]);
});

test("a pending action sets awaitingUserConfirmation", () => {
    const pendingAction: CreativeProjectAction = {
        id: "pending-video-generation",
        kind: "generate",
        status: "awaiting_user_confirmation",
        stage: "generation",
        label: "Confirm video generation",
        reason: "The storyboard is ready",
        ownerAgents: ["video-agent"],
        targetArtifactKinds: ["video_batch"],
        proposedAt: "2026-07-11T00:00:00.000Z",
    };
    const state = deriveCreativeProjectState([], {
        ...createInitialCreativeProjectState(),
        pendingAction,
        userConfirmed: true,
    });

    assert.equal(state.awaitingUserConfirmation, true);
    assert.equal(state.userConfirmed, false);
    assert.equal(state.currentStage, "generation");
    assert.equal(state.nextGap, pendingAction.label);
    assert.deepEqual(state.pendingAction, pendingAction);
});

test("deciding an action clears the pending slot", () => {
    const pendingAction: CreativeProjectAction = {
        id: "pending-storyboard",
        kind: "create",
        status: "awaiting_user_confirmation",
        stage: "storyboard",
        label: "确认制作文字分镜",
        reason: "剧本与资产已确认",
        ownerAgents: ["分镜导演 Agent"],
        targetArtifactKinds: ["storyboard"],
        proposedAt: "2026-07-11T00:00:00.000Z",
    };
    const snapshot: CanvasAgentSnapshot = {
        projectId: "project-1",
        title: "Project",
        nodes: [],
        connections: [],
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, k: 1 },
        creativeProjectState: deriveCreativeProjectState([], { ...createInitialCreativeProjectState(), pendingAction }),
    };
    const blackboardOp = updateCreativeActionStatusOps(snapshot, pendingAction.id, "approved").find((op) => op.type === "add_node" && op.metadata?.creativeProjectState);

    if (!blackboardOp || blackboardOp.type !== "add_node") assert.fail("expected a project blackboard node");
    assert.equal(blackboardOp.metadata?.creativeProjectState?.pendingAction, undefined);
    assert.equal(blackboardOp.metadata?.creativeProjectState?.awaitingUserConfirmation, false);
    assert.equal(blackboardOp.metadata?.creativeProjectState?.lastConfirmedActionId, pendingAction.id);
});

test("substantive creative ops are classified by their behavioral effect", () => {
    const cases: Array<{ name: string; ops: CanvasAgentOp[] | undefined; expected: boolean }> = [
        { name: "missing ops", ops: undefined, expected: false },
        { name: "empty ops", ops: [], expected: false },
        { name: "viewport change", ops: [{ type: "set_viewport", viewport: { x: 1, y: 2, k: 1 } }], expected: false },
        { name: "selection change", ops: [{ type: "select_nodes", ids: ["node-1"] }], expected: false },
        { name: "connection change", ops: [{ type: "connect_nodes", fromNodeId: "a", toNodeId: "b" }], expected: true },
        { name: "connection deletion", ops: [{ type: "delete_connections", all: true }], expected: true },
        { name: "status-only update", ops: [{ type: "update_node", id: "node-1", metadata: { status: "success" } }], expected: false },
        { name: "progress-only update", ops: [{ type: "update_node", id: "node-1", metadata: { generationProgress: 50, generationStage: "rendering" } }], expected: false },
        { name: "geometry update", ops: [{ type: "update_node", id: "node-1", patch: { width: 640 } }], expected: false },
        { name: "node creation", ops: [{ type: "add_node", id: "node-1" }], expected: true },
        { name: "node deletion", ops: [{ type: "delete_node", id: "node-1" }], expected: true },
        { name: "generation", ops: [{ type: "run_generation", nodeId: "node-1", mode: "image" }], expected: true },
        { name: "title update", ops: [{ type: "update_node", id: "node-1", patch: { title: "New title" } }], expected: true },
        { name: "content update", ops: [{ type: "update_node", id: "node-1", metadata: { content: "New content" } }], expected: true },
        { name: "reference update", ops: [{ type: "update_node", id: "node-1", metadata: { references: ["node-2"] } }], expected: true },
        { name: "model update", ops: [{ type: "update_node", id: "node-1", metadata: { model: "new-model" } }], expected: true },
        { name: "media update", ops: [{ type: "update_node", id: "node-1", metadata: { storageKey: "media/new.png" } }], expected: true },
        { name: "unknown metadata", ops: [{ type: "update_node", id: "node-1", metadata: { customState: true } } as unknown as CanvasAgentOp], expected: true },
    ];

    for (const item of cases) {
        assert.equal(isSubstantiveCreativeOps(item.ops), item.expected, item.name);
    }
});

test("director packet normalization keeps more than ten slots in source order", () => {
    const sourceShotIds = Array.from({ length: 12 }, (_, index) => `source-shot-${12 - index}`);
    const packet = normalizeDirectorStagePacket({
        global_visual_contract: "test contract",
        slots: sourceShotIds.map((shotId, index) => ({
            slot: 100 + index,
            shot_id: shotId,
            unit_id: `source-unit-${index}`,
        })),
    });

    assert.equal(packet.slots.length, 12);
    assert.deepEqual(packet.slots.map((slot) => slot.shot_id), sourceShotIds);
    assert.deepEqual(packet.slots.map((slot) => slot.unit_id), sourceShotIds.map((_, index) => `source-unit-${index}`));
    assert.deepEqual(packet.slots.map((slot) => slot.slot), Array.from({ length: 12 }, (_, index) => index + 1));
});

test("director packets over the supported capacity fail instead of truncating silently", () => {
    assert.throws(
        () => normalizeDirectorStagePacket({ slots: Array.from({ length: 61 }, (_, index) => ({ shot_id: `shot-${index + 1}` })) }),
        /最多支持 60 个镜头/,
    );
});
