"use client";

import { App, Button, Form, Input, Select } from "antd";
import { ExternalLink, LogIn, LogOut, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { PROMPT_HUB_DEFAULTS } from "@/services/prompt-hub";
import { usePromptHubStore } from "@/stores/use-prompt-hub-store";

export function PromptHubSettingsPanel() {
    const { message } = App.useApp();
    const apiBase = usePromptHubStore((state) => state.apiBase);
    const email = usePromptHubStore((state) => state.email);
    const session = usePromptHubStore((state) => state.session);
    const credits = usePromptHubStore((state) => state.credits);
    const imageModel = usePromptHubStore((state) => state.imageModel);
    const imageModels = usePromptHubStore((state) => state.imageModels);
    const setApiBase = usePromptHubStore((state) => state.setApiBase);
    const setEmail = usePromptHubStore((state) => state.setEmail);
    const setImageModel = usePromptHubStore((state) => state.setImageModel);
    const login = usePromptHubStore((state) => state.login);
    const logout = usePromptHubStore((state) => state.logout);
    const verifySession = usePromptHubStore((state) => state.verifySession);
    const refreshGenerationAccount = usePromptHubStore((state) => state.refreshGenerationAccount);
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const loggedIn = Boolean(session?.access_token);
    const displayEmail = session?.user?.email || email;

    useEffect(() => {
        if (loggedIn) void refreshGenerationAccount();
    }, [loggedIn, refreshGenerationAccount]);

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            message.warning("请填写 Prompt Hub 邮箱和密码");
            return;
        }
        setLoading(true);
        try {
            await login(email.trim(), password);
            setPassword("");
            message.success("已连接 Prompt Hub：可浏览卡片库，画布生图将消耗卡藏积分");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        setLoading(true);
        try {
            const ok = await verifySession();
            if (ok) await refreshGenerationAccount();
            message[ok ? "success" : "warning"](ok ? "Prompt Hub 连接正常" : "登录已失效，请重新登录");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form layout="vertical" requiredMark={false}>
            <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <div className="text-sm font-semibold">Prompt Hub 卡片库</div>
                <div className="mt-1 text-xs leading-5 text-stone-500">
                    连接账号后：插入素材可浏览卡片库；画布<strong>生图节点模型下拉</strong>会出现「卡藏 · …」选项（扣卡藏积分）。下方可设默认卡藏模型。
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <Form.Item label="API 地址" className="mb-4 md:col-span-2" extra="默认使用海外站 api.prompt-hubs.com；本地开发一般无需修改。">
                    <Input value={apiBase} placeholder={PROMPT_HUB_DEFAULTS.apiBase} onChange={(event) => setApiBase(event.target.value)} />
                </Form.Item>
                <Form.Item label="登录邮箱" className="mb-4">
                    <Input value={email} autoComplete="username" placeholder="你的 Prompt Hub 邮箱" onChange={(event) => setEmail(event.target.value)} disabled={loggedIn} />
                </Form.Item>
                <Form.Item label="密码" className="mb-4">
                    <Input.Password value={password} autoComplete="current-password" placeholder={loggedIn ? "已登录" : "Prompt Hub 密码"} onChange={(event) => setPassword(event.target.value)} disabled={loggedIn} />
                </Form.Item>
                {loggedIn ? (
                    <>
                        <Form.Item label="卡藏生图模型" className="mb-4 md:col-span-2" extra="连接后画布图片生成优先使用此模型；积分从卡藏账户扣除。">
                            <Select
                                value={imageModel}
                                options={imageModels.map((m) => ({ value: m.id, label: m.label || m.id }))}
                                onChange={setImageModel}
                                placeholder={imageModels.length ? "选择模型" : "加载模型列表…"}
                                loading={!imageModels.length}
                            />
                        </Form.Item>
                        <Form.Item label="卡藏积分余额" className="mb-4">
                            <Input value={credits == null ? "加载中…" : String(credits)} readOnly />
                        </Form.Item>
                    </>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {loggedIn ? (
                    <>
                        <Button icon={<LogOut className="size-4" />} onClick={() => { logout(); setPassword(""); message.success("已退出 Prompt Hub"); }}>
                            退出登录
                        </Button>
                        <Button icon={<Save className="size-4" />} loading={loading} onClick={() => void handleVerify()}>
                            测试连接
                        </Button>
                        <span className="text-xs text-stone-500">已登录：{displayEmail}</span>
                    </>
                ) : (
                    <Button type="primary" icon={<LogIn className="size-4" />} loading={loading} onClick={() => void handleLogin()}>
                        连接 Prompt Hub
                    </Button>
                )}
                <Button icon={<ExternalLink className="size-4" />} href={PROMPT_HUB_DEFAULTS.siteUrl} target="_blank" rel="noreferrer">
                    打开 Prompt Hub
                </Button>
            </div>
        </Form>
    );
}
