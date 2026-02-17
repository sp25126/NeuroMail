import { describe, it, expect, beforeEach } from "vitest";
import { ContextEngine } from "@/agent/context/engine";
import { AppState, ThreadSummary } from "@/agent/types";

describe("ContextEngine", () => {
    let engine: ContextEngine;

    beforeEach(() => {
        engine = new ContextEngine();
    });

    it("should build context with all components", async () => {
        const appState: AppState = {
            view: "inbox",
            filters: { label: "INBOX", unreadOnly: false },
            userId: "test-user",
            sessionId: "test-session",
        };

        const recentThreads: ThreadSummary[] = [
            {
                id: "thread-1",
                subject: "Test Email",
                participants: ["sender@example.com"],
                lastMessage: {
                    from: "sender@example.com",
                    snippet: "Test content",
                    timestamp: new Date().toISOString(),
                },
                messageCount: 1,
                isUnread: true,
            },
        ];

        const context = await engine.buildContext({
            sessionId: "test-session",
            appState,
            recentThreads,
        });

        expect(context.appState).toEqual(appState);
        expect(context.recentThreads).toHaveLength(1);
        expect(context.conversationHistory).toHaveLength(0);
    });

    it("should track conversation history", async () => {
        const appState: AppState = {
            view: "inbox",
            filters: { label: "INBOX", unreadOnly: false },
            userId: "test-user",
            sessionId: "test-session",
        };

        // Add turns
        engine.addTurn(
            "test-session",
            { role: "user", content: "Show me recent emails" },
            appState
        );

        engine.addTurn(
            "test-session",
            { role: "assistant", content: "Here are your recent emails..." },
            appState
        );

        // Build context
        const context = await engine.buildContext({
            sessionId: "test-session",
            appState,
            recentThreads: [],
        });

        expect(context.conversationHistory).toHaveLength(2);
        expect(context.conversationHistory[0].role).toBe("user");
        expect(context.conversationHistory[1].role).toBe("assistant");
    });

    it("should limit history to 50 turns", async () => {
        const appState: AppState = {
            view: "inbox",
            filters: { label: "INBOX", unreadOnly: false },
            userId: "test-user",
            sessionId: "test-session",
        };

        // Add 60 turns
        for (let i = 0; i < 60; i++) {
            engine.addTurn(
                "test-session",
                { role: "user", content: `Message ${i}` },
                appState
            );
        }

        const context = await engine.buildContext({
            sessionId: "test-session",
            appState,
            recentThreads: [],
        });

        expect(context.conversationHistory.length).toBeLessThanOrEqual(50);
    });
});
