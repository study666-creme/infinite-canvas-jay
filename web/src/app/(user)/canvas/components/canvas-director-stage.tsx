"use client";

import { App, Dropdown, Tooltip } from "antd";
import { Camera, ChevronLeft, ChevronRight, Clapperboard, CopyPlus, Download, FileJson, Focus, ImagePlus, Images, PackagePlus, RotateCcw, SlidersHorizontal, Trash2, UserPlus, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import {
    createDirectorStageStarterPacket,
    isDirectorStageActionName,
    normalizeDirectorStagePacket,
    type DirectorStageActionInput,
    type DirectorStageActionName,
    type DirectorStageActorPose,
    type DirectorStageCapture,
    type DirectorStagePacket,
    type DirectorStagePropPose,
    type DirectorStageSlot,
} from "../utils/director-stage-types";

type StageRuntime = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    stageRoot: THREE.Group;
    entityObjects: Map<string, THREE.Object3D>;
    selectionHelper: THREE.BoxHelper | null;
    resize: () => void;
};

type SelectedTransform = { id: string; label: string; kind: "角色" | "道具"; x: number; y: number; z: number; rotationY: number; scale: number };
type EntityTransform = Pick<SelectedTransform, "x" | "y" | "z" | "rotationY" | "scale">;
type EntityDragState = { pointerId: number; entityId: string; plane: THREE.Plane; offset: THREE.Vector3 };

export type CanvasDirectorStageHandle = {
    execute: (name: DirectorStageActionName, input?: DirectorStageActionInput) => Promise<unknown>;
    open: () => void;
};

export const CanvasDirectorStage = forwardRef<
    CanvasDirectorStageHandle,
    { onCapture: (captures: DirectorStageCapture[]) => Promise<string[]> }
