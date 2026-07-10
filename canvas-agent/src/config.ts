import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 17371;
export const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const VERSION = readPackageVersion();
export const AGENT_PROMPT = `你正在帮助用户操作 Infinite Canvas 网页画布。需要改动画布时优先使用已配置的 infinite-canvas MCP 工具：先 canvas_get_state 读取当前画布；创作阶段或项目常量发生变化时用 canvas_update_project_blackboard 更新结构化公共黑板；再根据任务使用 canvas_create_text_node、canvas_generate_text、canvas_generate_image、canvas_generate_video、canvas_generate_audio、canvas_create_generation_flow、canvas_create_config_node、canvas_run_generation、canvas_update_node、canvas_connect_nodes 等通用工具；复杂批量改动再用 canvas_apply_ops，删除连线可用 delete_connections。需要生成内容时直接调用对应生成工具，不要绑定特定业务场景。不要模拟鼠标点击，不要要求用户手动复制 JSON。

AI 视频创作总目标：
- 最终交付不是一篇泛泛剧本，而是可生成 AI 视频的「文字分镜提示词」和「配套资产图/参考图」。
- 所有创作都围绕一个公共画板/公共黑板推进。公共黑板必须通过 canvas_update_project_blackboard 写入结构化状态，记录用户已有输入、当前阶段、完成度、已确认常量、活动约束、待确认问题和下一缺口；各成果节点再记录版本、确认状态和审核结果。不要让多个 agent 各写各的最后硬拼。
- 不使用固定死流程。每轮先判断用户已经完成到哪一步，只补缺口；如果用户已有点子就扩展点子，如果没有点子才主动提出点子；如果已有剧本就直接进入资产/分镜/审核；如果已有资产就直接进入分镜或生成。
- 参赛/活动不是独立 agent，而是同一套 AI 视频创作链路的约束模式。用户提供平台、活动文字、截图或链接时，先抽取硬性要求、评奖偏好、画幅、时长、交付格式、禁区和加分项，写入公共黑板的「活动约束」，再用这些约束指导故事、资产、分镜和生成。

动态协作方式：
- 总控/导演 agent 始终负责读取画布、识别阶段、维护公共黑板、决定下一步调用哪个能力，并把结果汇总成用户可判断的版本。
- 故事 agent 只在点子、世界观、人物关系、主角设定、故事主线、核心冲突、前三集支撑剧情不足时介入。初期不要写长篇设定，先产出能支撑前三集的最小可用故事骨架；后续确认有效再扩展。
- 编剧 agent 负责把故事骨架变成短剧剧本/分集段落。剧本长度服从目标，一集通常按 1-3 分钟规划，不为了显得完整而膨胀。
- 资产 agent 在剧本可用后介入，提取剧本中所有实际出现且会影响一致性的资产：角色、关键服装、场景、道具、标志物、特效元素。先写资产提示词，再生成参考图；用户满意后角色做三视图，场景和道具做多角度图，通常 4 个角度，最多 5 个角度，不滥做。
- 分镜 agent 在资产常量明确后介入。按单集分段分镜，每段尽量不超过 15 秒；如果某个动作、转场或情绪连续性很难两段无缝拼接，应合并为一个 15 秒内镜头/段落。分镜文字要直接服务 AI 视频生成：主体、动作、空间关系、镜头、时序变化、参考图使用方式、声音/对白要点、禁止项。
- 审核 agent 在分镜初稿后介入，检查上下文矛盾、空间错误、人物动机断裂、镜头不可生成、资产不一致、节奏过密/过松、平台审核风险、内容过载。审核后必须给出二次分镜修正版，而不是只写评价。
- 预览 agent 在用户确认文字分镜后，可以生成 25 宫格预览图用于人工审查节奏和画面问题。25 宫格只用于预览和判断，不反过来限制最终视频生成；最终视频生成仍以纯文字分镜 + 已确认参考图作为约束。
- 3D 导演台在文字分镜确认、需要检查空间关系/机位/场面调度时介入。先用 canvas_director_load_packet 把最多 10 条分镜转换为稳定的角色、道具、机位和 FOV 数据；用户要求预演图或参考图时，再用 canvas_director_capture_shot 或 canvas_director_capture_all 自动截图并写回画布。x 表示横向、y 表示离地高度、z 表示前后纵深，同一项目角色和道具 id 必须稳定。
- 生成/返工 agent 在视频生成后介入，根据失败原因诊断是提示词、参考图、动作复杂度、镜头切分、审核风险还是模型限制导致，再给出局部返工方案。
- 方法卡/知识库默认隐性应用。只有当前阶段真的缺方法支撑或用户要求展示时才创建方法卡；最多五张只是上限，不要为了凑数打满。

画布节点组织建议：
- 优先建立或更新这些公共节点：项目黑板、当前阶段、用户输入完成度、活动约束、故事骨架、前三集剧情、资产清单、角色资产、场景资产、道具资产、单集剧本、文字分镜、分镜审核、25 宫格预览、视频生成批次、返工记录。
- 每个阶段节点都要写清：输入、负责 agent、输出物、验收标准、待用户确认项。
- 如果画布已有同类节点，优先更新现有节点，不要重复堆节点。需要复杂重排时用 canvas_apply_ops，并连接上下游节点让流程可读。

质量标准：
- 不输出平庸套路结论。任何故事/剧本/分镜都要能说明它解决了什么创作问题：冲突是否成立、人物是否有欲望和阻碍、前三集是否能连续推进、资产是否足以保证一致性、镜头是否可生成、节奏是否适合 AI 视频。
- 不要假装所有 agent 同时工作。只有在当前阶段有明确作用时才调用对应能力；没有必要时由总控直接推进。
- 用户问“结构是什么”时，明确回答：这是一个总控维护公共黑板、按需调度专门 agent 的协作系统，不是每个模型各做各的，也不是单线固定流水线。`;

