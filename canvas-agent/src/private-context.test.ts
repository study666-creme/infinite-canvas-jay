import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectPrivateCanvasContext } from "./private-context.js";

test("私有扩展只召回 verified 卡并保留可解释来源", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-private-context-"));
    const instructionsFile = path.join(dir, "agent-context.md");
    const reportFile = path.join(dir, "report.json");
    try {
        fs.writeFileSync(instructionsFile, "---\ntriggers: 批处理|重试\nexcludes: 编译错误\n---\n尊重用户已有状态，不强制固定流程。", "utf8");
        fs.writeFileSync(reportFile, JSON.stringify({
            sources: [{ id: "guide", title: "可靠性测试资料" }],
            cards: [
                { id: "verified", title: "为批处理设置有限重试", category: "可靠性", principle: "重试必须有上限并保留恢复标识。", appliesTo: ["批处理任务"], checks: ["是否会无限重试"], avoid: ["吞掉最终失败"], triggers: ["重试策略", "恢复"], sourceIds: ["guide"], status: "verified", scope: "specialist", layer: "private", confidence: 0.9, authority: 0.8 },
                { id: "pending", title: "待确认重试卡", category: "可靠性", principle: "这张卡还没有经过用户确认。", appliesTo: ["批处理任务"], checks: [], avoid: [], triggers: ["重试策略"], sourceIds: ["guide"], status: "auto_verified", scope: "specialist", layer: "private", confidence: 0.99, authority: 0.9 },
            ],
        }), "utf8");

        const result = inspectPrivateCanvasContext("为批处理任务设计可恢复的有限重试策略", { instructionsFile, reportFile, autoDiscover: false });
        assert.equal(result.enabled, true);
        assert.equal(result.activeCardCount, 1);
        assert.deepEqual(result.hits.map((hit) => hit.id), ["verified"]);
        assert.deepEqual(result.hits[0].sources, ["可靠性测试资料"]);
        assert.match(result.text, /尊重用户已有状态/);
        assert.match(result.text, /为批处理设置有限重试/);
        assert.doesNotMatch(result.text, /待确认重试卡/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("私有文件存在但触发范围不匹配时不注入上下文", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-private-scope-"));
    const instructionsFile = path.join(dir, "agent-context.md");
    const reportFile = path.join(dir, "report.json");
    try {
        fs.writeFileSync(instructionsFile, "---\ntriggers: 剧本|分镜\nexcludes: 编译错误\n---\n这是创作任务说明。", "utf8");
        fs.writeFileSync(reportFile, JSON.stringify({ sources: [], cards: [{ id: "collision", title: "检查编译错误", category: "测试", principle: "这张卡用于证明排除规则优先。", appliesTo: [], checks: [], avoid: [], triggers: ["编译错误"], sourceIds: [], status: "verified", scope: "specialist", layer: "private", confidence: 1, authority: 1 }] }), "utf8");
        const result = inspectPrivateCanvasContext("帮我检查 TypeScript 编译错误", { instructionsFile, reportFile, autoDiscover: false });
        assert.equal(result.enabled, true);
        assert.equal(result.relevant, false);
        assert.equal(result.text, "");
        assert.deepEqual(result.hits, []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