>(function CanvasDirectorStage({ onCapture }, ref) {
    const { message } = App.useApp();
    const themeName = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeName];
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const runtimeRef = useRef<StageRuntime | null>(null);
    const packetRef = useRef<DirectorStagePacket | null>(null);
    const activeShotIdRef = useRef("");
    const openRef = useRef(false);
    const persistEntityTransformRef = useRef<(id: string, transform: EntityTransform) => void>(() => undefined);
    const [open, setOpen] = useState(false);
    const [packet, setPacket] = useState<DirectorStagePacket | null>(null);
    const [activeShotId, setActiveShotId] = useState("");
    const [selected, setSelected] = useState<SelectedTransform | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [captureProgress, setCaptureProgress] = useState({ current: 0, total: 0 });
    const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
    const [draggingEntityId, setDraggingEntityId] = useState("");

    const activeSlot = useMemo(() => packet?.slots.find((slot) => slot.shot_id === activeShotId) || packet?.slots[0] || null, [activeShotId, packet]);
    const activeShotIndex = useMemo(() => packet?.slots.findIndex((slot) => slot.shot_id === activeSlot?.shot_id) ?? -1, [activeSlot?.shot_id, packet]);

    const setStageOpen = (next: boolean) => {
        openRef.current = next;
        setOpen(next);
        if (!next) setMobileInspectorOpen(false);
    };

    const loadPacket = (value: unknown, shouldOpen = true) => {
        const next = normalizeDirectorStagePacket(value);
        const firstShotId = next.slots[0].shot_id;
        packetRef.current = next;
        activeShotIdRef.current = firstShotId;
        setPacket(next);
        setActiveShotId(firstShotId);
        setSelected(null);
        if (shouldOpen) setStageOpen(true);
        queueMicrotask(() => applySlotToRuntime(firstShotId));
        return next;
    };

    const openStage = () => {
        if (!packetRef.current) loadPacket(createDirectorStageStarterPacket());
        else setStageOpen(true);
    };

    const applySlotToRuntime = (shotId: string) => {
        const currentPacket = packetRef.current;
        const slot = currentPacket?.slots.find((item) => item.shot_id === shotId);
        if (!slot) throw new Error(`没有找到分镜槽位：${shotId}`);
        activeShotIdRef.current = slot.shot_id;
        setActiveShotId(slot.shot_id);
        setSelected(null);
        const runtime = runtimeRef.current;
        if (runtime) applyStageSlot(runtime, slot);
        return slot;
    };

    const captureSlots = async (slots: DirectorStageSlot[]) => {
        if (!slots.length) throw new Error("没有可截图的分镜槽位");
        setStageOpen(true);
        setCapturing(true);
        setCaptureProgress({ current: 0, total: slots.length });
        try {
            const runtime = await waitForRuntime(runtimeRef);
            const captures: DirectorStageCapture[] = [];
            for (let index = 0; index < slots.length; index += 1) {
                const slot = slots[index];
                setCaptureProgress({ current: index + 1, total: slots.length });
                applySlotToRuntime(slot.shot_id);
                applyStageSlot(runtime, slot);
                await settleFrames(2);
                captures.push(captureStage(runtime, slot));
            }
            const nodeIds = await onCapture(captures);
            return { ok: true, count: captures.length, shotIds: captures.map((item) => item.shotId), nodeIds };
        } finally {
            setCapturing(false);
            setCaptureProgress({ current: 0, total: 0 });
        }
    };

    const persistEntityTransform = (id: string, transform: EntityTransform) => {
        const currentPacket = packetRef.current;
        const shotId = activeShotIdRef.current;
        const runtimeObject = runtimeRef.current?.entityObjects.get(id);
        if (!currentPacket || !shotId) return;
        const entityId = id.replace(/^(actor|prop):/, "");
        const slot = currentPacket.slots.find((item) => item.shot_id === shotId);
        const source = id.startsWith("actor:") ? slot?.subjects.find((item) => item.id === entityId) : slot?.props.find((item) => item.id === entityId);
        const pose = { x: transform.x, y: transform.y, z: transform.z, rotation_y: transform.rotationY, scale: transform.scale };
        const nextPacket = {
            ...currentPacket,
            slots: currentPacket.slots.map((item) =>
                item.shot_id !== shotId
                    ? item
                    : {
                          ...item,
                          subjects: id.startsWith("actor:") ? item.subjects.map((actor) => (actor.id === entityId ? { ...actor, ...pose } : actor)) : item.subjects,
                          props: id.startsWith("prop:") ? item.props.map((prop) => (prop.id === entityId ? { ...prop, ...pose } : prop)) : item.props,
                      },
            ),
        };
        packetRef.current = nextPacket;
        setPacket(nextPacket);
        setSelected({
            id,
            label: typeof runtimeObject?.userData.entityLabel === "string" ? runtimeObject.userData.entityLabel : source?.label || entityId,
            kind: id.startsWith("actor:") ? "角色" : "道具",
            ...transform,
        });
    };
    persistEntityTransformRef.current = persistEntityTransform;

    useImperativeHandle(
        ref,
        () => ({
            open: openStage,
            execute: async (name, input = {}) => {
                if (!isDirectorStageActionName(name)) throw new Error(`未知导演台工具：${name}`);
                if (name === "canvas_director_get_state") {
                    return {
                        open: openRef.current,
                        activeShotId: activeShotIdRef.current,
                        packet: packetRef.current
                            ? {
                                  globalVisualContract: packetRef.current.global_visual_contract,
                                  slots: packetRef.current.slots.map((slot) => ({ slot: slot.slot, shotId: slot.shot_id, dramaticFunction: slot.dramatic_function })),
                              }
                            : null,
                    };
                }
                if (name === "canvas_director_load_packet") {
                    const next = loadPacket(input.packet ?? input, input.open !== false);
                    return { ok: true, count: next.slots.length, activeShotId: next.slots[0].shot_id };
                }
                if (name === "canvas_director_load_shot") {
                    const slot = applySlotToRuntime(String(input.shotId || input.shot_id || ""));
                    setStageOpen(input.open !== false);
                    return { ok: true, shotId: slot.shot_id, slot: slot.slot };
                }
                if (name === "canvas_director_capture_shot") {
                    const currentPacket = packetRef.current;
                    if (!currentPacket) throw new Error("请先载入导演台分镜包");
                    const shotId = String(input.shotId || input.shot_id || activeShotIdRef.current || currentPacket.slots[0].shot_id);
                    const slot = currentPacket.slots.find((item) => item.shot_id === shotId);
                    if (!slot) throw new Error(`没有找到分镜槽位：${shotId}`);
                    return captureSlots([slot]);
                }
                const currentPacket = packetRef.current;
                if (!currentPacket) throw new Error("请先载入导演台分镜包");
                return captureSlots(currentPacket.slots);
            },
        }),
        [onCapture],
    );

    useEffect(() => {
        if (!open || !canvasRef.current || runtimeRef.current) return;
        const runtime = createStageRuntime(canvasRef.current, themeName === "dark");
        runtimeRef.current = runtime;
        const currentShotId = activeShotIdRef.current || packetRef.current?.slots[0]?.shot_id;
        if (currentShotId) applySlotToRuntime(currentShotId);

        let animationFrame = 0;
        const render = () => {
            runtime.controls.update();
            runtime.renderer.render(runtime.scene, runtime.camera);
            animationFrame = requestAnimationFrame(render);
        };
        render();

        const observer = new ResizeObserver(runtime.resize);
        observer.observe(canvasRef.current);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let dragState: EntityDragState | null = null;
        const updateRay = (event: PointerEvent) => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            if (!bounds) return false;
            pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
            raycaster.setFromCamera(pointer, runtime.camera);
            return true;
        };
        const pointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || !updateRay(event)) return;
            const hit = raycaster.intersectObjects(Array.from(runtime.entityObjects.values()), true)[0]?.object;
            const entityId = findEntityId(hit);
            if (!entityId) {
                clearRuntimeSelection(runtime);
                setSelected(null);
                return;
            }
            const object = runtime.entityObjects.get(entityId);
            if (!object) return;
            selectRuntimeObject(runtime, entityId, setSelected);
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -object.position.y);
            const point = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(plane, point)) return;
            dragState = { pointerId: event.pointerId, entityId, plane, offset: point.sub(object.position) };
            runtime.controls.enabled = false;
            canvasRef.current?.setPointerCapture(event.pointerId);
            setDraggingEntityId(entityId);
            event.preventDefault();
        };
        const pointerMove = (event: PointerEvent) => {
            if (!dragState || dragState.pointerId !== event.pointerId || !updateRay(event)) return;
            const object = runtime.entityObjects.get(dragState.entityId);
            if (!object) return;
            const point = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(dragState.plane, point)) return;
            object.position.x = point.x - dragState.offset.x;
            object.position.z = point.z - dragState.offset.z;
            runtime.selectionHelper?.update();
            event.preventDefault();
        };
        const endEntityDrag = (event: PointerEvent) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const object = runtime.entityObjects.get(dragState.entityId);
            if (object) {
                persistEntityTransformRef.current(dragState.entityId, {
                    x: object.position.x,
                    y: object.position.y,
                    z: object.position.z,
                    rotationY: THREE.MathUtils.radToDeg(object.rotation.y),
                    scale: object.scale.x,
                });
            }
            if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
            dragState = null;
            runtime.controls.enabled = true;
            setDraggingEntityId("");
        };
        const persistCamera = () => {
            const currentPacket = packetRef.current;
            const shotId = activeShotIdRef.current;
            if (!currentPacket || !shotId) return;
            const nextPacket = {
                ...currentPacket,
                slots: currentPacket.slots.map((slot) =>
                    slot.shot_id === shotId
                        ? {
                              ...slot,
                              camera: {
                                  ...slot.camera,
                                  x: runtime.camera.position.x,
                                  y: runtime.camera.position.y,
                                  z: runtime.camera.position.z,
                                  fov: runtime.camera.fov,
                              },
                          }
                        : slot,
                ),
            };
            packetRef.current = nextPacket;
            setPacket(nextPacket);
        };
        canvasRef.current.addEventListener("pointerdown", pointerDown);
        canvasRef.current.addEventListener("pointermove", pointerMove);
        canvasRef.current.addEventListener("pointerup", endEntityDrag);
        canvasRef.current.addEventListener("pointercancel", endEntityDrag);
        runtime.controls.addEventListener("end", persistCamera);

        return () => {
            cancelAnimationFrame(animationFrame);
            observer.disconnect();
            canvasRef.current?.removeEventListener("pointerdown", pointerDown);
            canvasRef.current?.removeEventListener("pointermove", pointerMove);
            canvasRef.current?.removeEventListener("pointerup", endEntityDrag);
            canvasRef.current?.removeEventListener("pointercancel", endEntityDrag);
            runtime.controls.removeEventListener("end", persistCamera);
            runtime.controls.enabled = true;
            setDraggingEntityId("");
            disposeStageRuntime(runtime);
            runtimeRef.current = null;
        };
    }, [open, themeName]);

    const updateSelected = (patch: Partial<Pick<SelectedTransform, "x" | "y" | "z" | "rotationY" | "scale">>) => {
        if (!selected) return;
        const object = runtimeRef.current?.entityObjects.get(selected.id);
        if (!object) return;
        const next = { ...selected, ...patch };
        object.position.set(next.x, next.y, next.z);
        object.rotation.y = THREE.MathUtils.degToRad(next.rotationY);
        object.scale.setScalar(next.scale);
        runtimeRef.current?.selectionHelper?.update();
        persistEntityTransform(selected.id, next);
    };

    const commitActiveSlot = (nextSlot: DirectorStageSlot, nextSelectedId = "") => {
        const currentPacket = packetRef.current;
        if (!currentPacket) return;
        const nextPacket = { ...currentPacket, slots: currentPacket.slots.map((slot) => (slot.shot_id === nextSlot.shot_id ? nextSlot : slot)) };
        packetRef.current = nextPacket;
        setPacket(nextPacket);
        const runtime = runtimeRef.current;
        if (runtime) {
            applyStageSlot(runtime, nextSlot);
            if (nextSelectedId) selectRuntimeObject(runtime, nextSelectedId, setSelected);
            else setSelected(null);
        }
    };

    const addActor = () => {
        const slot = packetRef.current?.slots.find((item) => item.shot_id === activeShotIdRef.current);
        if (!slot) return;
        if (slot.subjects.length >= 12) {
            message.warning("单个镜头最多放置 12 个人物");
            return;
        }
        const id = nextEntityId("actor", slot);
        const position = nextEntityPosition(slot.subjects.length);
        const actor: DirectorStageActorPose = { id, label: `人物 ${slot.subjects.length + 1}`, x: position.x, y: 0, z: position.z, rotation_y: 0, scale: 1, action: "待调度" };
        commitActiveSlot({ ...slot, subjects: [...slot.subjects, actor] }, `actor:${id}`);
        message.success("人物已加入当前镜头");
    };

    const addProp = (label: string) => {
        const slot = packetRef.current?.slots.find((item) => item.shot_id === activeShotIdRef.current);
        if (!slot) return;
        if (slot.props.length >= 20) {
            message.warning("单个镜头最多放置 20 个道具");
            return;
        }
        const id = nextEntityId("prop", slot);
        const position = nextEntityPosition(slot.props.length + slot.subjects.length);
        const prop: DirectorStagePropPose = { id, label, x: position.x, y: 0, z: position.z, rotation_y: 0, scale: 1 };
        commitActiveSlot({ ...slot, props: [...slot.props, prop] }, `prop:${id}`);
        message.success(`${label}已加入当前镜头`);
    };

    const duplicateSelected = () => {
        if (!selected) return;
        const slot = packetRef.current?.slots.find((item) => item.shot_id === activeShotIdRef.current);
        if (!slot) return;
        const sourceId = selected.id.replace(/^(actor|prop):/, "");
        if (selected.id.startsWith("actor:")) {
            const source = slot.subjects.find((item) => item.id === sourceId);
            if (!source || slot.subjects.length >= 12) return;
            const id = nextEntityId("actor", slot);
            const actor = { ...source, id, label: `${source.label} 复制`, x: source.x + 0.65, z: source.z + 0.35 };
            commitActiveSlot({ ...slot, subjects: [...slot.subjects, actor] }, `actor:${id}`);
        } else {
            const source = slot.props.find((item) => item.id === sourceId);
            if (!source || slot.props.length >= 20) return;
            const id = nextEntityId("prop", slot);
            const prop = { ...source, id, label: `${source.label} 复制`, x: source.x + 0.65, z: source.z + 0.35 };
            commitActiveSlot({ ...slot, props: [...slot.props, prop] }, `prop:${id}`);
        }
        message.success("已复制到当前镜头");
    };

    const removeSelected = () => {
        if (!selected) return;
        const slot = packetRef.current?.slots.find((item) => item.shot_id === activeShotIdRef.current);
        if (!slot) return;
        const sourceId = selected.id.replace(/^(actor|prop):/, "");
        commitActiveSlot({
            ...slot,
            subjects: selected.id.startsWith("actor:") ? slot.subjects.filter((item) => item.id !== sourceId) : slot.subjects,
            props: selected.id.startsWith("prop:") ? slot.props.filter((item) => item.id !== sourceId) : slot.props,
        });
        message.success(`${selected.label}已移除`);
    };

    const resetActiveShot = () => {
        if (activeShotIdRef.current) applySlotToRuntime(activeShotIdRef.current);
    };

    const moveShot = (offset: number) => {
        const slots = packetRef.current?.slots;
        if (!slots?.length) return;
        const currentIndex = slots.findIndex((slot) => slot.shot_id === activeShotIdRef.current);
        const nextIndex = Math.min(slots.length - 1, Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + offset));
        if (nextIndex !== currentIndex) applySlotToRuntime(slots[nextIndex].shot_id);
    };

    const captureFromUi = async (slots: DirectorStageSlot[]) => {
        try {
            const result = await captureSlots(slots);
            message.success(`${result.count} 个分镜截图已加入画布`);
        } catch (error) {
            message.error(error instanceof Error ? `截图失败：${error.message}` : "截图失败，请稍后重试");
        }
    };

    const downloadPacket = () => {
        if (!packetRef.current) return;
        const blob = new Blob([JSON.stringify(packetRef.current, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "director-stage-packet.json";
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const importPacketFile = async (file?: File) => {
        if (!file) return;
        try {
            loadPacket(JSON.parse(await file.text()));
            message.success("分镜包已载入导演台");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "分镜包格式不正确");
        } finally {
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    if (!open) return null;
    const currentCaptureDisabled = !activeSlot || capturing;
    const currentCaptureStyle = currentCaptureDisabled
        ? themeName === "dark"
            ? { background: "#242928", borderColor: "#39403e", color: "#929a97" }
            : { background: "#d8dcda", borderColor: "#c3c8c5", color: "#626966" }
        : themeName === "dark"
          ? { background: "#303735", borderColor: "#4a5451", color: "#f4f5f3" }
          : { background: "#151918", borderColor: "#151918", color: "#ffffff" };

    return (
        <div className="fixed inset-0 z-[120] overflow-hidden bg-[#d9ddda] text-[#151918] dark:bg-[#101414] dark:text-[#f4f5f3]">
            <canvas ref={canvasRef} className={`absolute inset-0 block size-full touch-none ${draggingEntityId ? "cursor-grabbing" : "cursor-grab"}`} />

            <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-black/10 bg-white/72 px-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-black/46 sm:px-5">
                <div className="pointer-events-auto flex min-w-0 items-center gap-2 sm:gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#151918] text-white dark:bg-white dark:text-black sm:size-9">
                        <Clapperboard className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-xs font-semibold sm:text-sm">3D 导演台</div>
                        <div className="hidden truncate text-[11px] opacity-55 sm:block">{packet?.global_visual_contract || "Stage Packet"}</div>
                    </div>
                </div>
                <div className="pointer-events-auto flex items-center gap-0.5 sm:gap-1.5">
                    <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importPacketFile(event.target.files?.[0])} />
                    <StageIconButton label="导入分镜包" onClick={() => fileRef.current?.click()}><FileJson className="size-4" /></StageIconButton>
                    <span className="hidden sm:inline-flex"><StageIconButton label="导出分镜包" disabled={!packet} onClick={downloadPacket}><Download className="size-4" /></StageIconButton></span>
                    <span className="hidden sm:inline-flex"><StageIconButton label="恢复当前镜头" disabled={!activeSlot} onClick={resetActiveShot}><RotateCcw className="size-4" /></StageIconButton></span>
                    <span className="md:hidden"><StageIconButton label={mobileInspectorOpen ? "收起场面调度" : "打开场面调度"} active={mobileInspectorOpen} onClick={() => setMobileInspectorOpen((value) => !value)}><SlidersHorizontal className="size-4" /></StageIconButton></span>
                    <button
                        type="button"
                        disabled={currentCaptureDisabled}
                        className="hidden h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition enabled:hover:brightness-110 disabled:cursor-not-allowed sm:inline-flex"
                        style={currentCaptureStyle}
                        onClick={() => activeSlot && void captureFromUi([activeSlot])}
                    >
                        <ImagePlus className="size-4" />截取当前
                    </button>
                    <button
                        type="button"
                        disabled={!packet?.slots.length || capturing}
                        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#16776f] px-3 text-xs font-semibold text-white transition hover:bg-[#11675f] disabled:opacity-40"
                        onClick={() => packet && void captureFromUi(packet.slots)}
                    >
                        <Images className="size-4" /><span className="hidden sm:inline">全部截图</span>
                    </button>
                    <StageIconButton label="关闭导演台" onClick={() => setStageOpen(false)}><X className="size-4.5" /></StageIconButton>
                </div>
            </header>

            {activeSlot ? (
                <div className="pointer-events-none absolute left-3 top-20 z-10 max-w-[min(520px,calc(100vw-24px))] md:max-w-[calc(100vw-350px)] sm:left-5">
                    <div className="text-[11px] font-semibold uppercase opacity-55">镜头 {String(activeSlot.slot).padStart(2, "0")} · {activeSlot.camera.shot_size} · {activeSlot.camera.angle}</div>
                    <div className="mt-1 text-base font-semibold sm:text-lg">{activeSlot.dramatic_function}</div>
                    {activeSlot.beat ? <div className="mt-1 line-clamp-2 text-xs opacity-60 sm:text-sm">{activeSlot.beat}</div> : null}
                    <div className="pointer-events-auto mt-3 inline-flex h-9 items-center rounded-md border border-black/10 bg-white/68 px-1 backdrop-blur-xl dark:border-white/10 dark:bg-black/42">
                        <StageIconButton label="上一个镜头" disabled={activeShotIndex <= 0} onClick={() => moveShot(-1)}><ChevronLeft className="size-4" /></StageIconButton>
                        <span className="min-w-14 text-center text-[11px] font-semibold tabular-nums">{activeShotIndex + 1} / {packet?.slots.length || 0}</span>
                        <StageIconButton label="下一个镜头" disabled={activeShotIndex < 0 || activeShotIndex >= (packet?.slots.length || 0) - 1} onClick={() => moveShot(1)}><ChevronRight className="size-4" /></StageIconButton>
                    </div>
                </div>
            ) : null}

            {mobileInspectorOpen ? <button type="button" aria-label="关闭场面调度" className="absolute inset-0 z-[9] bg-black/20 md:hidden" onClick={() => setMobileInspectorOpen(false)} /> : null}
            <aside className={`absolute bottom-20 right-0 top-16 z-10 w-[min(320px,calc(100vw-24px))] overflow-y-auto border-l border-black/10 bg-white/86 p-4 shadow-[-18px_0_42px_rgba(0,0,0,.12)] backdrop-blur-xl transition-transform duration-200 dark:border-white/10 dark:bg-black/72 md:right-4 md:top-20 md:w-[286px] md:translate-x-0 md:pointer-events-auto md:bg-white/66 md:shadow-none dark:md:bg-black/42 ${mobileInspectorOpen ? "translate-x-0" : "pointer-events-none translate-x-full"}`}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase opacity-55"><Camera className="size-3.5" />机位</div>
                {activeSlot ? (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <StageMetric label="景别" value={activeSlot.camera.shot_size} />
                        <StageMetric label="运动" value={activeSlot.camera.movement} />
                        <StageMetric label="焦距视角" value={`${activeSlot.camera.fov}°`} />
                        <StageMetric label="时长" value={`${activeSlot.duration_max}s`} />
                    </div>
                ) : null}

                <div className="mt-6 flex items-center gap-2 border-t border-black/10 pt-4 text-xs font-semibold uppercase opacity-55 dark:border-white/10"><Focus className="size-3.5" />场面调度</div>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <button type="button" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-black/10 text-[11px] font-medium transition hover:bg-black/6 dark:border-white/12 dark:hover:bg-white/8" onClick={addActor}>
                        <UserPlus className="size-3.5" />添加人物
                    </button>
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: ["桌子", "椅子", "门", "方块道具"].map((label) => ({ key: label, label })),
                            onClick: ({ key }) => addProp(key),
                        }}
                    >
                        <button type="button" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-black/10 text-[11px] font-medium transition hover:bg-black/6 dark:border-white/12 dark:hover:bg-white/8">
                            <PackagePlus className="size-3.5" />添加道具
                        </button>
                    </Dropdown>
                </div>
                <div className="mt-3 grid gap-1.5">
                    {activeSlot?.subjects.map((item) => <EntityButton key={`actor:${item.id}`} id={`actor:${item.id}`} label={item.label} detail={item.action || "角色"} selected={selected?.id === `actor:${item.id}`} onClick={() => runtimeRef.current && selectRuntimeObject(runtimeRef.current, `actor:${item.id}`, setSelected)} />)}
                    {activeSlot?.props.map((item) => <EntityButton key={`prop:${item.id}`} id={`prop:${item.id}`} label={item.label} detail="道具" selected={selected?.id === `prop:${item.id}`} onClick={() => runtimeRef.current && selectRuntimeObject(runtimeRef.current, `prop:${item.id}`, setSelected)} />)}
                </div>

                {selected ? (
                    <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
                        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                            <span className="min-w-0 truncate">{selected.label}</span>
                            <span className="flex shrink-0 items-center">
                                <span className="mr-1 text-[10px] opacity-45">{selected.kind}</span>
                                <StageIconButton label="复制当前对象" onClick={duplicateSelected}><CopyPlus className="size-3.5" /></StageIconButton>
                                <StageIconButton label="移除当前对象" danger onClick={removeSelected}><Trash2 className="size-3.5" /></StageIconButton>
                            </span>
                        </div>
                        <div className="mt-4 grid gap-3">
                            <StageRange label="横向 X" value={selected.x} min={-8} max={8} step={0.1} onChange={(x) => updateSelected({ x })} />
                            <StageRange label="高度 Y" value={selected.y} min={-2} max={8} step={0.1} softFloor={0} onSoftFloorBlocked={() => message.info({ key: "director-stage-floor", content: "已贴地；松开后再次向下可进入地下" })} onChange={(y) => updateSelected({ y })} />
                            <StageRange label="纵深 Z" value={selected.z} min={-8} max={8} step={0.1} onChange={(z) => updateSelected({ z })} />
                            <StageRange label="朝向" value={selected.rotationY} min={-180} max={180} step={1} suffix="°" onChange={(rotationY) => updateSelected({ rotationY })} />
                            <StageRange label="缩放" value={selected.scale} min={0.3} max={3} step={0.05} onChange={(scale) => updateSelected({ scale })} />
                        </div>
                    </div>
                ) : null}
            </aside>

            <div className="absolute inset-x-0 bottom-0 z-20 h-20 border-t border-black/10 bg-white/76 px-3 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-black/52 sm:px-5">
                <div className="thin-scrollbar flex h-full items-stretch gap-2 overflow-x-auto">
                    {packet?.slots.map((slot) => {
                        const active = slot.shot_id === activeShotId;
                        return (
                            <button
                                key={slot.shot_id}
                                type="button"
                                className="min-w-[154px] max-w-[220px] border-l-2 px-3 text-left transition"
                                style={{ borderColor: active ? "#16776f" : theme.node.stroke, background: active ? "rgba(22,119,111,.09)" : "transparent" }}
                                onClick={() => applySlotToRuntime(slot.shot_id)}
                            >
                                <div className="text-[10px] font-semibold opacity-45">{String(slot.slot).padStart(2, "0")} · {slot.duration_max}s</div>
                                <div className="mt-1 truncate text-xs font-semibold">{slot.dramatic_function}</div>
                                <div className="mt-0.5 truncate text-[10px] opacity-50">{slot.camera.shot_size} · {slot.camera.movement}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {capturing ? <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/12 backdrop-blur-[1px]"><div className="rounded-md bg-black/78 px-4 py-2 text-xs font-semibold text-white">正在渲染分镜 {captureProgress.current}/{captureProgress.total}</div></div> : null}
        </div>
    );
});

function nextEntityId(kind: "actor" | "prop", slot: DirectorStageSlot) {
    const used = new Set((kind === "actor" ? slot.subjects : slot.props).map((item) => item.id));
    for (let index = 1; index < 100; index += 1) {
        const id = `${kind}-${index}`;
        if (!used.has(id)) return id;
    }
    return `${kind}-${Date.now().toString(36)}`;
}

function nextEntityPosition(index: number) {
    const positions = [
        { x: -1.4, z: 0 },
        { x: 1.4, z: 0 },
        { x: 0, z: 1.35 },
        { x: 0, z: -1.35 },
        { x: -1.4, z: 1.35 },
        { x: 1.4, z: 1.35 },
        { x: -1.4, z: -1.35 },
        { x: 1.4, z: -1.35 },
    ];
    const base = positions[index % positions.length];
    const ring = Math.floor(index / positions.length);
    return { x: base.x + ring * 0.45, z: base.z + ring * 0.45 };
}

function createStageRuntime(canvas: HTMLCanvasElement, dark: boolean): StageRuntime {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? 0x151a19 : 0xd9ddda);
    scene.fog = new THREE.Fog(dark ? 0x151a19 : 0xd9ddda, 12, 30);

    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 100);
    camera.position.set(0, 1.6, 5.8);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 24;
    controls.target.set(0, 1, 0);

    scene.add(new THREE.HemisphereLight(dark ? 0xddebe7 : 0xffffff, dark ? 0x18201d : 0x8c9791, 2.25));
    const key = new THREE.DirectionalLight(0xfff4df, 3.4);
    key.position.set(4.5, 8, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd7cf, 1.5);
    rim.position.set(-5, 3.5, -4);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), new THREE.MeshStandardMaterial({ color: dark ? 0x252b29 : 0xc8cdca, roughness: 0.82, metalness: 0.04 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(28, 11), new THREE.MeshStandardMaterial({ color: dark ? 0x1d2321 : 0xe4e7e4, roughness: 0.95 }));
    backWall.position.set(0, 5.45, -6);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const grid = new THREE.GridHelper(24, 24, dark ? 0x4d635e : 0x82908b, dark ? 0x303b38 : 0xaeb7b3);
    grid.position.y = 0.008;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
        material.transparent = true;
        material.opacity = dark ? 0.34 : 0.42;
    });
    scene.add(grid);

    const stageRoot = new THREE.Group();
    scene.add(stageRoot);
    const entityObjects = new Map<string, THREE.Object3D>();

    const resize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };
    resize();
    return { scene, camera, renderer, controls, stageRoot, entityObjects, selectionHelper: null, resize };
}

