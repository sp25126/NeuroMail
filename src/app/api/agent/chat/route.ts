import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { orchestrator } from "@/agent/orchestrator";
import { createLogger } from "@/agent/observability/logger";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger("API.Chat");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { message, sessionId, appState, currentThread, recentThreads, persona, aiProvider, aiModel, aiApiKey, colabUrl, availableTools } = body;

        const traceId = uuidv4();

        logger.info("Chat request received", {
            userId: session.user.id,
            sessionId,
            traceId,
            messageLength: message?.length,
            toolsCount: availableTools?.length || 0,
            provider: aiProvider,
            colabUrl: colabUrl || "undefined", // DEBUG LOG
        });

        // Execute with orchestrator
        const response = await orchestrator.executeRequest({
            userMessage: message,
            sessionId: sessionId || `session-${uuidv4()}`,
            appState: appState || { view: "inbox", filters: {} },
            currentThread,
            recentThreads: recentThreads || [],
            persona: persona || "professional",
            cookies: req.headers.get("cookie") || "", // Pass cookies for server-side API calls
            availableTools: availableTools || [], // Pass client capabilities
            llmConfig: {
                provider: aiProvider || "ollama",
                model: aiModel || "llama3.2:latest",
                apiKey: aiApiKey || undefined,
                baseUrl: aiProvider === "colab" ? colabUrl : undefined,
                temperature: 0.3,
                streamingEnabled: false,
            },
        });

        logger.info("Chat request completed", {
            userId: session.user.id,
            sessionId,
            traceId,
            actionsCount: response.actions?.length || 0,
        });

        // Return actions for frontend to execute
        return Response.json({
            assistantMessage: response.assistantMessage,
            actions: response.actions || [], // CRITICAL: Return actions
            toolCalls: response.toolCalls || [],
            toolResults: response.toolResults || [],
            metadata: response.metadata || {},
        });
    } catch (error: any) {
        console.error("❌ [API] Error:", error);

        return Response.json(
            {
                assistantMessage: "I encountered an error. Please try again.",
                actions: [],
                error: error.message,
            },
            { status: 500 }
        );
    }
}
