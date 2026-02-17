import { v4 as uuidv4 } from "uuid";
import { contextEngine } from "../context/engine";
import { toolRegistry } from "../tools/registry";
import { LLMProviderFactory } from "../llm/factory";
import { createLogger } from "../observability/logger";
import { functionComposer } from "../function-composer";
import { executionSandbox } from "../execution-sandbox/sandbox";
import { userMemory } from "../context/user-memory";
import {
    LLMConfig,
    ToolExecutionRequest,
    AppState,
    ThreadSummary,
    ClientState,
} from "../types";
import { TOOLS, ToolCall, ToolName } from "../tools/definitions";
import { FunctionCallParser } from "./function-parser";
import { IntentInference } from "./intent-inference";
import { uiRegistry } from "@/lib/ui-registry";

const logger = createLogger("Orchestrator");

export interface ConversationContext {
    sessionId: string;
    appState: any;
    currentThread: any | null;
    recentThreads: any[];
    userMessage: string;
    conversationHistory?: any[];
    cookies?: string; // Added for server-side API calls
    availableTools?: any[]; // Dynamic tools from client
    llmConfig?: LLMConfig; // Added for function composer
    clientState?: ClientState; // Added for UI observability
    isSlashCommand?: boolean;
}

export interface AgentRequest {
    sessionId: string;
    userMessage: string;
    appState: AppState;
    currentThread?: ThreadSummary;
    recentThreads: ThreadSummary[];
    llmConfig: LLMConfig;
    persona?: string;
    cookies?: string; // Added for server-side API calls
    availableTools?: any[]; // Dynamic tools from client
    clientState?: ClientState; // Added for UI observability
    isSlashCommand?: boolean;
}

export interface AgentResponse {
    assistantMessage: string;
    toolCalls: ToolCall[];
    toolResults: any[];
    actions?: Array<{ action: string; data?: any; query?: string; type?: string; operationId?: string; args?: any }>;
    metadata: {
        traceId: string;
        executionTimeMs: number;
        tokensUsed: number;
        toolsExecuted: number;
    };
}