function applyStageSlot(runtime: StageRuntime, slot: DirectorStageSlot) {
    clearRuntimeSelection(runtime);
    clearGroup(runtime.stageRoot);
    runtime.entityObjects.clear();

    slot.subjects.forEach((pose, index) => {
        const id = `actor:${pose.id}`;
        const actor = createActor(index, id, pose.label);
        actor.position.set(pose.x, pose.y, pose.z);
        actor.rotation.y = THREE.MathUtils.degToRad(pose.rotation_y);
        actor.scale.setScalar(pose.scale);
        runtime.stageRoot.add(actor);
        runtime.entityObjects.set(id, actor);
    });
    slot.props.forEach((pose, index) => {
        const id = `prop:${pose.id}`;
        const prop = createProp(pose.label, index, id);
        prop.position.set(pose.x, pose.y, pose.z);
        prop.rotation.y = THREE.MathUtils.degToRad(pose.rotation_y);
        prop.scale.setScalar(pose.scale);
        runtime.stageRoot.add(prop);
        runtime.entityObjects.set(id, prop);
    });

    const target = stageTarget(slot);
    runtime.camera.position.set(slot.camera.x, slot.camera.y, slot.camera.z);
    runtime.camera.fov = slot.camera.fov;
    runtime.camera.aspect = Math.max(1, runtime.renderer.domElement.clientWidth) / Math.max(1, runtime.renderer.domElement.clientHeight);
    runtime.camera.near = 0.05;
    runtime.camera.far = 100;
    runtime.camera.lookAt(target);
    runtime.camera.updateProjectionMatrix();
    runtime.controls.target.copy(target);
    runtime.controls.update();
    runtime.renderer.render(runtime.scene, runtime.camera);
}

