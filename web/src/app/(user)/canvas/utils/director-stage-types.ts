export type DirectorStageCamera = {
    shot_size: string;
    angle: string;
    movement: string;
    x: number;
    y: number;
    z: number;
    fov: number;
};

export type DirectorStageActorPose = {
    id: string;
    label: string;
    x: number;
    y: number;
    z: number;
    rotation_y: number;
    scale: number;
    action: string;
};

export type DirectorStagePropPose = Omit<DirectorStageActorPose, "action">;

export type DirectorStageSoundCue = {
    ambience: string;
    foley: string;
    music_hit: string;
};

export type DirectorStageSlot = {
    slot: number;
    shot_id: string;
    unit_id: string;
    duration_max: number;
    dramatic_function: string;
    beat: string;
    dialogue: string;
    camera: DirectorStageCamera;
    subjects: DirectorStageActorPose[];
    props: DirectorStagePropPose[];
    sound: DirectorStageSoundCue;
    continuity_anchors: Record<string, string[]>;
    visual_delta: string | null;
    compressed_video_prompt: string;
};

export type DirectorStagePacket = {
    global_visual_contract: string;
    slots: DirectorStageSlot[];
};

export type DirectorStageCapture = {
    shotId: string;
    slot: number;
    title: string;
    prompt: string;
    dataUrl: string;
    width: number;
    height: number;
};

export const DIRECTOR_STAGE_ACTIONS = [
    "canvas_director_get_state",
    "canvas_director_load_packet",
    "canvas_director_load_shot",
    "canvas_director_capture_shot",
    "canvas_director_capture_all",
] as const;

export type DirectorStageActionName = (typeof DIRECTOR_STAGE_ACTIONS)[number];
export type DirectorStageActionInput = Record<string, unknown>;
export type DirectorStageActionHandler = (name: DirectorStageActionName, input: DirectorStageActionInput) => Promise<unknown>;

export function isDirectorStageActionName(value: string): value is DirectorStageActionName {
    return DIRECTOR_STAGE_ACTIONS.includes(value as DirectorStageActionName);
}

export function isDirectorStageReadAction(value: string) {
    return value === "canvas_director_get_state";
}

export function directorStageActionLabel(value: string) {
    if (value === "canvas_director_get_state") return "读取导演台";
    if (value === "canvas_director_load_packet") return "载入分镜调度";
    if (value === "canvas_director_load_shot") return "切换导演台镜头";
    if (value === "canvas_director_capture_shot") return "截取分镜预览";
    if (value === "canvas_director_capture_all") return "批量截取分镜";
    return value;
}

export function normalizeDirectorStagePacket(value: unknown): DirectorStagePacket {
    const packet = record(value);
    const rawSlots = Array.isArray(packet.slots) ? packet.slots.slice(0, 10) : [];
    if (!rawSlots.length) throw new Error("导演台分镜包至少需要一个镜头槽位");

    const usedIds = new Set<string>();
    const slots = rawSlots.map((item, index) => {
        const raw = record(item);
        const fallbackId = `shot-${String(index + 1).padStart(2, "0")}`;
        let shotId = text(raw.shot_id ?? raw.shotId) || fallbackId;
        if (usedIds.has(shotId)) shotId = `${shotId}-${index + 1}`;
        usedIds.add(shotId);

        return {
            slot: index + 1,
            shot_id: shotId,
            unit_id: text(raw.unit_id ?? raw.unitId) || `U${String(index + 1).padStart(2, "0")}`,
            duration_max: bounded(raw.duration_max ?? raw.durationMax, 1, 15, 15),
            dramatic_function: text(raw.dramatic_function ?? raw.dramaticFunction) || `镜头 ${index + 1}`,
            beat: text(raw.beat),
            dialogue: text(raw.dialogue),
            camera: normalizeCamera(raw.camera),
            subjects: normalizeActors(raw.subjects),
            props: normalizeProps(raw.props),
            sound: normalizeSound(raw.sound),
            continuity_anchors: normalizeContinuity(raw.continuity_anchors ?? raw.continuityAnchors),
            visual_delta: text(raw.visual_delta ?? raw.visualDelta) || null,
            compressed_video_prompt: text(raw.compressed_video_prompt ?? raw.compressedVideoPrompt),
        } satisfies DirectorStageSlot;
    });

    return {
        global_visual_contract: text(packet.global_visual_contract ?? packet.globalVisualContract),
        slots,
    };
}

