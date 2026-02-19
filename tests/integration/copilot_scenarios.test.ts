
import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "@/agent/orchestrator";

describe("Copilot Scenarios (Live Colab)", () => {
    const orchestrator = new AgentOrchestrator();
    const COLAB_URL = "https://0fb2-34-73-208-38.ngrok-free.app";

    const baseRequest = {
        sessionId: "test-session",
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
            baseUrl: COLAB_URL,
            temperature: 0.7,
            streamingEnabled: false,
        },
    };

    it("Scenario 1: Neon Green Button (Dynamic UI)", async () => {
        const request = {
            ...baseRequest,
            userMessage: "Change the compose button to neon green",
        };

        const response = await orchestrator.executeRequest(request);
        console.log("Neon Button Response:", response.assistantMessage);
        console.log("Tools:", response.toolCalls);

        // Expect a tool call or action indicating UI change
        expect(response.toolCalls?.length).toBeGreaterThan(0);
    }, 60000);

    it("Scenario 2: Example Email (Compose)", async () => {
        const request = {
            ...baseRequest,
            userMessage: "Draft an email to mom@example.com saying happy birthday",
        };

        const response = await orchestrator.executeRequest(request);
        console.log("Email Response:", response.assistantMessage);

        expect(response.toolCalls?.length).toBeGreaterThan(0);
        const toolCall = response.toolCalls?.[0];
        expect(toolCall?.name).toBe("composeEmail");
    }, 60000);

    it("Scenario 3: Complex Query (Search & Summarize)", async () => {
        const request = {
            ...baseRequest,
            userMessage: "Find emails from 'John' and summarize them",
        };

        const response = await orchestrator.executeRequest(request);
        console.log("Search Response:", response.assistantMessage);

        expect(response.toolCalls?.length).toBeGreaterThan(0);
        const toolNames = response.toolCalls?.map(t => t.name);
        expect(toolNames).toContain("searchEmails");
    }, 60000);
});