function createActor(index: number, entityId: string, label: string) {
    const colors = [0x2f8077, 0xd56d57, 0xd2a72f, 0x526f9f, 0x8a659c, 0x557a55];
    const accent = new THREE.MeshStandardMaterial({ color: colors[index % colors.length], roughness: 0.46, metalness: 0.08 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b99f, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x28302e, roughness: 0.62 });
    const group = new THREE.Group();
    group.userData.entityId = entityId;
    group.userData.entityLabel = label;

    const torso = mesh(new THREE.CapsuleGeometry(0.29, 0.62, 6, 12), accent, 1.18);
    const head = mesh(new THREE.SphereGeometry(0.23, 24, 16), skin, 1.82);
    const hips = mesh(new THREE.BoxGeometry(0.48, 0.22, 0.3), dark, 0.74);
    group.add(torso, head, hips);
    [-1, 1].forEach((side) => {
        const arm = mesh(new THREE.CapsuleGeometry(0.085, 0.48, 4, 8), accent, 1.2);
        arm.position.x = side * 0.38;
        arm.rotation.z = side * 0.08;
        group.add(arm);
        const leg = mesh(new THREE.CapsuleGeometry(0.105, 0.62, 4, 8), dark, 0.34);
        leg.position.x = side * 0.15;
        group.add(leg);
    });
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 32), new THREE.MeshBasicMaterial({ color: colors[index % colors.length], transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.012;
    group.add(marker);
    markEntity(group, entityId);
    return group;
}

function createProp(label: string, index: number, entityId: string) {
    const material = new THREE.MeshStandardMaterial({ color: [0xb59a70, 0x738985, 0xa3685a, 0x6e7488][index % 4], roughness: 0.72, metalness: 0.03 });
    const group = new THREE.Group();
    const lower = label.toLowerCase();
    if (/桌|table/.test(lower)) {
        group.add(mesh(new THREE.BoxGeometry(1.35, 0.12, 0.72), material, 0.78));
        [-0.52, 0.52].forEach((x) => [-0.24, 0.24].forEach((z) => {
            const leg = mesh(new THREE.BoxGeometry(0.09, 0.72, 0.09), material, 0.36);
            leg.position.set(x, leg.position.y, z);
            group.add(leg);
        }));
    } else if (/椅|chair/.test(lower)) {
        group.add(mesh(new THREE.BoxGeometry(0.64, 0.1, 0.64), material, 0.5));
        const back = mesh(new THREE.BoxGeometry(0.64, 0.82, 0.1), material, 0.9);
        back.position.z = -0.27;
        group.add(back);
    } else if (/门|door/.test(lower)) {
        group.add(mesh(new THREE.BoxGeometry(1.05, 2.2, 0.12), material, 1.1));
    } else {
        group.add(mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), material, 0.36));
    }
    group.userData.entityId = entityId;
    group.userData.entityLabel = label;
    markEntity(group, entityId);
    return group;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, y: number) {
    const result = new THREE.Mesh(geometry, material);
    result.position.y = y;
    result.castShadow = true;
    result.receiveShadow = true;
    return result;
}

