import assert from "node:assert/strict";
import { test } from "node:test";

import { isPromptHubModelValue, parsePromptHubModelId, toPromptHubModelValue } from "./prompt-hub-models";

test("scoped catalog ids remain Prompt Hub models without the storage prefix", () => {
    const scopedId = "_sf-9g6dZUCE16Vr5Tkfm::sd2.0-720p-4img-pro";

    assert.equal(isPromptHubModelValue(scopedId), true);
    assert.equal(parsePromptHubModelId(scopedId), scopedId);
    assert.equal(toPromptHubModelValue(parsePromptHubModelId(scopedId)!), `kazhang-api:${scopedId}`);
});
