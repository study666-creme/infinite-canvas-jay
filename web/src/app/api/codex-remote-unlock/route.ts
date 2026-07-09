import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = String(body.code || "").trim();
    const codes = String(process.env.CODEX_REMOTE_UNLOCK_CODES || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    if (!code) return NextResponse.json({ ok: false, error: "请输入激活码。" }, { status: 400 });
    if (!codes.length) return NextResponse.json({ ok: false, error: "站点暂未配置激活码。" }, { status: 503 });
    if (!codes.includes(code)) return NextResponse.json({ ok: false, error: "激活码不正确。" }, { status: 403 });

    return NextResponse.json({ ok: true });
}