function markEntity(root: THREE.Object3D, entityId: string) {
    root.traverse((child) => {
        child.userData.entityId = entityId;
    });
}

function stageTarget(slot: DirectorStageSlot) {
    const entities = [...slot.subjects, ...slot.props];
    if (!entities.length) return new THREE.Vector3(0, 1, 0);
    const x = entities.reduce((sum, item) => sum + item.x, 0) / entities.length;
    const z = entities.reduce((sum, item) => sum + item.z, 0) / entities.length;
    const actorHeight = slot.subjects.length ? 1.15 : 0.65;
    return new THREE.Vector3(x, actorHeight, z);
}

function captureStage(runtime: StageRuntime, slot: DirectorStageSlot): DirectorStageCapture {
    const canvas = runtime.renderer.domElement;
    const previousWidth = Math.max(1, canvas.clientWidth);
    const previousHeight = Math.max(1, canvas.clientHeight);
    runtime.renderer.setPixelRatio(1);
    runtime.renderer.setSize(1280, 720, false);
    runtime.camera.aspect = 16 / 9;
    runtime.camera.updateProjectionMatrix();
    runtime.renderer.render(runtime.scene, runtime.camera);
    const dataUrl = canvas.toDataURL("image/png");
    runtime.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    runtime.renderer.setSize(previousWidth, previousHeight, false);
    runtime.camera.aspect = previousWidth / previousHeight;
    runtime.camera.updateProjectionMatrix();
    return {
        shotId: slot.shot_id,
        slot: slot.slot,
        title: slot.dramatic_function,
        prompt: slot.compressed_video_prompt || slot.beat || slot.dramatic_function,
        dataUrl,
        width: 1280,
        height: 720,
    };
}

