import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "@/agent/tools/registry";
import { ConversationContext, ToolExecutionRequest } from "@/agent/types";

describe("ToolRegistry", () => {
    let registry: ToolRegistry;

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    describe("Static Tools", () => {
        it("should register built-in tools", async () => {
            const tools = await registry.getAllTools("test-user");

            expect(tools.length).toBeGreaterThan(0);
            expect(tools.some(t => t.id === "mail.compose")).toBe(true);
            expect(tools.some(t => t.id === "mail.search")).toBe(true);
        });

        it("should execute compose tool", async () => {
            const context: ConversationContext = {
                appState: {
                    view: "inbox",
                    filters: { label: "INBOX", unreadOnly: false },
                    userId: "test-user",
                    sessionId: "test-session",
                },
                recentThreads: [],
                conversationHistory: [],
            };

            const request: ToolExecutionRequest = {
                toolId: "mail.compose",
                arguments: {
                    to: "test@example.com",
                    subject: "Test",
                    body: "Hello",
                },
                context,
                traceId: "test-trace",
            };

            const result = await registry.executeTool(request);

            expect(result.success).toBe(true);
            expect(result.result.action).toBe("OPEN_COMPOSE");
            expect(result.result.data.to).toBe("test@example.com");
        });
    });

    describe("Macros", () => {
        it("should create and execute a macro", async () => {
            const context: ConversationContext = {
                appState: {
                    view: "inbox",
                    filters: { label: "INBOX", unreadOnly: false },
                    userId: "test-user",
                    sessionId: "test-session",
                },
                recentThreads: [],
                conversationHistory: [],
            };

            // Create macro
            const createRequest: ToolExecutionRequest = {
                toolId: "macro.define",
                arguments: {
                    name: "quick_compose",
                    description: "Quickly compose to a specific recipient",
                    steps: [
                        {
                            toolId: "mail.compose",
                            arguments: {
                                to: "{{recipient}}",
                                subject: "Quick message",
                                body: "{{message}}",
                            },
                        },
                    ],
                    parameters: [
                        { name: "recipient", type: "string", required: true },
                        { name: "message", type: "string", required: true },
                    ],
                },
                context,
                traceId: "test-trace",
            };

            const createResult = await registry.executeTool(createRequest);
            expect(createResult.success).toBe(true);

            // Execute macro
            const executeRequest: ToolExecutionRequest = {
                toolId: "macro.quick_compose",
                arguments: {
                    recipient: "john@example.com",
                    message: "Hello John!",
                },
                context,
                traceId: "test-trace-2",
            };

            const executeResult = await registry.executeTool(executeRequest);
            expect(executeResult.success).toBe(true);
        });

        it("should validate macro structure", async () => {
            const context: ConversationContext = {
                appState: {
                    view: "inbox",
                    filters: { label: "INBOX", unreadOnly: false },
                    userId: "test-user",
                    sessionId: "test-session",
                },
                recentThreads: [],
                conversationHistory: [],
            };

            // Try to create macro with too many steps
            const request: ToolExecutionRequest = {
                toolId: "macro.define",
                arguments: {
                    name: "too_many_steps",
                    description: "Invalid macro",
                    steps: Array(20).fill({
                        toolId: "mail.compose",
                        arguments: {},
                    }),
                },
                context,
                traceId: "test-trace",
            };

            const result = await registry.executeTool(request);
            expect(result.success).toBe(false);
            expect(result.error).toContain("15 steps");
        });
    });

    describe("Context-aware Tools", () => {
        it("should reply to current thread", async () => {
            const context: ConversationContext = {
                appState: {
                    view: "thread",
                    currentThreadId: "thread-123",
                    filters: { label: "INBOX", unreadOnly: false },
                    userId: "test-user",
                    sessionId: "test-session",
                },
                currentThread: {
                    id: "thread-123",
                    subject: "Project Update",
                    participants: ["sender@example.com"],
                    lastMessage: {
                        from: "sender@example.com",
                        snippet: "Here's the latest update...",
                        timestamp: new Date().toISOString(),
                    },
                    messageCount: 3,
                    isUnread: true,
                },
                recentThreads: [],
                conversationHistory: [],
            };

            const request: ToolExecutionRequest = {
                toolId: "mail.reply",
                arguments: {
                    body: "Thanks for the update!",
                },
                context,
                traceId: "test-trace",
            };

            const result = await registry.executeTool(request);

            expect(result.success).toBe(true);
            expect(result.result.data.to).toBe("sender@example.com");
            expect(result.result.data.subject).toBe("Re: Project Update");
            expect(result.result.data.threadId).toBe("thread-123");
        });

        it("should fail reply without current thread", async () => {
            const context: ConversationContext = {
                appState: {
                    view: "inbox",
                    filters: { label: "INBOX", unreadOnly: false },
                    userId: "test-user",
                    sessionId: "test-session",
                },
                recentThreads: [],
                conversationHistory: [],
            };

            const request: ToolExecutionRequest = {
                toolId: "mail.reply",
                arguments: {
                    body: "Reply body",
                },
                context,
                traceId: "test-trace",
            };

            const result = await registry.executeTool(request);

            expect(result.success).toBe(false);
            expect(result.error).toContain("No thread currently open");
        });
    });
});
