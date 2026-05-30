import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.UI.StateGet");

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        logger.info("UI state requested via bridge", {
            userId: session.user.id,
        });

        // In a real implementation, this would fetch from a global state store or DB.
        // For now, return a placeholder reflecting the initial app state.
        return Response.json({
            success: true,
            view: "inbox",
            filtersActive: false,
            selectedCount: 0,
            composeOpen: false,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error("UI state fetch failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