function selectRuntimeObject(runtime: StageRuntime, id: string, setSelected: (value: SelectedTransform | null) => void) {
    const object = runtime.entityObjects.get(id);
    if (!object) return;
    setRuntimeSelection(runtime, object);
    const label = typeof object.userData.entityLabel === "string" ? object.userData.entityLabel : id.replace(/^(actor|prop):/, "");
    setSelected({ id, label, kind: id.startsWith("actor:") ? "角色" : "道具", x: object.position.x, y: object.position.y, z: object.position.z, rotationY: THREE.MathUtils.radToDeg(object.rotation.y), scale: object.scale.x });
}

function setRuntimeSelection(runtime: StageRuntime, object: THREE.Object3D) {
    clearRuntimeSelection(runtime);
    const helper = new THREE.BoxHelper(object, 0xff8a65);
    helper.material.transparent = true;
    helper.material.opacity = 0.92;
    helper.material.depthTest = false;
    helper.renderOrder = 20;
    runtime.scene.add(helper);
    runtime.selectionHelper = helper;
}

function clearRuntimeSelection(runtime: StageRuntime) {
    if (!runtime.selectionHelper) return;
    runtime.scene.remove(runtime.selectionHelper);
    runtime.selectionHelper.geometry.dispose();
    runtime.selectionHelper.material.dispose();
    runtime.selectionHelper = null;
}

