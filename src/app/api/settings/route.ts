import { NextRequest, NextResponse } from "next/server";
import { getServerSettings, updateServerSettings } from "@/lib/server-settings";

export async function GET() {
    try {
        const settings = getServerSettings();
        return NextResponse.json(settings);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const updated = updateServerSettings(body);
        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
