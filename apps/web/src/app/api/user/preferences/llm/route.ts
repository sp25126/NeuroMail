import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getUserLLMConfig, updateUserLLMConfig } from "@/lib/user-preferences";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Preferences.LLM");

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const config = await getUserLLMConfig(session.user.id);

        // Mask API key
        if (config.apiKey) {
            config.apiKey = "sk-****" + config.apiKey.slice(-4);
        }

        return Response.json(config);
    } catch (error: any) {
        logger.error("Failed to get LLM config", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        await updateUserLLMConfig(session.user.id, body);

        logger.info("LLM config updated", {
            userId: session.user.id,
            provider: body.provider,
        });

        return Response.json({ success: true });
    } catch (error: any) {
        logger.error("Failed to update LLM config", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
