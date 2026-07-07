"use client";

import { ArrowRight, ImagePlus, Layers3, Sparkles, Video } from "lucide-react";
import { Button } from "antd";

const workflowItems = [
    { label: "提示词", text: "收集灵感、角色设定、镜头语言和风格描述。", icon: Sparkles },
    { label: "画布", text: "把文本、图片、视频参考和生成节点连接成可迭代流程。", icon: Layers3 },
    { label: "生成", text: "从生图到视频连续推进，保留每一次有效结果。", icon: ImagePlus },
    { label: "复用", text: "沉淀到卡藏资产，下一次创作直接从经验开始。", icon: Video },
];

export default function IndexPage() {
    return (
        <main className="relative h-full overflow-y-auto bg-[#f6f4ef] text-[#171513] dark:bg-[#060606] dark:text-stone-100">
            <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-5 py-8 sm:px-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,.10)_1px,transparent_1.5px)] [background-size:26px_26px] opacity-35 dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,.18)_1px,transparent_1.5px)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.95),transparent_66%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.13),transparent_68%)]" />
                <div className="pointer-events-none absolute bottom-0 left-1/2 h-[52rem] w-[52rem] -translate-x-1/2 rounded-full border border-black/[0.06] dark:border-white/[0.07]" />

                <div className="relative mx-auto flex min-h-[calc(100vh-8rem)] max-w-7xl flex-col justify-center">
                    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_520px]">
                        <div className="max-w-4xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/55 px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-300">
                                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.85)]" />
                                卡藏创作工作台
                            </div>
                            <h1 className="mt-8 max-w-5xl text-balance text-5xl font-semibold leading-[0.96] tracking-normal text-[#11100f] sm:text-7xl lg:text-8xl dark:text-white">
                                卡藏
                                <span className="block text-stone-500 dark:text-stone-400">提示词画布</span>
                            </h1>
                            <p className="mt-7 max-w-2xl text-balance text-lg leading-8 text-stone-600 sm:text-xl dark:text-stone-300">
                                把提示词、参考图、视频节点和创作判断放进同一张画布里，像整理 Apple 级工作台一样沉淀你的生成流程。
                            </p>
                            <div className="mt-10 flex flex-wrap items-center gap-3">
                                <Button type="primary" size="large" href="/canvas" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                                    进入画布
                                </Button>
                                <Button size="large" href="/assets">
                                    打开卡藏资产
                                </Button>
                            </div>
                        </div>

                        <div className="relative hidden min-h-[520px] lg:block">
                            <div className="absolute inset-0 rounded-[2rem] border border-black/10 bg-white/45 shadow-[0_30px_90px_rgba(23,21,19,.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.045] dark:shadow-[0_30px_110px_rgba(0,0,0,.42)]" />
                            <div className="absolute inset-4 rounded-[1.5rem] border border-black/[0.06] bg-[#f9f8f4]/70 p-4 dark:border-white/[0.07] dark:bg-black/35">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-stone-900 dark:text-stone-100">创作链路</div>
                                        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Prompt to Canvas</div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                                        <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                                        <span className="size-2.5 rounded-full bg-[#28c840]" />
                                    </div>
                                </div>
                                <div className="mt-8 space-y-3">
                                    {workflowItems.map((item, index) => {
                                        const Icon = item.icon;
                                        return (
                                            <div
                                                key={item.label}
                                                className="relative rounded-2xl border border-black/[0.07] bg-white/70 p-4 shadow-[0_12px_36px_rgba(23,21,19,.08)] dark:border-white/[0.08] dark:bg-white/[0.055]"
                                                style={{ marginLeft: index % 2 ? 38 : 0 }}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black text-white dark:bg-white dark:text-black">
                                                        <Icon className="size-4" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold">{item.label}</div>
                                                        <div className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">{item.text}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
