import assert from "node:assert/strict";
import { test } from "node:test";

import type { PromptHubCatalogModel, PromptHubImageModel } from "./prompt-hub";
import { isPromptHubModelValue, normalizePromptHubVideoDuration, parsePromptHubModelId, promptHubImageMaxReferences, promptHubImageResolutions, promptHubModelRouteGroup, promptHubVideoAspectRatios, promptHubVideoDurationRange, resolvePromptHubCatalogModelId, selectPromptHubCatalogModels, toPromptHubModelValue } from "./prompt-hub-models";

test("all Grok video channels allow durations through 15 seconds", () => {
    const models: PromptHubCatalogModel[] = [
        { id: "motion-video", label: "Grok Video", modality: "video", parameters: [{ name: "duration", path: "duration", type: "integer", min: 1, max: 10 }] },
        { id: "third-channel-video", label: "Grok Video 1.5", modality: "video", parameters: [{ name: "duration", path: "duration", type: "integer", options: [5, 10] }] },
    ];

    for (const model of models) {
        const range = promptHubVideoDurationRange(model, model.id);
        assert.equal(range.max, 15);
        assert.equal(normalizePromptHubVideoDuration(15, range), 15);
    }
});

test("Veo video channels remain capped at 10 seconds", () => {
    const model: PromptHubCatalogModel = { id: "alternate-video", label: "Veo 3.1", modality: "video", parameters: [{ name: "duration", path: "duration", type: "integer", min: 5, max: 15 }] };
    const range = promptHubVideoDurationRange(model, model.id);

    assert.equal(range.max, 10);
    assert.equal(normalizePromptHubVideoDuration(15, range), 10);
});

test("scoped catalog ids remain Prompt Hub models even without the legacy prefix", () => {
    const scopedId = "_sf-9g6dZUCE16Vr5Tkfm::sd2.0-720p-4img-pro";

    assert.equal(isPromptHubModelValue(scopedId), true);
    assert.equal(parsePromptHubModelId(scopedId), scopedId);
    assert.equal(toPromptHubModelValue(parsePromptHubModelId(scopedId)!), `kazhang-api:${scopedId}`);
});

test("raw model ids from the live Prompt Hub catalog use the secure generation route", () => {
    const catalog: PromptHubCatalogModel[] = [{ id: "sd2.0-720p-4img-fast", label: "SD fast", modality: "video" }];
    assert.equal(resolvePromptHubCatalogModelId("sd2.0-720p-4img-fast", catalog), "sd2.0-720p-4img-fast");
    assert.equal(isPromptHubModelValue("sd2.0-720p-4img-fast"), true);
    assert.equal(resolvePromptHubCatalogModelId("local-channel::sd2.0-720p-4img-fast", catalog), null);
    assert.equal(resolvePromptHubCatalogModelId("unknown-video", catalog), null);
});

test("fixed 4K image models infer their resolution from the catalog id", () => {
    const model: PromptHubImageModel = {
        id: "image2-4k-fast",
        label: "全能模型2 · 极速 4K",
        modality: "image" as const,
        parameters: [{ name: "quality", path: "quality", type: "string", fixed: "standard" }],
    };
    assert.deepEqual(promptHubImageResolutions(model), ["4k"]);
    assert.equal(promptHubImageMaxReferences(model), 0);
});

test("legacy SD four-image min ids resolve to the current Prompt Hub mini model", () => {
    const legacyId = "sd2.0-720p-4img-min";
    const currentId = "sd2.0-720p-4img-mini";
    const catalog: PromptHubCatalogModel[] = [{ id: currentId, label: "SD four-image mini", modality: "video" }];

    assert.equal(isPromptHubModelValue(legacyId), true);
    assert.equal(parsePromptHubModelId(legacyId), currentId);
    assert.equal(parsePromptHubModelId(toPromptHubModelValue(legacyId)), currentId);
    assert.equal(resolvePromptHubCatalogModelId(legacyId, catalog), currentId);
    assert.equal(resolvePromptHubCatalogModelId(legacyId, []), currentId);
    assert.equal(resolvePromptHubCatalogModelId(currentId, catalog), currentId);
    assert.equal(resolvePromptHubCatalogModelId(`local-channel::${legacyId}`, catalog), null);
    assert.equal(resolvePromptHubCatalogModelId(`local-channel::${currentId}`, catalog), null);
});

test("Seedance 2 catalog ratios override a stale three-ratio catalog", () => {
    const ratios = ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"];
    const model: PromptHubCatalogModel = {
        id: "sd2.0-720p-4img-pro",
        label: "SD four-image pro",
        modality: "video",
        parameters: [{ name: "ratio", path: "ratio", type: "string", options: ["16:9", "9:16", "1:1"] }],
    };

    assert.deepEqual(promptHubVideoAspectRatios(model, model.id), ratios);
    assert.deepEqual(promptHubVideoAspectRatios(null, model.id), ratios);
});

test("restricted Seedance catalog families keep their declared three ratios", () => {
    const ratios = ["16:9", "9:16", "1:1"];
    for (const id of ["sd2-431-720p-mini", "firefly-seedance2-pro"]) {
        const model: PromptHubCatalogModel = {
            id,
            label: id,
            modality: "video",
            parameters: [{ name: "aspect_ratio", path: "aspect_ratio", type: "string", options: ratios }],
        };
        assert.deepEqual(promptHubVideoAspectRatios(model, model.id), ratios, id);
    }
});

test("online video catalog exposes every public compatible model", () => {
    const modelIds = [
        "motion-video",
        "motion-video-1-5",
        "sd2.0-fast",
        "sd2.0-720p-pro",
        "sd2.0-720p-fast",
        "sd2.0-720p-mini",
        "sd2.0-720p-4img-pro",
        "sd2.0-720p-4img-fast",
        "sd2.0-720p-4img-mini",
        "sd2.0-1080p-4k-pro",
        "sd2-431-720p-mini",
        "sd2-431-720p-fast",
        "sd2-431-720p-pro",
    ];
    const catalog: PromptHubCatalogModel[] = modelIds.map((id) => ({
        id,
        label: id,
        modality: "video",
        operation: "generate",
    }));
    const oldEnabledIds = new Set(["motion-video", "motion-video-1-5", "sd2.0-fast"]);

    const selected = selectPromptHubCatalogModels(catalog, "video", oldEnabledIds);

    assert.equal(selected.length, modelIds.length);
    assert.deepEqual(selected.map((model) => model.id), modelIds);
});

test("public models are grouped by Card Vault API family", () => {
    assert.equal(promptHubModelRouteGroup({ id: "motion-video-1-5", modality: "video" }), "卡藏 API · Grok");
    assert.equal(promptHubModelRouteGroup({ id: "sd2.0-720p-4img-pro", modality: "video" }), "卡藏 API · SD 全能");
    assert.equal(promptHubModelRouteGroup({ id: "veo-omni", modality: "video" }), "卡藏 API · Veo");
    assert.equal(promptHubModelRouteGroup({ id: "claude-opus-4-8", modality: "text" }), "卡藏 API · Claude");
    assert.equal(promptHubModelRouteGroup({ id: "lingtu-2", modality: "image" }), "卡藏 API · 香蕉");
});

test("configured online models remain as an offline catalog fallback", () => {
    const selected = selectPromptHubCatalogModels([], "video", ["grok-imagine-video", "sd2.0-fast", "sd2.0-fast"]);
    assert.deepEqual(
        selected.map((model) => model.id),
        ["grok-imagine-video", "sd2.0-fast"],
    );
});
