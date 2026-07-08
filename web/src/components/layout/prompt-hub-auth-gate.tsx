"use client";

import type { ReactNode } from "react";
import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";

import { prepareCanvasStorageForSession, setCanvasStorageUserFromSession } from "@/app/(user)/canvas/stores/use-canvas-store";
import { promptHubUserIdentity } from "@/lib/prompt-hub-auth";
import { prepareAssetStorageForSession, setAssetStorageUserFromSession } from "@/stores/use-asset-store";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";
import { useUserStore } from "@/stores/use-user-store";
import { PROMPT_HUB_DEFAULTS, type PromptHubSession } from "@/services/prompt-hub";

type AuthState = "checking" | "ready" | "authenticated";

export function PromptHubAuthGate({ children }: { children: ReactNode }) {
    const apiBase = usePromptHubStore((state) => state.apiBase);
    const savedEmail = usePromptHubStore((state) => state.email);
    const session = usePromptHubStore((state) => state.session);
    const setApiBase = usePromptHubStore((state) => state.setApiBase);
    const login = usePromptHubStore((state) => state.login);
    const logout = usePromptHubStore((state) => state.logout);
    const verifySession = usePromptHubStore((state) => state.verifySession);
    const setLocalUser = useUserStore((state) => state.setUser);
    const [email, setEmail] = useState(savedEmail);
    const [password, setPassword] = useState("");
    const [state, setState] = useState<AuthState>("checking");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => setEmail((value) => value || savedEmail), [savedEmail]);

    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            if (!session?.access_token) {
                setCanvasStorageUserFromSession(null);
                setAssetStorageUserFromSession(null);
                setLocalUser(null);
                setState("ready");
                return;
            }
            setState("checking");
            const ok = await verifySession().catch(() => false);
            if (cancelled) return;
            const activeSession = usePromptHubStore.getState().session;
            if (!ok || !activeSession?.access_token) {
                logout();
                setCanvasStorageUserFromSession(null);
                setAssetStorageUserFromSession(null);
                setLocalUser(null);
                setState("ready");
                return;
            }
            await activateSession(activeSession);
            if (!cancelled) setState("authenticated");
        };
        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, [logout, session?.access_token, setLocalUser, verifySession]);

    const activateSession = async (activeSession: PromptHubSession) => {
        await Promise.all([prepareCanvasStorageForSession(activeSession), prepareAssetStorageForSession(activeSession)]);
        setCanvasStorageUserFromSession(activeSession);
        setAssetStorageUserFromSession(activeSession);
        const identity = promptHubUserIdentity(activeSession);
        setLocalUser(
            identity
                ? {
                      id: identity.id,
                      username: identity.email || identity.id,
                      displayName: identity.displayName,
                      avatarUrl: "",
                  }
                : null,
        );
    };

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            const nextSession = await login(email, password);
            await activateSession(nextSession);
            setPassword("");
            setState("authenticated");
        } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试");
        } finally {
            setSubmitting(false);
        }
    };

    if (state === "authenticated" && session?.access_token) return <>{children}</>;

    return (
        <main className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#f4f1ea] px-4 py-8 text-stone-950 dark:bg-[#070707] dark:text-stone-100">
            <div
                className="absolute inset-0 opacity-70 dark:opacity-45"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(120,113,108,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(120,113,108,.16) 1px, transparent 1px)",
                    backgroundSize: "34px 34px",
                }}
            />
            <section className="relative w-full max-w-[440px] rounded-[28px] border border-black/10 bg-white/76 p-6 shadow-[0_28px_90px_rgba(28,25,23,.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.075] dark:shadow-black/40">
                <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-stone-950 text-white shadow-sm dark:bg-white dark:text-black">
                        {state === "checking" ? <LoaderCircle className="size-5 animate-spin" /> : <LockKeyhole className="size-5" />}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400">
                            <ShieldCheck className="size-4" />
                            卡藏账号
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight">登录后使用画布</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">画布、资产、生成和远程 Codex 控制会沿用卡片库账号权限。</p>
                    </div>
                </div>

                {state === "checking" ? (
                    <div className="mt-8 rounded-2xl border border-black/10 bg-white/60 px-4 py-3 text-sm text-stone-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-400">正在校验登录状态...</div>
                ) : (
                    <form className="mt-7 grid gap-4" onSubmit={(event) => void handleLogin(event)}>
                        {error ? (
                            <div className="flex gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm leading-6 text-red-700 dark:text-red-200">
                                <AlertCircle className="mt-1 size-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        ) : null}
                        <label className="grid gap-2">
                            <span className="text-sm font-medium">邮箱</span>
                            <input
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                type="email"
                                autoComplete="email"
                                required
                                className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-[16px] outline-none transition focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]"
                            />
                        </label>
                        <label className="grid gap-2">
                            <span className="text-sm font-medium">密码</span>
                            <input
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                type="password"
                                autoComplete="current-password"
                                required
                                className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-[16px] outline-none transition focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]"
                            />
                        </label>
                        <details className="rounded-2xl border border-black/10 bg-white/54 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
                            <summary className="cursor-pointer font-medium">服务地址</summary>
                            <input
                                value={apiBase}
                                onChange={(event) => setApiBase(event.target.value)}
                                className="mt-3 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-[15px] outline-none focus:border-stone-500 dark:border-white/10 dark:bg-white/[0.06]"
                            />
                        </details>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 text-sm font-semibold text-white transition enabled:hover:scale-[1.01] disabled:opacity-50 dark:bg-white dark:!text-black"
                        >
                            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                            登录
                        </button>
                        <div className="text-center text-sm leading-6 text-stone-500 dark:text-stone-400">
                            没有卡藏账号？
                            <a className="font-medium text-stone-950 underline-offset-4 hover:underline dark:text-white" href={PROMPT_HUB_DEFAULTS.siteUrl} target="_blank" rel="noreferrer">
                                去卡片库注册
                            </a>
                        </div>
                    </form>
                )}
            </section>
        </main>
    );
}
