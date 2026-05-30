import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.UI.FilterApply");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const filters = await req.json();

        logger.info("Filters applied", {
            userId: session.user.id,
            filters,
        });

        return Response.json({
            success: true,
            filters,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error("Filter apply failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
