import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "@/agent/orchestrator";
import { AppState } from "@/agent/types";

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
                provider: "ollama" as const,
                model: "gemma2:2b",
                temperature: 0.7,
                streamingEnabled: false,
            },
        };

        const response = await orchestrator.executeRequest(request);

        expect(response.assistantMessage).toBeTruthy();
        expect(response.metadata.traceId).toBeTruthy();
        expect(response.metadata.executionTimeMs).toBeGreaterThan(0);
    }, 30000); // 30s timeout for real LLM call

    it("should handle tool execution errors gracefully", async () => {
        const request = {
            sessionId: "test-session",
            userMessage: "Reply to this email", // No current thread
            appState: {
                view: "inbox" as const,
                filters: { label: "INBOX" as const, unreadOnly: false },
                userId: "test-user",
                sessionId: "test-session",
            },
            recentThreads: [],
            llmConfig: {
                provider: "ollama" as const,
                model: "gemma2:2b",
                temperature: 0.7,
                streamingEnabled: false,
            },
        };

        const response = await orchestrator.executeRequest(request);

        // Should complete without throwing
        expect(response.assistantMessage).toBeTruthy();
    }, 30000);
});
