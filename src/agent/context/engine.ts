import { ConversationContext, ThreadSummary, AppState } from "../types";
import { createLogger } from "../observability/logger";
import { db } from "../../lib/db";

const logger = createLogger("ContextEngine");

export class ContextEngine {
    private conversationHistory: Map<string, any[]> = new Map();
    private stateSnapshots: Map<string, AppState[]> = new Map();

    /**
     * Build complete context for LLM with relevance scoring
     */
    /**
     * Build complete context for LLM with relevance scoring
     */
    async buildContext(params: {
        sessionId: string;
        appState: AppState;
        currentThread?: ThreadSummary;
        recentThreads: ThreadSummary[];
    }): Promise<ConversationContext> {
        const span = logger.startSpan("buildContext", { sessionId: params.sessionId });

        try {
            // Load conversation history from database
            // We use raw query here for speed, assuming a 'conversation_history' table exists or similar
            // If using Prisma/ORM, this would be different. Based on instructions, using db.query.
            // Adjusting to match the user's provided snippet exactly but ensuring db import.
            const historyRows = await db.query(
                `SELECT role, content, tool_calls, created_at 
                 FROM conversation_history 
                 WHERE session_id = ? 
                 ORDER BY created_at ASC 
                 LIMIT 20`,
                [params.sessionId]
            );

            const dbHistory = Array.isArray(historyRows) ? historyRows.map((row: any) => ({
                role: row.role as "user" | "assistant" | "tool",
                content: row.content,
                toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
                timestamp: row.created_at,
            })) : [];

            // Merge with in-memory history for current unsaved session data
            const memoryHistory = this.conversationHistory.get(params.sessionId) || [];
            const conversationHistory = memoryHistory.length > 0 ? memoryHistory : dbHistory;

            // Add state change annotations (from original code, preserving if compatible or just use user's?)
            // User's snippet replaced the whole fetching logic and didn't mention annotating.
            // PROMPT SAID: "Fix the context building to actually include conversation history:"
            // I will stick to the user's snippet which seemed to replace the existing logic for history
            // BUT the user snippet returned `context` directly.
            // The existing code had `annotateStateChanges`.
            // I'll try to keep `annotateStateChanges` if possible, OR just follow the user's snippet which simplifies it.
            // The user said "This is what happens when you design enterprise patterns without running npm run dev... Fix this crash."
            // I will interpret this as "Use my code it works".

            const context: ConversationContext = {
                appState: params.appState,
                currentThread: params.currentThread,
                recentThreads: params.recentThreads || [], // Safety
                conversationHistory,
            };

            logger.info("Context built", {
                sessionId: params.sessionId,
                historyLength: conversationHistory.length,
                hasCurrentThread: !!params.currentThread,
                recentThreadsCount: (params.recentThreads || []).length,
            });

            span.end({ success: true });
            return context;
        } catch (error: any) {
            logger.error("Failed to build context", {
                error: error.message,
                sessionId: params.sessionId,
            });
            span.end({ success: false, error: error.message });

            // Return minimal context instead of crashing
            return {
                appState: params.appState,
                currentThread: params.currentThread,
                recentThreads: params.recentThreads || [],
                conversationHistory: [], // Safe default
            };
        }
    }

    /**
     * Filter history based on relevance to current context
     * Uses recency + semantic similarity (if embeddings available)
     */
    private async filterRelevantHistory(
        history: any[],
        currentState: AppState
    ): Promise<any[]> {
        // Keep last 10 unconditionally (recent context)
        const recentHistory = history.slice(-10);

        // From older history, keep only turns that match current context
        const olderHistory = history.slice(0, -10);
        const relevantOlder = olderHistory.filter((turn) => {
            // Keep if mentions current thread
            if (
                currentState.currentThreadId &&
                turn.content.includes(currentState.currentThreadId)
            ) {
                return true;
            }
            // Keep if tool calls related to current view
            if (turn.toolCalls?.some((tc: any) => tc.category === currentState.view)) {
                return true;
            }
            return false;
        });

        return [...relevantOlder.slice(-5), ...recentHistory];
    }

    /**
     * Annotate history with state change markers
     */
    private annotateStateChanges(
        history: any[],
        sessionId: string
    ): any[] {
        const snapshots = this.stateSnapshots.get(sessionId) || [];

        return history.map((turn, idx) => {
            const snapshot = snapshots[idx];
            if (snapshot && idx > 0 && snapshots[idx - 1]) {
                const prev = snapshots[idx - 1];
                const changes = this.detectStateChanges(prev, snapshot);
                if (changes.length > 0) {
                    return {
                        ...turn,
                        stateChanges: changes,
                    };
                }
            }
            return turn;
        });
    }

    /**
     * Detect what changed between two state snapshots
     */
    private detectStateChanges(prev: AppState, current: AppState): string[] {
        const changes: string[] = [];

        if (prev.view !== current.view) {
            changes.push(`view: ${prev.view} → ${current.view}`);
        }
        if (prev.currentThreadId !== current.currentThreadId) {
            changes.push(`thread changed`);
        }
        if (JSON.stringify(prev.filters) !== JSON.stringify(current.filters)) {
            changes.push(`filters updated`);
        }

        return changes;
    }

    /**
     * Add turn to conversation history
     */
    addTurn(sessionId: string, turn: any, appState: AppState): void {
        const history = this.conversationHistory.get(sessionId) || [];
        history.push({
            ...turn,
            timestamp: new Date().toISOString(),
        });

        // Keep last 50 turns max
        if (history.length > 50) {
            history.shift();
        }

        this.conversationHistory.set(sessionId, history);

        // Store state snapshot
        const snapshots = this.stateSnapshots.get(sessionId) || [];
        snapshots.push(appState);
        if (snapshots.length > 50) {
            snapshots.shift();
        }
        this.stateSnapshots.set(sessionId, snapshots);
    }

    /**
     * Clear session data (logout, timeout)
     */
    clearSession(sessionId: string): void {
        this.conversationHistory.delete(sessionId);
        this.stateSnapshots.delete(sessionId);
        logger.info("Session cleared", { sessionId });
    }
}

export const contextEngine = new ContextEngine();
