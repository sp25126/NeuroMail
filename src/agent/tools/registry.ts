import { db } from "@/lib/db";
import { functionComposer } from "../function-composer/composer";
import { uiRegistry } from "../ui-registry/registry";
import { executionSandbox } from "../execution-sandbox/sandbox";
import { ComposedFunction } from "../ui-registry/types";
import { ToolDefinition, MacroDefinition, ToolExecutionRequest, ToolExecutionResult } from "../types";
import { createLogger } from "../observability/logger";

const logger = createLogger("ToolRegistry");

export class ToolRegistry {
    private staticTools: Map<string, ToolDefinition> = new Map();
    private dynamicTools: Map<string, MacroDefinition> = new Map();
    private toolHandlers: Map<string, Function> = new Map();

    constructor() {
        this.registerBuiltInTools();
    }

    /**
     * Register built-in static tools
     */
    private registerBuiltInTools() {
        this.registerTool({
            id: "mail.compose",
            name: "compose_email",
            description: "Open compose form and fill with recipients, subject, and body",
            parameters: [
                { name: "to", type: "string", description: "Recipient email", required: true },
                { name: "subject", type: "string", description: "Email subject", required: true },
                { name: "body", type: "string", description: "Email body (plain text or HTML)", required: true },
                { name: "threadId", type: "string", description: "Thread ID for replies", required: false },
            ],
            returnType: "ComposeState",
            category: "mail",
            permissions: ["mail.compose"],
        }, async (args: any, context: any) => {
            // Implementation
            return {
                action: "OPEN_COMPOSE",
                data: args,
            };
        });

        this.registerTool({
            id: "mail.search",
            name: "search_emails",
            description: "Search emails and update inbox view with results",
            parameters: [
                { name: "query", type: "string", description: "Gmail-style search query", required: true },
                { name: "maxResults", type: "number", description: "Max results to return", required: false },
            ],
            returnType: "Thread[]",
            category: "mail",
            permissions: ["mail.read"],
        }, async (args: any, context: any) => {
            // Call Gmail API search
            return {
                action: "UPDATE_INBOX",
                data: { searchQuery: args.query },
            };
        });

        this.registerTool({
            id: "navigation.open_thread",
            name: "open_thread",
            description: "Navigate to and display a specific email thread",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID to open", required: true },
            ],
            returnType: "Thread",
            category: "navigation",
            permissions: ["mail.read"],
        }, async (args: any, context: any) => {
            return {
                action: "NAVIGATE_TO_THREAD",
                data: { threadId: args.threadId },
            };
        });

        this.registerTool({
            id: "filter.apply",
            name: "apply_filters",
            description: "Apply filters to the inbox view",
            parameters: [
                { name: "unreadOnly", type: "boolean", description: "Show only unread", required: false },
                { name: "dateRange", type: "string", description: "Date range filter", required: false, enum: ["1d", "7d", "30d", "90d", "all"] },
                { name: "from", type: "string", description: "Filter by sender", required: false },
            ],
            returnType: "FilterState",
            category: "filter",
            permissions: ["mail.read"],
        }, async (args: any, context: any) => {
            return {
                action: "UPDATE_FILTERS",
                data: args,
            };
        });

        this.registerTool({
            id: "macro.define",
            name: "define_macro",
            description: "Define a new reusable macro (sequence of tool calls)",
            parameters: [
                { name: "name", type: "string", description: "Macro name", required: true },
                { name: "description", type: "string", description: "What this macro does", required: true },
                { name: "steps", type: "array", description: "Array of tool calls", required: true },
                { name: "parameters", type: "array", description: "Macro parameters", required: false },
            ],
            returnType: "MacroDefinition",
            category: "macro",
            permissions: ["macro.create"],
        }, async (args: any, context: any) => {
            return this.createMacro(args, context);
        });

        this.registerTool({
            id: "ui.function.compose",
            name: "compose_function",
            description: "Create a new reusable function by composing multiple UI operations",
            parameters: [
                { name: "name", type: "string", description: "Function name", required: true },
                { name: "description", type: "string", description: "What this function does", required: true },
                { name: "steps", type: "array", description: "Sequence of UI operations and their arguments", required: true },
                { name: "parameters", type: "array", description: "Parameters for the new function", required: false },
            ],
            returnType: "ComposedFunction",
            category: "agentic",
            permissions: ["ui.compose"],
        }, async (args: any, context: any) => {
            return await functionComposer.composeFunction({ ...args, userId: context.appState.userId });
        });

