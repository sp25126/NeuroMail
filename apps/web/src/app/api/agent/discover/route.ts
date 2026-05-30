import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { functionComposer } from "@/agent/function-composer/composer";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Agent.Discover");

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const capabilities = await functionComposer.discoverCapabilities();

        logger.info("Capabilities discovered by AI", {
            userId: session.user.id,
            operationsCount: capabilities.operations.length,
            functionsCount: capabilities.composedFunctions.length,
        });

        return Response.json(capabilities);
    } catch (error: any) {
        logger.error("Discovery failed", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
