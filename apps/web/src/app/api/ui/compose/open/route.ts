import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.UI.ComposeOpen");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        logger.info("Compose modal requested", {
            userId: session.user.id,
            ...body,
        });

        return Response.json({
            success: true,
            composeOpen: true,
            data: body,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error("Compose open failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