export class AgentOrchestrator {
    /**
     * Main orchestration flow — autonomous execution
     */
    public async executeRequest(request: AgentRequest): Promise<AgentResponse> {
        console.log("🚀 [ORCHESTRATOR] Execute request:", {
            message: request.userMessage,
            view: request.appState?.view,
            hasCurrentThread: !!request.currentThread,
            recentThreadsCount: request.recentThreads?.length || 0,
            dynamicToolsCount: request.availableTools?.length || 0,
        });

        const traceId = uuidv4();

        try {
            const isSlashCommand = request.userMessage.trim().startsWith("/");
            const cleanMessage = isSlashCommand
                ? request.userMessage.trim().substring(1).trim()
                : request.userMessage;

            const context: ConversationContext = {
                userMessage: cleanMessage,
                sessionId: request.sessionId,
                appState: request.appState || { view: "inbox", filters: {} },
                currentThread: request.currentThread || null,
                recentThreads: request.recentThreads || [],
                cookies: request.cookies,
                availableTools: request.availableTools || [],
                llmConfig: request.llmConfig,
                clientState: request.clientState,
                isSlashCommand,
            };

            // ⚠️ SLASH COMMAND BYPASS ⚠️
            // If the user starts with "/", we skip the LLM entirely and execute the tool directly.
            if (isSlashCommand) {
                console.log("⚡ [ORCHESTRATOR] Slash command detected. Bypassing LLM.");
                // 1. Parse the command using our parser
                const toolCalls = FunctionCallParser.parse(request.userMessage, request.availableTools || []);

                // 2. If valid tool call found, proceed to execution
                if (toolCalls.length > 0) {
                    console.log("✅ [ORCHESTRATOR] Valid slash command parsed:", toolCalls[0].name);
                } else {
                    // Fallback: If parser failed (e.g. invalid syntax), return error
                    return {
                        assistantMessage: `Invalid command format: ${request.userMessage}`,
                        actions: [],
                        toolCalls: [],
                        toolResults: [],
                        metadata: { traceId, executionTimeMs: 0, tokensUsed: 0, toolsExecuted: 0 }
                    };
                }

                // 3. Execute immediately (Skip LLM generation)
                const toolResults: any[] = [];
                const actions: any[] = [];

                for (const toolCall of toolCalls) {
                    const result = await this.executeToolCall(toolCall, context);
                    toolResults.push({ toolCall, result });

                    // Convert tool results to UI actions
                    if (result.success && result.action) {
                        actions.push({
                            type: result.action,
                            ...result,
                            ...(result.action === "UI_OPERATION" ? { operationId: toolCall.name, args: toolCall.arguments } : {}),
                        });
                    }
                }

                return {
                    assistantMessage: `Command executed: ${toolCalls[0].name}`,
                    actions,
                    toolCalls,
                    toolResults,
                    metadata: { traceId, executionTimeMs: 0, tokensUsed: 0, toolsExecuted: 1 }
                };
            }

            // Build system prompt with tools
            const systemPrompt = this.buildSystemPrompt(context);

            // Call LLM
            console.log("🤖 [ORCHESTRATOR] Calling LLM...");
            const llmProvider = LLMProviderFactory.create(request.llmConfig);

            let messages = [
                { role: "system" as const, content: systemPrompt },
                { role: "user" as const, content: cleanMessage },
            ];

            // Inject execution reminder
            messages = this.injectExecutionReminder(messages);

            const llmResponse = await llmProvider.generate(messages, {
                temperature: 0.1, // Lower temperature = more deterministic
            });

            console.log("✅ [ORCHESTRATOR] LLM response received:", {
                contentLength: llmResponse.content.length,
                preview: llmResponse.content.substring(0, 100),
            });

            // Clean responses
            const cleanedMessage = this.cleanAIResponse(llmResponse.content);

            // Parse tool calls
            const toolCalls = FunctionCallParser.parse(llmResponse.content, context.availableTools || []);

            // Execute tool calls
            const toolResults: any[] = [];
            const actions: any[] = [];

            for (const toolCall of toolCalls) {
                const result = await this.executeToolCall(toolCall, context);
                toolResults.push({ toolCall, result });

                // Convert tool results to UI actions
                if (result.success && result.action) {
                    actions.push({
                        type: result.action,
                        ...result,
                        // For generic UI operations, pass the operationId
                        ...(result.action === "UI_OPERATION" ? { operationId: toolCall.name, args: toolCall.arguments } : {}),
                    });
                } else if (result.success && result.results) {
                    // Search returned results - if only one result, auto-open it
                    if (result.results.length === 1 && request.userMessage.match(/\b(open|read|show)\b/)) {
                        actions.push({
                            type: "SEARCH",
                            query: toolCall.arguments.query,
                        });
                        actions.push({
                            type: "OPEN_THREAD",
                            threadId: result.results[0].id,
                        });
                    } else {
                        actions.push({
                            type: "SEARCH",
                            query: toolCall.arguments.query,
                        });
                    }
                }
            }

            console.log("🎯 [ORCHESTRATOR] Returning:", {
                messageLength: llmResponse.content.length,
                toolCallsCount: toolCalls.length,
                actionsCount: actions.length,
                actions: actions.map(a => a.type),
            });

            return {
                assistantMessage: cleanedMessage,
                actions,
                toolCalls: toolCalls,
                toolResults,
                metadata: {
                    traceId,
                    executionTimeMs: 0,
                    tokensUsed: 0,
                    toolsExecuted: toolCalls.length,
                },
            };
        } catch (error: any) {
            console.error("❌ [ORCHESTRATOR] Error:", error);

            return {
                assistantMessage: "I encountered an error processing your request.",
                actions: [],
                toolCalls: [],
                toolResults: [],
                metadata: {
                    traceId,
                    executionTimeMs: 0,
                    tokensUsed: 0,
                    toolsExecuted: 0,
                },
            };
        }
    }

    async *executeRequestStream(
        request: AgentRequest
    ): AsyncGenerator<{
        type: "token" | "tool_call" | "tool_result" | "done" | "error";
        content: string;
        data?: any;
    }> {
        // Stream implementation - simplified for now
        const traceId = uuidv4();
        yield { type: "done", content: "", data: { traceId } };
    }

