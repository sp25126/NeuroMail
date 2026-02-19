import { NextRequest } from "next/server";
import { orchestrator } from "@/agent/orchestrator";
import { auth } from "@/lib/auth";
import { getUserLLMConfig } from "@/lib/user-preferences";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Stream");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new Response("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const {
            message,
            sessionId,
            appState,
            currentThread,
            recentThreads,
        } = body;

        const llmConfig = await getUserLLMConfig(session.user.id);

        // Create streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of orchestrator.executeRequestStream(
                        llmConfig,
                        {
                            sessionId,
                            userMessage: message,
                            appState,
                            currentThread,
                            recentThreads,
                            llmConfig,
                        }
                    )) {
                        const data = `data: ${JSON.stringify(chunk)}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    }

                    controller.close();
                } catch (error: any) {
                    logger.error("Stream failed", { error: error.message });
                    const errorData = `data: ${JSON.stringify({
                        type: "error",
                        content: error.message,
                    })}\n\n`;
                    controller.enqueue(encoder.encode(errorData));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (error: any) {
        logger.error("Stream initialization failed", {
            error: error.message,
        });

        return new Response("Internal server error", { status: 500 });
    }
}
