import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { executionSandbox } from "@/agent/execution-sandbox/sandbox";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Agent.Execute");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { type, id, arguments: args } = await req.json();
        const sessionId = (session as any).sessionId || session.user.id;

        let result;

        if (type === "operation") {
            result = await executionSandbox.executeOperation({
                operationId: id,
                arguments: args,
                sessionId,
                userId: session.user.id,
            });
        } else if (type === "function") {
            result = await executionSandbox.executeComposedFunction({
                functionId: id,
                arguments: args,
                sessionId,
                userId: session.user.id,
            });
        } else {
            throw new Error("Invalid execution type");
        }

        return Response.json({ result });
    } catch (error: any) {
        logger.error("Execution failed", { error: error.message });
        return Response.json(
            { error: error.message },
            { status: 400 }
        );
    }
}
