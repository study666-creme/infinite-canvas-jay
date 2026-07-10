import Link from 'next/link';
import { ArrowUpRight, Bot, BookOpen, Box, Network, Workflow } from 'lucide-react';
import { appName, gitConfig } from '@/lib/shared';

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
const demoUrl = 'https://infinite-canvas-jay.vercel.app/canvas';

const capabilities = [
  {
    icon: Workflow,
    title: '节点式创作',
    text: '把提示词、参考图、视频、音频和生成参数组织成可复用流程。',
  },
  {
    icon: Bot,
    title: '画布 Agent',
    text: '读取真实节点，维护项目黑板，并按当前缺口推进创作任务。',
  },
  {
    icon: Box,
    title: '3D 分镜预演',
    text: '自动摆角色、道具和机位，批量生成 1280x720 预演截图。',
  },
  {
    icon: Network,
    title: '本地优先数据',
    text: '浏览器账号分区、媒体 Blob、本地目录与可选 WebDAV 同步。',
  },
];

export default function HomePage() {
  return (
    <main className="flex w-full flex-1 flex-col bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="relative min-h-[min(720px,78vh)] overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <img
          src="/screenshots/director-stage.png"
          alt="卡藏提示词画布 3D 导演台"
          className="absolute inset-0 size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 mx-auto flex min-h-[min(720px,78vh)] w-full max-w-6xl flex-col justify-end px-5 pb-12 pt-28 text-white md:px-10 md:pb-16">
          <div className="max-w-3xl">
            <div className="text-sm font-medium text-white/70">AI 图片与视频创作工作台</div>
            <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-6xl">{appName}</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/78 md:text-lg">
              从故事、资产和文字分镜，到模型生成、3D 机位预演与结果沉淀，集中在一张持续生长的画布中。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/docs/overview/quick-start" className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200">
                <BookOpen className="size-4" />
                阅读文档
              </Link>
              <a href={demoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-2 rounded-md border border-white/35 px-4 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10">
                在线体验
                <ArrowUpRight className="size-4" />
              </a>
              <a href={githubUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-2 px-2 text-sm font-semibold text-white/82 transition hover:text-white">
                GitHub
                <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 py-14 dark:border-zinc-800 md:py-18">
        <div className="mx-auto w-full max-w-6xl px-5 md:px-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold md:text-3xl">当前能力</h2>
            <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-400">文档只描述当前代码已经具备的能力，并单独标注仍需真实环境验证的部分。</p>
          </div>
          <div className="mt-9 grid border-t border-zinc-200 dark:border-zinc-800 md:grid-cols-2">
            {capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="grid grid-cols-[36px_1fr] gap-4 border-b border-zinc-200 py-6 md:odd:pr-8 md:even:border-l md:even:pl-8 dark:border-zinc-800">
                  <Icon className="mt-0.5 size-5 text-emerald-700 dark:text-emerald-400" />
                  <div>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 md:py-18">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 md:flex-row md:items-end md:justify-between md:px-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold md:text-3xl">从真实边界开始</h2>
            <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-400">登录不等于云同步，知识库不等于模型后训练，3D 导演台也不是完整动画软件。部署、数据、安全与许可说明都可以在文档中直接查到。</p>
          </div>
          <Link href="/docs/overview/features" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-900 hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-400">
            查看功能与限制
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
