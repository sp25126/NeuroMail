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
import { TOOLS, ToolCall, ToolName, ToolDefinition, getToolByName } from "../tools/tools-definitions";
import { FunctionCallParser } from "./function-parser";
import { IntentInference } from "./intent-inference";
// import { uiRegistry } from "@/lib/ui-registry";
// import { smartToolRegistry } from "../smart-registry";
// import { ToolCategory } from "../smart-registry/types";

const logger = createLogger("Orchestrator");

export interface ConversationContext {
    sessionId: string;
    appState: any;
    currentThread: any | null;
    recentThreads: any[];
    userMessage: string;
    conversationHistory?: any[];
    cookies?: string;
    availableTools?: any[];
    llmConfig?: LLMConfig;
    clientState?: ClientState;
    isSlashCommand?: boolean;
    screenContext?: string;
}

export interface AgentRequest {
    sessionId: string;
    userMessage: string;
    appState: AppState;
    currentThread?: ThreadSummary;
    recentThreads: ThreadSummary[];
    llmConfig: LLMConfig;
    persona?: string;
    cookies?: string;
    availableTools?: any[];
    clientState?: ClientState;
    isSlashCommand?: boolean;
    screenContext?: string;
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
     * System prompt with STRICT constraints.
     */
    private systemPrompt = `
You are Neuromail's AI Agent.
You have access to a STRICTLY DEFINED set of tools.
You must analyze the user's request and execute the appropriate tools.

Rules:
1.  **NO FAKE JSON TOOLS**. You must ONLY use the tools defined in the 'tools' section.
2.  If you need to perform a composite action or a complex workflow, use the \`generate_workflow\` tool.
3.  Do not output plain text unless you are asking a clarifying question.
4.  Do not use semicolons in your tool calls if the tool definition doesn't require them.
5.  Always think step-by-step.

Tools:
{{TOOLS}}
`;

    /**
     * Execute a request and stream the response (AgentResponse).
     */
    private getToolDescriptions(): string {
        return TOOLS.map((t: ToolDefinition) => `- ${t.name}: ${t.description}`).join("\n");
    }

    /**
     * Execute a request and stream the response (AgentResponse).
     */
    async *executeRequestStream(
        config: LLMConfig,
        request: AgentRequest
    ): AsyncGenerator<AgentResponse, void, unknown> {
        const llmProvider = LLMProviderFactory.create(config);

        const stream = llmProvider.generateStream([
            { role: "system", content: this.systemPrompt.replace("{{TOOLS}}", this.getToolDescriptions()) },
            { role: "user", content: request.userMessage }
        ], {
            temperature: 0.1,
            tools: this.convertToolsToNativeFormat(
                // Context construction matching executeRequest logic if possible, 
                // but here we might need to reconstruct context unless we pass it in.
                // AgentRequest has components of context.
                {
                    sessionId: request.sessionId,
                    appState: request.appState,
                    userMessage: request.userMessage,
                    currentThread: request.currentThread,
                    recentThreads: request.recentThreads,
                    cookies: request.cookies,
                    availableTools: request.availableTools,
                    llmConfig: request.llmConfig,
                    clientState: request.clientState,
                    screenContext: request.screenContext
                } as ConversationContext
            ),
        });

        for await (const chunk of stream) {
            if (chunk.type === "token") {
                yield {
                    assistantMessage: chunk.content,
                    toolCalls: [],
                    toolResults: [],
                    metadata: { traceId: "stream", executionTimeMs: 0, tokensUsed: 0, toolsExecuted: 0 }
                } as AgentResponse;
            }
        }
    }
    public async executeRequest(request: AgentRequest): Promise<AgentResponse> {
        const traceId = uuidv4();
        const startTime = Date.now();

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
                screenContext: request.screenContext,
            };

            // ⚠️ SLASH COMMAND BYPASS REMOVED ⚠️
            // All commands now go through the LLM for "God Mode" processing.
            // This ensures we use the configured provider (Colab/Ollama) instead of hardcoded logic.

            /* 
            if (isSlashCommand) {
                 ... old logic removed ...
            } 
            */

            const systemPrompt = this.buildSystemPrompt(context);
            const llmProvider = LLMProviderFactory.create(request.llmConfig);

            let messages = [
                { role: "system" as const, content: systemPrompt },
                { role: "user" as const, content: cleanMessage },
            ];

            const allTools = this.convertToolsToNativeFormat(context);
            const llmResponse = await llmProvider.generate(messages, {
                temperature: 0.1,
                tools: allTools,
            });

            console.log("🤖 [ORCHESTRATOR] Raw LLM Content:", llmResponse.content);
            console.log("🛠️ [ORCHESTRATOR] Raw Tool Calls:", JSON.stringify(llmResponse.tool_calls || [], null, 2));

            const cleanedMessage = this.cleanAIResponse(llmResponse.content);
            let toolCalls: ToolCall[] = [];