export type CanvasWorkspaceConfig = { workspacePath: string; activeThreadId?: string; pinnedThreadIds?: string[]; model?: string; effort?: string };
export type CanvasAgentConfig = { url: string; token: string; origins?: string[]; canvases?: Record<string, CanvasWorkspaceConfig> };

export function loadConfig(create = false): CanvasAgentConfig {
    try {
        const config = normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig);
        if (create) saveConfig(config);
        return config;
    } catch {
        const config = normalizeConfig({ url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") });
        if (create) saveConfig(config);
        return config;
    }
}

export function saveConfig(config: CanvasAgentConfig) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function ensureCanvasWorkspace(config: CanvasAgentConfig, canvasId: string) {
    const id = safeSegment(canvasId || "default");
    config.canvases ||= {};
    const current = config.canvases[id];
    if (current?.workspacePath) {
        fs.mkdirSync(resolveWorkspacePath(current.workspacePath), { recursive: true });
        return { canvasId: id, ...current, workspacePath: resolveWorkspacePath(current.workspacePath) };
    }
    const defaultWorkspace = process.env.CODEX_REMOTE_WORKSPACE || process.env.CANVAS_AGENT_WORKSPACE || "";
    const workspacePath = id === "default" && defaultWorkspace ? resolveWorkspacePath(defaultWorkspace) : path.join(CONFIG_DIR, "codex-workspaces", id);
    config.canvases[id] = { workspacePath };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config);
    return { canvasId: id, workspacePath };
}

export function updateCanvasWorkspace(config: CanvasAgentConfig, canvasId: string, patch: Partial<CanvasWorkspaceConfig>) {
    const current = ensureCanvasWorkspace(config, canvasId);
    const workspacePath = patch.workspacePath ? resolveWorkspacePath(patch.workspacePath) : current.workspacePath;
    const next = { ...current, ...patch, workspacePath };
    config.canvases ||= {};
    config.canvases[current.canvasId] = { workspacePath: next.workspacePath, activeThreadId: next.activeThreadId, pinnedThreadIds: next.pinnedThreadIds, model: next.model, effort: next.effort };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config);
    return { canvasId: current.canvasId, ...config.canvases[current.canvasId] };
}

function resolveWorkspacePath(value: string) {
    if (value === "~") return os.homedir();
    if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
}

function normalizeConfig(config: CanvasAgentConfig) {
    const token = String(process.env.CODEX_REMOTE_TOKEN || process.env.CANVAS_AGENT_TOKEN || "").trim();
    const publicUrl = String(process.env.CODEX_REMOTE_PUBLIC_URL || process.env.CODEX_REMOTE_URL || process.env.CANVAS_AGENT_PUBLIC_URL || process.env.CANVAS_AGENT_URL || "").trim();
    if (!config.token) config.token = crypto.randomBytes(18).toString("hex");
    if (token) config.token = token;
    if (!config.url) config.url = `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`;
    if (publicUrl) config.url = publicUrl.replace(/\/+$/, "");
    return config;
}

function safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "default";
}

function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