export function createDirectorStageStarterPacket(): DirectorStagePacket {
    return normalizeDirectorStagePacket({
        global_visual_contract: "中性摄影棚预演，低饱和布景，清晰空间关系。",
        slots: [
            {
                shot_id: "shot-01",
                unit_id: "U01",
                duration_max: 8,
                dramatic_function: "建立人物与空间关系",
                beat: "主角与对手隔桌形成对峙关系",
                camera: { shot_size: "全景", angle: "平视", movement: "固定", x: 0, y: 1.6, z: 5.8, fov: 38 },
                subjects: [
                    { id: "lead", label: "主角", x: -1.25, y: 0, z: 0.25, rotation_y: 18, scale: 1, action: "面向对手" },
                    { id: "rival", label: "对手", x: 1.25, y: 0, z: -0.2, rotation_y: -18, scale: 1, action: "保持对峙" },
                ],
                props: [
                    { id: "table", label: "桌子", x: 0, y: 0, z: -0.55, rotation_y: 0, scale: 1 },
                    { id: "chair", label: "椅子", x: 0.95, y: 0, z: -1.55, rotation_y: 8, scale: 1 },
                ],
            },
        ],
    });
}

function normalizeCamera(value: unknown): DirectorStageCamera {
    const camera = record(value);
    return {
        shot_size: text(camera.shot_size ?? camera.shotSize) || "中景",
        angle: text(camera.angle) || "平视",
        movement: text(camera.movement) || "固定",
        x: boundedFloat(camera.x, -30, 30, 0),
        y: boundedFloat(camera.y, 0.15, 20, 1.6),
        z: boundedFloat(camera.z, -30, 30, 5),
        fov: boundedFloat(camera.fov, 12, 110, 35),
    };
}

function normalizeActors(value: unknown): DirectorStageActorPose[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).map((item, index) => {
        const pose = record(item);
        const id = text(pose.id) || `actor-${index + 1}`;
        return {
            id,
            label: text(pose.label) || id,
            x: boundedFloat(pose.x, -20, 20, index * 0.8),
            y: boundedFloat(pose.y, -2, 10, 0),
            z: boundedFloat(pose.z, -20, 20, 0),
            rotation_y: boundedFloat(pose.rotation_y ?? pose.rotationY, -360, 360, 0),
            scale: boundedFloat(pose.scale, 0.2, 5, 1),
            action: text(pose.action),
        };
    });
}

function normalizeProps(value: unknown): DirectorStagePropPose[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 20).map((item, index) => {
        const pose = record(item);
        const id = text(pose.id) || `prop-${index + 1}`;
        return {
            id,
            label: text(pose.label) || id,
            x: boundedFloat(pose.x, -20, 20, index * 0.8),
            y: boundedFloat(pose.y, -2, 10, 0),
            z: boundedFloat(pose.z, -20, 20, 0),
            rotation_y: boundedFloat(pose.rotation_y ?? pose.rotationY, -360, 360, 0),
            scale: boundedFloat(pose.scale, 0.2, 5, 1),
        };
    });
}

function normalizeSound(value: unknown): DirectorStageSoundCue {
    const sound = record(value);
    return {
        ambience: text(sound.ambience),
        foley: text(sound.foley),
        music_hit: text(sound.music_hit ?? sound.musicHit),
    };
}

function normalizeContinuity(value: unknown) {
    const source = record(value);
    return Object.fromEntries(
        Object.entries(source)
            .map(([key, items]) => [key, Array.isArray(items) ? items.map(text).filter(Boolean).slice(0, 12) : []])
            .filter(([, items]) => items.length),
    );
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function bounded(value: unknown, min: number, max: number, fallback: number) {
    return Math.round(boundedFloat(value, min, max, fallback));
}

function boundedFloat(value: unknown, min: number, max: number, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