            if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
                toolCalls = llmResponse.tool_calls.map(tc => ({
                    id: tc.id || `native_${uuidv4()}`,
                    name: tc.function.name as ToolName,
                    arguments: typeof tc.function.arguments === 'string'
                        ? JSON.parse(tc.function.arguments)
                        : tc.function.arguments
                }));
            } else {
                toolCalls = this.parseToolCalls(llmResponse.content, cleanMessage, context);
            }

            const toolResults: any[] = [];
            const actions: any[] = [];
            for (const toolCall of toolCalls) {
                const result = await this.executeToolCall(toolCall, context);
                toolResults.push({ toolCall, result });
                if (result.success && result.action) actions.push({ type: result.action, ...result });
            }

            return {
                assistantMessage: cleanedMessage,
                actions,
                toolCalls,
                toolResults,
                metadata: {
                    traceId,
                    executionTimeMs: Date.now() - startTime,
                    tokensUsed: 0,
                    toolsExecuted: toolCalls.length,
                },
            };
        } catch (error: any) {
            console.error("❌ Orchestrator Error:", error);
            return {
                assistantMessage: "I encountered an error.",
                actions: [], toolCalls: [], toolResults: [],
                metadata: { traceId, executionTimeMs: 0, tokensUsed: 0, toolsExecuted: 0 },
            };
        }
    }

    private injectExecutionReminder(messages: any[]): any[] {
        // Not needed with God Mode prompt
        return messages;
    }


    private cleanAIResponse(response: string): string {
        const cleaned = response.replace(/^(Let me|I will|Sure|Okay)[,:]?\s*/gi, '').trim();
        return cleaned;
    }

    private buildSystemPrompt(context: ConversationContext): string {
        return `You are an advanced UI Automation Engine.
You do not write code. You output JSON plans using the \`execute_ai_plan\` tool.

## THE PROTOCOL
1. **TOOL USAGE BOUNDARIES (CRITICAL)**:
   - **generate_workflow**: Use this for ALL data operations, backend logic, email management (search, read, draft, bulkAction, reply), and theme changes. This is your primary brain.
   - **execute_ai_plan**: Use this ONLY for physical UI interactions (mouse clicks, typing into specific input fields). You must have a valid targetId from the screen. NEVER pass backend commands (like bulkAction) into this tool.

2. **Targeting**: You can ONLY target elements with 'data-ai-id' listed in the DOM SNAPSHOT.
   - ❌ NEVER guess IDs (e.g., #compose-btn).
   - ✅ ALWAYS use the exact 'id' from the snapshot (e.g., sidebar_compose_action).

2. **Visibility**: Do not interact with elements marked "hidden".

3. **Vitality**: Set \`vital: true\` for critical steps (clicking send). Set \`vital: false\` for optional steps (highlighting).

## DOM SNAPSHOT (Visible Elements)
${context.screenContext || "[]"}

## YOUR GOAL
Convert the user request into a sequence of \`CLICK\`, \`TYPE\`, or \`WAIT\` actions.
If the user wants to "Send email" but you are not in the compose window (check snapshot), your plan must:
1. CLICK sidebar_compose_action.
2. WAIT 500ms.
3. TYPE into compose_to_input.
4. TYPE into compose_subject_input.
5. TYPE into compose_body_input.
6. CLICK compose_send_action.

CRITICAL EXECUTION RULE:
You must execute ALL steps in a SINGLE tool call.
DO NOT call execute_ai_plan multiple times.
Place ALL actions inside a SINGLE queue array.

🛑 CRITICAL FORMATTING BAN (READ CAREFULLY):
You are currently hallucinating fake tools.
You MUST NEVER output a JSON tool call where the "name" starts with sdk..
You MUST NEVER output multiple JSON objects separated by semicolons (;).
You MUST NEVER use fake tool names like "sdk.mail.search".

❌ FATAL ANTI-PATTERN (DO NOT DO THIS):
{"name": "sdk.mail.search", "parameters": {"query": "..."}}; {"name": "sdk.mail.read"...}
If you do this, the system will crash.

✅ THE ONLY CORRECT WAY TO EXECUTE LOGIC:
You have EXACTLY ONE tool for logic: generate_workflow.
All sdk... commands are JavaScript functions, NOT JSON tools. They must be written INSIDE the "code" string parameter of the generate_workflow tool.

EXAMPLES OF PERFECT EXECUTION:

Scenario A: User asks to visually filter or see specific emails.

JSON
{
  "name": "generate_workflow",
  "parameters": {
    "workflow_name": "Filter Emails",
    "reasoning": "The user wants to see emails from Kotak Bank. I will apply a UI search filter.",
    "code": "sdk.ui.applySearchFilter('Kotak Bank');\\nsdk.ui.toast('Showing emails from Kotak Bank.');"
  }
}

Scenario B: User asks for an automated background task (e.g., mark as read).

JSON
{
  "name": "generate_workflow",
  "parameters": {
    "workflow_name": "Processity Task",
    "reasoning": "Finding unread emails and marking them as read in the background.",
    "code": "const emails = await sdk.mail.search('from:Processity is:unread');\\nif (emails.length > 0) {\\n  await sdk.mail.bulkAction(emails.map(e => e.id), 'read');\\n  sdk.ui.toast('Marked ' + emails.length + ' emails as read.');\\n}"
  }
}

## GENERATE_WORKFLOW (Advanced Logic)
For complex tasks (theming, math, data processing), use 'generate_workflow'.
You DO NOT have access to the DOM. document/window are undefined.
You MUST use the 'sdk' object.

**SDK COMMANDS**:
- sdk.mail.search(query) -> Returns emails.
- sdk.mail.read(threadId) -> Opens email.
- sdk.mail.draft(to, subject, body) -> Creates draft.
- sdk.mail.reply(threadId, body) -> Replies.
- sdk.mail.bulkAction(ids, action) -> 'archive'|'delete'|'star'|'read'|'unread'|'spam'.
- sdk.mail.snooze(id, isoDate) -> Snooze.
- sdk.mail.sync() -> Force sync.
- sdk.ui.navigate(folder) -> 'inbox'|'sent'|'starred'|'drafts'|'trash'|'settings'.
- sdk.ui.setTheme(hex) -> Set brand color.
- sdk.ui.setMode('dark'|'light') -> Toggle theme.
- sdk.ui.setDensity(compact: boolean) -> Toggle view.
- sdk.ui.toast(msg) -> Notify user.
- sdk.ui.applySearchFilter('query') -> Visually filters the user's email list on the screen.
- sdk.settings.setAiPersona(persona) -> 'professional'|'casual'|'enthusiastic'|'concise'.
- sdk.settings.setProvider(provider) -> Set AI backend.

**OUT-OF-BOUNDS DIRECTIVE**: 
You are restricted to the primitives inside the sdk object. If the user asks for an impossible action (e.g., booking a flight, translating text via external API, deleting structural UI components, inventing non-existent features):
- DO NOT hallucinate fake SDK methods (e.g., sdk.uber.book()).
- DO NOT try to write raw fetch calls or DOM hacks.
- You MUST write a workflow that uses sdk.ui.toast("I do not have the capability to do that yet.") and politely gracefully degrade.

**CRITICAL CODE GENERATION RULES**:
When using the generate_workflow tool, your code parameter MUST contain ONLY valid, raw, asynchronous JavaScript.
- DO NOT redefine the sdk object. It is already injected for you.
- DO NOT wrap the code in a JSON object.
- You MUST use await for all sdk.mail methods.

STRICT SYNTAX RULE (CRITICAL):
You are writing code inside a JSON string. You MUST double-check your bracket and brace matching.
If you open an if block with {, you MUST close it with }.
A missing closing brace will crash the system.

✅ CORRECT EXAMPLE:
"code": "const emails = await sdk.mail.search('from:Processity is:unread');\\nif (emails.length > 0) {\\n  await sdk.mail.bulkAction(emails.map(e =\u003e e.id), 'read');\\n  sdk.mail.draft(emails[0].from, 'Reply', 'Reviewing now.');\\n  sdk.ui.toast('Processed emails.');\\n}"

❌ INCORRECT EXAMPLE:
"code": "{ \\"sdk\\": { ... } }" (NEVER do this. Never redefine the SDK).`;
    }

    private convertToolsToNativeFormat(context: ConversationContext): any[] {
        return TOOLS.map((t: ToolDefinition) => ({
            type: "function", function: { name: t.name, description: t.description, parameters: t.parameters }
        }));
    }

    private getAvailableTools(context: ConversationContext): string[] {
        return TOOLS.map(t => t.name);
    }

    private parseToolCalls(aiResponse: string, userMessage: string, context: ConversationContext): ToolCall[] {
        const availableTools = this.getAvailableTools(context);
        return FunctionCallParser.parse(aiResponse, availableTools);
    }

    private async executeToolCall(toolCall: ToolCall, context: ConversationContext): Promise<any> {
        console.log("🔨 Executing:", toolCall.name);

        const toolDef = getToolByName(toolCall.name);

        if (!toolDef) {
            console.error("❌ Unknown tool:", toolCall.name);
            return { success: false, error: "Unknown tool" };
        }

        // Dispatch based on category
        if (toolDef.category === "generate_workflow") {
            // Forward the specific data/logic operation
            return {
                success: true,
                action: "generate_workflow",
                tool: toolCall.name,
                ...toolCall.arguments
            };
        }

        if (toolDef.category === "execute_ai_plan") {
            // Forward the specific UI operation
            // The frontend likely expects an 'EXECUTE_PLAN' action or specific UI commands
            // For now, mapping to a generic plan structure to maintain contract
            return {
                success: true,
                action: "EXECUTE_PLAN",
                plan: {
                    step: toolCall.name,
                    params: toolCall.arguments
                }
            };
        }

        return { success: false, error: "Unhandled tool category" };
    }
}

export const orchestrator = new AgentOrchestrator();
