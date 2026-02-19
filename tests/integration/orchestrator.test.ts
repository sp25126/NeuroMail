import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "@/agent/orchestrator";

describe("AgentOrchestrator Integration", () => {
    const orchestrator = new AgentOrchestrator();

    it("should execute complete request flow", async () => {
        const request = {
            sessionId: "test-session",
            userMessage: "Compose an email to john@example.com about the meeting",
            appState: {
                view: "inbox" as const,
                filters: { label: "INBOX" as const, unreadOnly: false },
                userId: "test-user",
                sessionId: "test-session",
            },
            recentThreads: [],
            llmConfig: {
                provider: "colab" as const,
                model: "gemma2:2b",
                baseUrl: "https://0fb2-34-73-208-38.ngrok-free.app",
                temperature: 0.7,
                streamingEnabled: false,
            },
        };

        const response = await orchestrator.executeRequest(request);

        expect(response.assistantMessage).toBeTruthy();
        expect(response.metadata.traceId).toBeTruthy();
        expect(response.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    }, 30000); // 30s timeout (though with mock it should be fast)

    it("should handle tool execution errors gracefully", async () => {
        const request = {
            sessionId: "test-session",
            userMessage: "Reply to this email", // No current thread -> might trigger error if tool attempted
            appState: {
                view: "inbox" as const,
                filters: { label: "INBOX" as const, unreadOnly: false },
                userId: "test-user",
                sessionId: "test-session",
            },
            recentThreads: [],
            llmConfig: {
                provider: "colab" as const,
                model: "llama3.2:latest",
                baseUrl: "https://0fb2-34-73-208-38.ngrok-free.app",
                temperature: 0.7,
                streamingEnabled: false,
            },
        };

        const response = await orchestrator.executeRequest(request);

        // Should complete without throwing
        expect(response.assistantMessage).toBeTruthy();
    }, 30000);
});