function findEntityId(object?: THREE.Object3D) {
    let current = object;
    while (current) {
        if (typeof current.userData.entityId === "string") return current.userData.entityId as string;
        current = current.parent || undefined;
    }
    return "";
}

function clearGroup(group: THREE.Group) {
    group.children.slice().forEach((child) => {
        group.remove(child);
        child.traverse((item) => {
            const meshItem = item as THREE.Mesh;
            meshItem.geometry?.dispose?.();
            const materials = Array.isArray(meshItem.material) ? meshItem.material : meshItem.material ? [meshItem.material] : [];
            materials.forEach((material) => material.dispose());
        });
    });
}

function disposeStageRuntime(runtime: StageRuntime) {
    clearRuntimeSelection(runtime);
    clearGroup(runtime.stageRoot);
    runtime.controls.dispose();
    runtime.renderer.dispose();
    runtime.scene.traverse((item) => {
        const meshItem = item as THREE.Mesh;
        meshItem.geometry?.dispose?.();
        const materials = Array.isArray(meshItem.material) ? meshItem.material : meshItem.material ? [meshItem.material] : [];
        materials.forEach((material) => material.dispose());
    });
}

async function waitForRuntime(ref: { current: StageRuntime | null }) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (ref.current) return ref.current;
        await settleFrames(1);
    }
    throw new Error("3D 导演台初始化超时");
}