        logger.info("Built-in tools registered", {
            count: this.staticTools.size,
        });
    }

    /**
     * Register a tool with its handler
     */
    registerTool(
        definition: Omit<ToolDefinition, "id"> & { id: string },
        handler: Function
    ) {
        this.staticTools.set(definition.id, definition as ToolDefinition);
        this.toolHandlers.set(definition.id, handler);
    }

    /**
     * Get all available tools (static + dynamic)
     */
    async getAllTools(userId: string): Promise<ToolDefinition[]> {
        const staticTools = Array.from(this.staticTools.values());

        // Load user's custom macros from DB
        const userMacros = await this.loadUserMacros(userId);
        const macroTools = userMacros.map((macro) => this.macroToTool(macro));

        // Load user's composed UI functions
        await uiRegistry.loadComposedFunctions(userId);
        const composedFunctions = uiRegistry.getAllComposedFunctions();
        const composedTools = composedFunctions.map((fn) => this.composedToTool(fn));

        return [...staticTools, ...macroTools, ...composedTools];
    }

    /**
     * Execute a tool
     */
    async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
        const span = logger.startSpan("executeTool", {
            toolId: request.toolId,
            traceId: request.traceId,
        });

        const startTime = Date.now();

        try {
            // Validate permissions
            await this.checkPermissions(request);

            // Check rate limits
            await this.checkRateLimit(request);

            // Execute
            let result;
            if (this.staticTools.has(request.toolId)) {
                const handler = this.toolHandlers.get(request.toolId);
                if (!handler) {
                    throw new Error(`Tool handler for ${request.toolId} not found`);
                }
                result = await handler(request.arguments, request.context);
            } else if (request.toolId.startsWith("macro.")) {
                result = await this.executeMacro(request);
            } else if (request.toolId.startsWith("composed.")) {
                result = await executionSandbox.executeComposedFunction({
                    functionId: request.toolId,
                    arguments: request.arguments,
                    sessionId: request.context.appState.sessionId,
                    userId: request.context.appState.userId,
                });
            } else {
                throw new Error(`Tool ${request.toolId} not found`);
            }

            const executionTime = Date.now() - startTime;

            logger.info("Tool executed successfully", {
                toolId: request.toolId,
                executionTimeMs: executionTime,
                traceId: request.traceId,
            });

            span.end({ success: true, executionTimeMs: executionTime });

            return {
                success: true,
                result,
                metadata: {
                    executionTimeMs: executionTime,
                    retryCount: 0,
                    toolVersion: "1.0.0",
                },
            };
        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            logger.error("Tool execution failed", {
                toolId: request.toolId,
                error: error.message,
                traceId: request.traceId,
            });

            span.end({ success: false, error: error.message });

            return {
                success: false,
                error: error.message,
                metadata: {
                    executionTimeMs: executionTime,
                    retryCount: 0,
                    toolVersion: "1.0.0",
                },
            };
        }
    }

    /**
     * Create a new macro (AI-generated function)
     */
    private async createMacro(args: any, context: any): Promise<MacroDefinition> {
        const span = logger.startSpan("createMacro", { name: args.name });

        try {
            // Validate macro structure
            this.validateMacro(args);

            const macro: MacroDefinition = {
                id: `macro.${args.name.toLowerCase().replace(/\s+/g, "_")}`,
                name: args.name,
                description: args.description,
                steps: args.steps,
                parameters: args.parameters || [],
                createdBy: "ai",
                createdAt: new Date().toISOString(),
                version: 1,
                metadata: {
                    usageCount: 0,
                },
            };

            // Store in DB
            await this.saveMacro(macro, context.appState.userId);

            // Register in runtime
            this.dynamicTools.set(macro.id, macro);

            logger.info("Macro created", {
                macroId: macro.id,
                stepsCount: macro.steps.length,
            });

            span.end({ success: true });

            return macro;
        } catch (error: any) {
            span.end({ success: false, error: error.message });
            throw error;
        }
    }

    /**
     * Execute a macro (chain of tool calls)
     */
    private async executeMacro(request: ToolExecutionRequest): Promise<any> {
        const macro = this.dynamicTools.get(request.toolId);
        if (!macro) {
            throw new Error(`Macro ${request.toolId} not found`);
        }

        const results: any[] = [];
        let lastResult: any = null;

        for (const step of macro.steps) {
            // Check condition
            if (step.condition) {
                const shouldExecute = this.evaluateCondition(step.condition, lastResult);
                if (!shouldExecute) {
                    logger.info("Skipping step due to condition", {
                        toolId: step.toolId,
                        condition: step.condition.type,
                    });
                    continue;
                }
            }

            // Merge macro parameters into step arguments
            const stepArgs = {
                ...step.arguments,
                ...request.arguments,
            };

            // Execute step
            const stepRequest: ToolExecutionRequest = {
                ...request,
                toolId: step.toolId,
                arguments: stepArgs,
            };

            const result = await this.executeTool(stepRequest);
            results.push(result);
            lastResult = result;

            if (!result.success && step.condition?.type !== "if_failure") {
                // Stop on failure unless explicitly handling it
                break;
            }
        }

        // Update macro usage stats
        await this.updateMacroStats(macro.id, request.context.appState.userId);

        return {
            macroId: macro.id,
            results,
        };
    }

    /**
     * Validate macro structure (security checks)
     */
    private validateMacro(args: any): void {
        // Max 15 steps
        if (args.steps.length > 15) {
            throw new Error("Macro cannot have more than 15 steps");
        }

        // Check for recursive calls
        const toolIds = args.steps.map((s: any) => s.toolId);
        const hasMacroCalls = toolIds.some((id: string) => id.startsWith("macro."));
        if (hasMacroCalls) {
            throw new Error("Macros cannot call other macros (no recursion)");
        }

        // Validate all referenced tools exist
        for (const step of args.steps) {
            if (!this.staticTools.has(step.toolId)) {
                throw new Error(`Unknown tool in macro: ${step.toolId}`);
            }
        }
    }

    /**
     * Evaluate step condition
     */
    private evaluateCondition(condition: any, lastResult: any): boolean {
        switch (condition.type) {
            case "always":
                return true;
            case "if_success":
                return lastResult?.success === true;
            case "if_failure":
                return lastResult?.success === false;
            case "if_result_matches":
                return JSON.stringify(lastResult?.result).includes(condition.value);
            default:
                return true;
        }
    }

    /**
     * Convert macro to tool definition
     */
    private macroToTool(macro: MacroDefinition): ToolDefinition {
        return {
            id: macro.id,
            name: macro.name,
            description: `${macro.description} (Macro with ${macro.steps.length} steps)`,
            parameters: macro.parameters,
            returnType: "MacroResult",
            category: "macro",
            permissions: ["macro.execute"],
        };
    }

    /**
     * Convert composed function to tool definition
     */
    private composedToTool(fn: any): ToolDefinition {
        return {
            id: fn.id,
            name: fn.name,
            description: `${fn.description} (Composed UI function with ${fn.steps.length} steps)`,
            parameters: fn.parameters,
            returnType: "ComposedFunctionResult",
            category: "agentic",
            permissions: ["ui.execute"],
        };
    }

    // Database operations
    private async loadUserMacros(userId: string): Promise<MacroDefinition[]> {
        const rows = await db.query(
            "SELECT * FROM macros WHERE user_id = ? AND deleted_at IS NULL",
            [userId]
        );
        return rows.map((r: any) => JSON.parse(r.definition));
    }

    private async saveMacro(macro: MacroDefinition, userId: string): Promise<void> {
        await db.execute(
            "INSERT INTO macros (id, user_id, definition, created_at) VALUES (?, ?, ?, ?)",
            [macro.id, userId, JSON.stringify(macro), macro.createdAt]
        );
    }

    private async updateMacroStats(macroId: string, userId: string): Promise<void> {
        await db.execute(
            "UPDATE macros SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ? AND user_id = ?",
            [new Date().toISOString(), macroId, userId]
        );
    }

    private async checkPermissions(request: ToolExecutionRequest): Promise<void> {
        // Implement role-based access control
        // For MVP: all authenticated users have all permissions
    }

    private async checkRateLimit(request: ToolExecutionRequest): Promise<void> {
        // Implement rate limiting using Redis or in-memory store
        // For MVP: no rate limits
    }
}

export const toolRegistry = new ToolRegistry();
