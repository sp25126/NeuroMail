import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.UI.ThreadOpen");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { threadId } = await req.json();

        logger.info("Thread open requested", {
            userId: session.user.id,
            threadId,
        });

        // Return ONLY metadata, NO email content
        return Response.json({
            success: true,
            currentThread: threadId,
            view: "thread",
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error("Thread open failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
