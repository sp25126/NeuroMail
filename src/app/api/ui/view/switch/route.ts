import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.UI.ViewSwitch");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { view } = await req.json();

        logger.info("View switch requested", {
            userId: session.user.id,
            view,
        });

        // This triggers frontend state change via WebSocket or polling
        // For now, just return success
        return Response.json({
            success: true,
            currentView: view,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error("View switch failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