function settleFrames(count: number) {
    return new Promise<void>((resolve) => {
        const step = (left: number) => requestAnimationFrame(() => (left <= 1 ? resolve() : step(left - 1)));
        step(Math.max(1, count));
    });
}

function StageIconButton({ label, disabled, active, danger, onClick, children }: { label: string; disabled?: boolean; active?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <Tooltip title={label}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                className={`grid size-9 place-items-center rounded-md transition hover:bg-black/8 disabled:opacity-35 dark:hover:bg-white/10 ${active ? "bg-black/10 dark:bg-white/12" : ""} ${danger ? "text-red-500 dark:text-red-400" : ""}`}
                onClick={onClick}
            >
                {children}
            </button>
        </Tooltip>
    );
}

function StageMetric({ label, value }: { label: string; value: string }) {
    return <div><div className="text-[10px] opacity-45">{label}</div><div className="mt-0.5 truncate font-medium">{value}</div></div>;
}

function EntityButton({ label, detail, selected, onClick }: { id: string; label: string; detail: string; selected: boolean; onClick: () => void }) {
    return <button type="button" className="flex items-center justify-between gap-3 border-l-2 px-3 py-2 text-left text-xs transition" style={{ borderColor: selected ? "#d56d57" : "transparent", background: selected ? "rgba(213,109,87,.09)" : "transparent" }} onClick={onClick}><span className="truncate font-medium">{label}</span><span className="max-w-[96px] truncate text-[10px] opacity-45">{detail}</span></button>;
}

function StageRange({ label, value, min, max, step, suffix = "", softFloor, onSoftFloorBlocked, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; softFloor?: number; onSoftFloorBlocked?: () => void; onChange: (value: number) => void }) {
    const precision = Math.max(0, (String(step).split(".")[1] || "").length);
    const formatValue = (next: number) => next.toFixed(precision);
    const [draft, setDraft] = useState(formatValue(value));
    const floorArmedRef = useRef(softFloor !== undefined && value < softFloor);
    const floorUnlockedRef = useRef(softFloor !== undefined && value < softFloor);
    const rangeGestureRef = useRef({ active: false, blocked: false });

    useEffect(() => {
        setDraft(formatValue(value));
        if (softFloor === undefined) return;
        if (value > softFloor) {
            floorArmedRef.current = false;
            floorUnlockedRef.current = false;
        } else if (value < softFloor) {
            floorUnlockedRef.current = true;
        }
    }, [precision, softFloor, value]);

    const applyValue = (next: number) => {
        if (softFloor === undefined || next >= softFloor) {
            if (softFloor !== undefined && next > softFloor) {
                floorArmedRef.current = false;
                floorUnlockedRef.current = false;
            }
            onChange(next);
            return next;
        }
        if (floorUnlockedRef.current || (floorArmedRef.current && !rangeGestureRef.current.blocked)) {
            floorArmedRef.current = false;
            floorUnlockedRef.current = true;
            onChange(next);
            return next;
        }
        const firstBlock = !rangeGestureRef.current.blocked;
        if (rangeGestureRef.current.active) rangeGestureRef.current.blocked = true;
        else floorArmedRef.current = true;
        onChange(softFloor);
        if (firstBlock) onSoftFloorBlocked?.();
        return softFloor;
    };

    const endRangeGesture = () => {
        if (rangeGestureRef.current.blocked) floorArmedRef.current = true;
        rangeGestureRef.current = { active: false, blocked: false };
    };

    const commit = () => {
        const parsed = Number(draft);
        if (!Number.isFinite(parsed)) {
            setDraft(formatValue(value));
            return;
        }
        const clamped = Math.min(max, Math.max(min, parsed));
        const snapped = Number((Math.round(clamped / step) * step).toFixed(precision));
        const applied = applyValue(snapped);
        setDraft(formatValue(applied));
    };

    return (
        <label className="grid gap-1.5">
            <span className="flex items-center justify-between gap-3 text-[10px] opacity-60">
                <span>{label}</span>
                <span className="inline-flex h-6 items-center border-b border-black/15 px-1.5 tabular-nums dark:border-white/20">
                    <input
                        aria-label={`${label}精确数值`}
                        className="w-14 bg-transparent text-right text-[11px] font-medium outline-none"
                        type="number"
                        inputMode="decimal"
                        value={draft}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={commit}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") {
                                setDraft(formatValue(value));
                                event.currentTarget.blur();
                            }
                        }}
                    />
                    {suffix ? <span className="ml-0.5">{suffix}</span> : null}
                </span>
            </span>
            <input
                className="h-1.5 w-full accent-[#d56d57]"
                type="range"
                value={value}
                min={min}
                max={max}
                step={step}
                onPointerDown={() => {
                    rangeGestureRef.current = { active: true, blocked: false };
                }}
                onPointerUp={endRangeGesture}
                onPointerCancel={endRangeGesture}
                onChange={(event) => applyValue(Number(event.target.value))}
            />
        </label>
    );
}
