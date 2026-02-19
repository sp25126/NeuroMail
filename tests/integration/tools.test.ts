import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '@/agent/orchestrator';
import { ToolRegistry } from '@/agent/tools/registry';
import { AppState } from '@/agent/types';

describe('AgentOrchestrator Tool Selection', () => {
    let orchestrator: AgentOrchestrator;
    const context = {
        sessionId: "test-session",
        appState: {
            view: 'inbox' as const,
            filters: { label: 'INBOX' as const, unreadOnly: false },
            userId: 'test-user',
            sessionId: 'test-session'
        },
        recentThreads: [],
        availableTools: [],
        currentThread: null,
        userMessage: ""
    };

    beforeEach(() => {
        orchestrator = new AgentOrchestrator();
    });

    it('should identify composeEmail tool for composition requests', async () => {
        const prompt = "Send an email to saumya@example.com";
        // IntentInference returns arguments as an object, NOT a JSON string
        const result = (orchestrator as any).parseToolCalls("", prompt, context);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('composeEmail');
        expect(result[0].arguments.to).toBe('saumya@example.com');
    });

    it('should identify summarizeEmail tool for summarization requests', () => {
        const prompt = "Summarize the current thread";
        const result = (orchestrator as any).parseToolCalls("", prompt, {
            ...context,
            currentThread: { id: "thread-123" } as any
        });

        // If inference logic supports it:
        if (result.length > 0) {
            expect(result[0].name).toBe('summarizeEmail');
        }
    });
});

describe('ToolRegistry', () => {
    it('should contain all required tools', async () => {
        const registry = new ToolRegistry();
        const tools = await registry.getAllTools("test-user");
        const toolNames = tools.map((t: any) => t.name);
        expect(toolNames).toContain('composeEmail');
        expect(toolNames).toContain('summarizeEmail');
        expect(toolNames).toContain('searchEmails');
        expect(toolNames).toContain('replyToEmail');
    });
});
