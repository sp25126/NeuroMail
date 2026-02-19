import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");

    if (!url) {
        return Response.json({ ok: false, error: "No URL provided" }, { status: 400 });
    }

    try {
        const cleanUrl = url.replace(/\/$/, "");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${cleanUrl}/health`, {
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
        });

        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return Response.json({ ok: true, model: data.model, status: "connected" });
        }

        return Response.json({ ok: false, error: `HTTP ${res.status}` });
    } catch (e: any) {
        if (e.name === "AbortError") {
            return Response.json({ ok: false, error: "Connection timed out (8s)" });
        }
        return Response.json({ ok: false, error: e.message || "Connection failed" });
    }
}
