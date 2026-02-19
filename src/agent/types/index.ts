import { z } from "zod";

// ============================================================================
// CONTEXT SCHEMAS
// ============================================================================

export const AppStateSchema = z.object({
    view: z.enum(["inbox", "thread", "compose", "settings"]),
    currentThreadId: z.string().optional(),
    filters: z.object({
        label: z.enum(["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"]),
        unreadOnly: z.boolean(),
        dateRange: z.enum(["1d", "7d", "30d", "90d", "all"]).optional(),
        searchQuery: z.string().optional(),
        from: z.string().optional(),
    }),
    userId: z.string(),
    sessionId: z.string(),
});

export const ThreadSummarySchema = z.object({
    id: z.string(),
    subject: z.string(),
    participants: z.array(z.string()),
    lastMessage: z.object({
        from: z.string(),
        snippet: z.string(),
        timestamp: z.string(),
    }),
    messageCount: z.number(),
    isUnread: z.boolean(),
});

export const ClientStateSchema = z.object({
    theme: z.enum(["light", "dark"]),
    isSidebarOpen: z.boolean(),
    isComposeOpen: z.boolean(),
    activeModals: z.array(z.string()), // e.g., ["settings", "shortcuts"]
    viewport: z.object({
        width: z.number(),
        height: z.number(),
        isMobile: z.boolean(),
    }).optional(),
});

export const ConversationContextSchema = z.object({
    appState: AppStateSchema,
    clientState: ClientStateSchema.optional(), // Added
    currentThread: ThreadSummarySchema.optional(),
    recentThreads: z.array(ThreadSummarySchema).max(10),
    conversationHistory: z.array(
        z.object({
            role: z.enum(["user", "assistant", "system", "tool"]),
            content: z.string(),
            timestamp: z.string(),
            toolCalls: z.array(z.any()).optional(),
        })
    ).max(20),
});

export type AppState = z.infer<typeof AppStateSchema>;
export type ClientState = z.infer<typeof ClientStateSchema>; // Added
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

// ============================================================================
// TOOL SCHEMAS
// ============================================================================

export const ToolParameterSchema = z.object({
    name: z.string(),
    type: z.enum(["string", "number", "boolean", "object", "array"]),
    description: z.string(),
    required: z.boolean(),
    enum: z.array(z.string()).optional(),
    schema: z.any().optional(), // For complex objects
});

export const ToolDefinitionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    parameters: z.array(ToolParameterSchema),
    returnType: z.string(),
    category: z.enum(["mail", "navigation", "filter", "macro", "system", "agentic"]),
    permissions: z.array(z.string()),
    rateLimit: z.object({
        maxCalls: z.number(),
        windowMs: z.number(),
    }).optional(),
});

export const ToolExecutionRequestSchema = z.object({
    toolId: z.string(),
    arguments: z.record(z.string(), z.any()),
    context: ConversationContextSchema,
    traceId: z.string(),
    parentSpanId: z.string().optional(),
});

export const ToolExecutionResultSchema = z.object({
    success: z.boolean(),
    result: z.any().optional(),
    error: z.string().optional(),
    metadata: z.object({
        executionTimeMs: z.number(),
        retryCount: z.number(),
        toolVersion: z.string(),
    }),
    sideEffects: z.array(
        z.object({
            type: z.string(),
            description: z.string(),
            data: z.any(),
        })
    ).optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;

// ============================================================================
// MACRO SCHEMAS (Dynamic Tool Creation)
// ============================================================================

export const MacroStepSchema = z.object({
    toolId: z.string(),
    arguments: z.record(z.string(), z.any()),
    condition: z.object({
        type: z.enum(["always", "if_success", "if_failure", "if_result_matches"]),
        value: z.any().optional(),
    }).optional(),
});

export const MacroDefinitionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    steps: z.array(MacroStepSchema),
    parameters: z.array(ToolParameterSchema),
    createdBy: z.enum(["user", "ai", "system"]),
    createdAt: z.string(),
    version: z.number(),
    metadata: z.object({
        usageCount: z.number(),
        lastUsed: z.string().optional(),
        avgExecutionTimeMs: z.number().optional(),
    }),
});

export type MacroDefinition = z.infer<typeof MacroDefinitionSchema>;

// ============================================================================
// LLM PROVIDER SCHEMAS
// ============================================================================

export const LLMConfigSchema = z.object({
    provider: z.enum(["ollama", "openai", "anthropic", "openrouter", "colab"]),
    model: z.string(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().optional(),
    streamingEnabled: z.boolean().default(true),
});

export const LLMRequestSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(["system", "user", "assistant", "tool"]),
            content: z.string(),
            name: z.string().optional(),
            tool_calls: z.array(z.any()).optional(),
        })
    ),
    tools: z.array(ToolDefinitionSchema).optional(),
    tool_choice: z.enum(["auto", "required", "none"]).optional(),
    config: LLMConfigSchema,
    traceId: z.string(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type LLMRequest = z.infer<typeof LLMRequestSchema>;
