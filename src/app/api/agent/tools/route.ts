import { NextRequest } from "next/server";
import { toolRegistry } from "@/agent/tools/registry";
import { auth } from "@/lib/auth";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Tools");

// GET /api/agent/tools - List all available tools
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tools = await toolRegistry.getAllTools(session.user.id);

        return Response.json({ tools });
    } catch (error: any) {
        logger.error("Failed to list tools", { error: error.message });
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/agent/tools - Execute a tool directly
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { toolId, arguments: args, context, traceId } = body;

        const result = await toolRegistry.executeTool({
            toolId,
            arguments: args,
            context,
            traceId: traceId || `direct_${Date.now()}`,
        });

        return Response.json(result);
    } catch (error: any) {
        logger.error("Tool execution failed", { error: error.message });
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
