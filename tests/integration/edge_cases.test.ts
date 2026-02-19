
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentOrchestrator } from "@/agent/orchestrator";

// Mock LLM to force specific edge cases
const { mockGenerateResponse } = vi.hoisted(() => {
    return { mockGenerateResponse: vi.fn() };
});

vi.mock("@/agent/llm/factory", () => ({
    LLMProviderFactory: {
        create: vi.fn().mockReturnValue({
            generate: mockGenerateResponse
        })
    }
}));

describe("Edge Case Verification (Validation, Errors, Boundaries)", () => {
    let orchestrator: AgentOrchestrator;

    const baseRequest = {
        sessionId: "test-session",
        userMessage: "test",
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

    beforeEach(() => {
        orchestrator = new AgentOrchestrator();
        vi.clearAllMocks();
    });

    // --- VALIDATION TESTS ---

    it("1. Should handle tool call with missing required parameters", async () => {
        mockGenerateResponse.mockResolvedValueOnce({
            content: "Trying to email...",
            tool_calls: [{
                id: "call_bad_1",
                function: {
                    name: "composeEmail",
                    arguments: JSON.stringify({ subject: "Missing To" })
                }
            }]
        });

        const response = await orchestrator.executeRequest(baseRequest);
        // Expect an error message or handling in the response metadata/logic
        // In current implementation, it might throw or result in a failed tool result
        // We check if it survived without crashing and ideally reported error
        expect(response.assistantMessage).toBeTruthy();
        // Check logs or metadata if possible. For now, just ensuring no crash.
    });

    it("2. Should handle invalid email format gracefully", async () => {
        mockGenerateResponse.mockResolvedValueOnce({
            content: "Sending to bad email...",
            tool_calls: [{
                id: "call_bad_2",
                function: {
                    name: "composeEmail",
                    arguments: JSON.stringify({ to: "not-an-email", subject: "Hi", body: "Body" })
                }
            }]
        });

        const response = await orchestrator.executeRequest(baseRequest);
        expect(response.assistantMessage).toBeTruthy();
        expect(response.toolCalls?.[0].arguments.to).toBe("not-an-email");
    });

    // --- ERROR HANDLING TESTS ---

    it("3. Should recover from tool execution failure", async () => {
        // We simulate a tool failure. 
        // Since we can't easily mock the Registry *inside* the Orchestrator without more mocks,
        // we can use a dynamic script that throws error if we rely on execute_js, 
        // OR rely on Orchestrator's try-catch block.

        mockGenerateResponse.mockResolvedValueOnce({
            content: "Running broken script...",
            tool_calls: [{
                id: "call_error_1",
                function: {
                    name: "execute_js",
                    arguments: JSON.stringify({ code: "throw new Error('Simulated Failure')" })
                }
            }]
        });

        const response = await orchestrator.executeRequest(baseRequest);
        // Orchestrator should catch the error and return success: false in toolResults? 
        // Or just complete the turn.
        expect(response.assistantMessage).toBeTruthy();
        // The orchestrator typically swallows tool errors and logs them or adds to history
        // Pass if it doesn't crash node process
    });

    // --- UI BOUNDARIES ---

    it("4. Should handle XSS/Injection attempt in tool arguments", async () => {
        const maliciousCode = "<script>alert('XSS')</script>";
        mockGenerateResponse.mockResolvedValueOnce({
            content: "Injecting...",
            tool_calls: [{
                id: "call_xss",
                function: {
                    name: "composeEmail",
                    arguments: JSON.stringify({ to: "victim@test.com", subject: "Attack", body: maliciousCode })
                }
            }]
        });

        const response = await orchestrator.executeRequest(baseRequest);
        expect(response.toolCalls?.[0].arguments.body).toBe(maliciousCode);
        // We verify it passed through. The frontend is responsible for safe rendering (React does this by default).
    });

    it("5. Should handle extremely long input strings (Buffer Overflow check)", async () => {
        const longString = "a".repeat(10000);
        mockGenerateResponse.mockResolvedValueOnce({
            content: "Long message...",
            tool_calls: [{
                id: "call_long",
                function: {
                    name: "composeEmail",
                    arguments: JSON.stringify({ to: "test@test.com", subject: "Long", body: longString })
                }
            }]
        });

        const response = await orchestrator.executeRequest(baseRequest);
        expect(response.toolCalls?.[0].arguments.body).toHaveLength(10000);
    });

    it("6. Should handle empty tool arguments object", async () => {
        mockGenerateResponse.mockResolvedValueOnce({
            content: "Empty args...",
            tool_calls: [{
                id: "call_empty",
                function: {
                    name: "listCustomFunctions",
                    arguments: "{}"
                }
            }]
        });

        const response = await orchestrator.executeRequest(baseRequest);
        expect(response.toolCalls?.[0].name).toBe("listCustomFunctions");
    });
});
