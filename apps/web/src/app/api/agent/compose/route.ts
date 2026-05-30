import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { functionComposer } from "@/agent/function-composer/composer";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Agent.Compose");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const request = await req.json();

        const composedFunction = await functionComposer.composeFunction(request);

        logger.info("Function composed by AI", {
            userId: session.user.id,
            functionId: composedFunction.id,
        });

        return Response.json({ function: composedFunction });
    } catch (error: any) {
        logger.error("Composition failed", { error: error.message });
        return Response.json(
            { error: error.message },
            { status: 400 }
        );
    }
}