    /**
     * Inject execution reminder into messages
     */
    private injectExecutionReminder(messages: any[]): any[] {
        // Add a strong reminder before the user message
        const reminder = {
            role: "system" as const,
            content: `CRITICAL REMINDER:
  - DO NOT say "Let me..." or "I will..."
  - DO NOT explain what you're doing
  - ONLY output function calls in this format: functionName({ param: "value" })
  - Example: If user says "toggle theme", you output: toggle_theme()
  - NO OTHER TEXT`,
        };

        // Insert reminder before last user message
        const lastUserIndex = messages.map(m => m.role).lastIndexOf("user");

        if (lastUserIndex !== -1) {
            messages.splice(lastUserIndex, 0, reminder);
        }

        return messages;
    }

    /**
     * Clean AI response - remove narration, keep only facts
     */
    private cleanAIResponse(response: string): string {
        // Remove common narration phrases
        const cleaned = response
            .replace(/^(Let me|I will|I'll|I'm going to|I am|I can|Here's what I'll do|Sure|Okay|Alright)[,:]?\s*/gi, '')
            .replace(/^(Searching|Opening|Toggling|Setting|Sending|Finding|Refreshing)[.!]?\s*/gim, '')
            .replace(/\.\.\./g, '')
            .replace(/^(You|AI|Assistant|Assistant:):\s*/gim, "")
            .trim();

        // If cleaned matches a tool call pattern, or is empty, return generic success message
        // This avoids showing function calls in the chat bubble
        const toolPattern = /^\w+\s*\(/;
        if (cleaned.length < 5 || toolPattern.test(cleaned)) {
            return "Done.";
        }

        return cleaned;
    }

    private buildSystemPrompt(context: ConversationContext): string {
        const composedFunctions = functionComposer.listFunctions();

        // Build tools description
        const staticToolsDesc = TOOLS.map(t => {
            const params = Object.keys(t.parameters.properties).length > 0
                ? `(${Object.keys(t.parameters.properties).join(", ")})`
                : "()";
            return `- ${t.name}${params}: ${t.description}`;
        }).join('\n');

        let dynamicToolsDesc = "";
        if (context.availableTools && context.availableTools.length > 0) {
            dynamicToolsDesc += "\n### SPECIFIC UI ACTIONS\n";
            context.availableTools.forEach((tool: any) => {
                const params = tool.parameters?.map((p: any) => `${p.name}`).join(", ") || "";
                dynamicToolsDesc += `- ${tool.id}(${params}): ${tool.description}\n`;
            });
        }

        const currentEmailStatus = context.currentThread ? `"${context.currentThread.subject}"` : "None";

        return `You are the AI brain of Neuromail. You CONTROL the email app by calling functions.

## CRITICAL RULES - READ CAREFULLY

1. DO NOT describe what you will do
2. DO NOT explain your actions
3. DO NOT use phrases like "Let me..." or "I will..."
4. ONLY output function calls
5. The UI will show the results - you stay SILENT

## HOW TO CALL FUNCTIONS

CORRECT FORMAT:
functionName({ param: "value" })

EXAMPLES:
✅ CORRECT: toggle_theme()
✅ CORRECT: search_emails({ query: "from:john" })
✅ CORRECT: open_compose({ to: "test@example.com", subject: "Hello" })

❌ WRONG: "Let me toggle the theme"
❌ WRONG: "I'll search for emails from john"
❌ WRONG: "You: open_compose(...)"

## SYSTEM POWERS (GOD MODE)
1. **Direct Manipulation**: Use \`execute_js({ code: "..." })\` to execute any JavaScript in the user's browser. You can access \`document\`, \`window\`, \`store\` (Zustand), and \`uiRegistry\`.
2. **Autonomous Evolution**: Use \`define_tool({ id, description, jsCode, parameters })\` to create PERMANENT new tools.

## AVAILABLE FUNCTIONS
${staticToolsDesc}
${dynamicToolsDesc}

## CUSTOM FUNCTIONS
${composedFunctions.length > 0 ? `
You have access to these custom functions:
${composedFunctions.map(f => `- ${f.name}: ${f.description}`).join('\n')}
` : ""}

## CURRENT STATE
- View: ${context.appState.view}
- Current email: ${currentEmailStatus}
${context.clientState ? `- Theme: ${context.clientState.theme}
- Sidebar: ${context.clientState.isSidebarOpen ? "Open" : "Collapsed"}
- Compose Modal: ${context.clientState.isComposeOpen ? "Open" : "Closed"}` : ""}

## RESPONSE PROTOCOL

When user asks for something:
1. Call the appropriate function(s)
2. Say NOTHING else
3. Let the UI confirm the action

EXAMPLES:

User: "toggle the theme"
You: toggle_theme()

User: "find emails from Sarah"
You: search_emails({ query: "from:Sarah" })

## REMEMBER
- You are NOT a chatbot
- You are a CONTROLLER
- Execute functions, don't describe them
- Be SILENT - let the UI do the talking`;
    }

    /**
     * Get all available tool names (dynamic + static)
     */
    private getAvailableTools(context: ConversationContext): string[] {
        const staticTools = TOOLS.map(t => t.name);
        // Also check if any legacy/fallback names are needed
        const legacyTools = ["searchEmails", "openThread", "composeEmail", "navigateToFolder"];

        const dynamicTools = context.availableTools ? context.availableTools.map((op: any) => op.id) : [];
        return [...new Set([...staticTools, ...legacyTools, ...dynamicTools])];
    }

    /**
     * Parse function calls from AI response
     */
    private parseToolCalls(aiResponse: string, userMessage: string, context: ConversationContext): ToolCall[] {
        const availableTools = this.getAvailableTools(context);

        console.log("🔧 [ORCHESTRATOR] Parsing tool calls from:", {
            responsePreview: aiResponse.substring(0, 150),
            userMessage,
            availableToolsCount: availableTools.length,
        });

        // Method 1: Parse explicit function calls from AI response
        let toolCalls = FunctionCallParser.parse(aiResponse, availableTools);

        // Method 2: If no explicit calls, infer from intent
        if (toolCalls.length === 0) {
            console.log("⚠️ [ORCHESTRATOR] No explicit function calls, inferring from intent...");
            toolCalls = IntentInference.infer(userMessage, aiResponse, context, availableTools);
        }

        console.log(`📊 [ORCHESTRATOR] Total tool calls: ${toolCalls.length}`);
        return toolCalls;
    }

    /**
     * Execute a tool call
     */
    private async executeToolCall(toolCall: ToolCall, context: ConversationContext): Promise<any> {
        console.log("🔨 [ORCHESTRATOR] Executing tool:", toolCall.name, toolCall.arguments);

        try {
            // Check if this is a UI registry operation (dynamic)
            // Use context.availableTools as server-side uiRegistry is empty
            const dynamicTool = context.availableTools?.find((t: any) => t.id === toolCall.name);

            if (dynamicTool) {
                console.log("📋 [ORCHESTRATOR] Validated dynamic tool:", toolCall.name);

                // DON'T execute here - let frontend handle it
                // Just return action metadata

                const actionTypeMap: Record<string, string> = {
                    navigation: "NAVIGATE",
                    filter: "FILTER",
                    modal: "MODAL",
                    toggle: "TOGGLE",
                    action: "ACTION",
                    input: "INPUT",
                    button: "BUTTON",
                };

                let actionType = actionTypeMap[dynamicTool.type] || "UI_OPERATION";

                // Overrides for specific tools to match AssistantPanel handlers
                if (toolCall.name === "search_emails") actionType = "SEARCH";
                if (toolCall.name === "open_thread") actionType = "OPEN_THREAD";
                if (toolCall.name === "open_compose") actionType = "OPEN_COMPOSE";
                if (toolCall.name === "navigate_inbox" || toolCall.name === "navigate_sent" || toolCall.name === "navigate_drafts" || toolCall.name === "navigate_starred") actionType = "NAVIGATE";

                return {
                    success: true,
                    action: actionType,
                    operationId: toolCall.name,
                    operationType: dynamicTool.type,
                    ...toolCall.arguments,
                };
            }

            // Handle built-in tools that DO execute on backend (static fallback)
            switch (toolCall.name) {
                // FUNCTION COMPOSER TOOLS
                case "createFunction": {
                    const { description, name } = toolCall.arguments;

                    console.log("🔧 [TOOL] Creating custom function:", description);

                    const llmProvider = LLMProviderFactory.create(context.llmConfig || {
                        provider: "ollama",
                        model: "gemma2:2b",
                        temperature: 0.2,
                        streamingEnabled: false
                    });

                    // Pass request.availableTools to composer
                    const composedFunc = await functionComposer.composeFunction(
                        description,
                        llmProvider,
                        context.availableTools || []
                    );

                    // Don't save on server - client will save it
                    // await functionComposer.saveToStorage();

                    return {
                        success: true,
                        action: "FUNCTION_CREATED",
                        functionName: composedFunc.name,
                        functionDescription: composedFunc.description,
                        functionDefinition: composedFunc // Send logic to client
                    };
                }

                case "listCustomFunctions": {
                    console.log("📋 [TOOL] Listing custom functions");

                    const functions = functionComposer.listFunctions();

                    return {
                        success: true,
                        functions: functions.map((f) => ({
                            name: f.name,
                            description: f.description,
                            usageCount: f.usageCount,
                            createdAt: f.createdAt,
                        })),
                    };
                }

                case "execute_js": {
                    const { code } = toolCall.arguments;
                    console.log("⚡ [TOOL] Executing dynamic JS:", code?.substring(0, 50) + "...");
                    return {
                        success: true,
                        action: "EXECUTE_JS",
                        code
                    };
                }

                case "define_tool": {
                    const { id, description, jsCode, parameters } = toolCall.arguments;
                    console.log("🛠️ [TOOL] Defining new tool:", id);

                    // Send to client for registration
                    return {
                        success: true,
                        action: "REGISTER_TOOL",
                        toolId: id,
                        toolDescription: description,
                        toolJsCode: jsCode,
                        toolParameters: parameters
                    };
                }

                case "deleteFunction": {
                    const { name } = toolCall.arguments;

                    console.log("🗑️ [TOOL] Deleting function:", name);

                    const func = functionComposer.getFunctionByName(name);
                    if (!func) {
                        return { success: false, error: "Function not found" };
                    }

                    const deleted = functionComposer.deleteFunction(func.id);
                    await functionComposer.saveToStorage();

                    return {
                        success: deleted,
                        action: deleted ? "FUNCTION_DELETED" : "ERROR",
                    };
                }

                case "searchEmails": {
                    const { query } = toolCall.arguments;

                    if (!query) {
                        return { success: false, error: "Missing query parameter" };
                    }

                    console.log("🔍 [TOOL] Searching emails:", query);

                    // Call API to search
                    const url = `${process.env.NEXTAUTH_URL || 'http://localhost:3003'}/api/mail/threads?q=${encodeURIComponent(query)}`;

                    const response = await fetch(url, {
                        headers: {
                            cookie: context.cookies || "",
                        },
                    });
                    const data = await response.json();
                    const threads = data.threads || [];

                    console.log("✅ [TOOL] Search found:", threads.length, "results");

                    return {
                        success: true,
                        action: "SEARCH",
                        query,
                        results: threads.map((t: any) => ({
                            id: t.id,
                            from: t.lastMessage?.from,
                            subject: t.subject,
                            snippet: t.snippet,
                        })),
                    };
                }

                case "openThread": {
                    const { threadId } = toolCall.arguments;

                    if (!threadId) {
                        return { success: false, error: "Missing threadId parameter" };
                    }

                    console.log("✅ [TOOL] openThread:", threadId);

                    return {
                        success: true,
                        action: "OPEN_THREAD",
                        threadId,
                    };
                }

                case "composeEmail": {
                    return { success: true, action: "OPEN_COMPOSE", ...toolCall.arguments };
                }

                case "navigateToFolder": {
                    return { success: true, action: "NAVIGATE", view: toolCall.arguments.folder };
                }

                case "replyToEmail": {
                    return { success: true, action: "OPEN_COMPOSE", ...toolCall.arguments };
                }

                case "toggle_theme": {
                    return { success: true, action: "TOGGLE", operationId: "toggle_theme" };
                }

                default:
                    console.error("❌ [ORCHESTRATOR] Unknown tool:", toolCall.name);
                    return { success: false, error: `Unknown tool: ${toolCall.name}` };
            }
        } catch (error: any) {
            console.error("❌ [ORCHESTRATOR] Execution failed:", error);
            return { success: false, error: error.message };
        }
    }
}

export const orchestrator = new AgentOrchestrator();
