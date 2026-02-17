import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.UI.SearchExecute");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { query } = await req.json();

        logger.info("Search requested via UI bridge", {
            userId: session.user.id,
            query,
        });

        return Response.json({
            success: true,
            query,
            searchActive: true,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error("Search execution failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
