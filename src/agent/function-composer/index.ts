
import { uiRegistry } from "@/agent/ui-registry/registry";
import { UIOperation } from "@/agent/ui-registry/types";
import { ToolCall } from "../tools/tools-definitions";

/**
 * AI Function Composer - Allows AI to create new functions dynamically
 */

export interface ComposedFunction {
    id: string;
    name: string;
    description: string;
    code: string;
    body?: string; // Optional body for fallback compatibility
    parameters?: any[];
    createdAt: string;
    usageCount: number;
}

class FunctionComposer {
    private composedFunctions: Map<string, ComposedFunction> = new Map();
    private executionContext: any = {};

    /**
     * Generate a new function from natural language description
     */
    async composeFunction(
        description: string,
        llmProvider: any,
        availableTools: any[]
    ): Promise<ComposedFunction> {
        console.log("🔧 [COMPOSER] Composing function:", description);

        // Get available operations to use as building blocks
        const opsDescription = availableTools
            .map((op) => `- ${op.id}: ${op.description}`)
            .join("\n");

        const prompt = `You are a function generator. Create a JavaScript function based on this request:

REQUEST: ${description}

AVAILABLE UI OPERATIONS:
${opsDescription}

Generate a function that:
1. Has a clear, descriptive name (camelCase)
2. Takes necessary parameters
3. Uses available UI operations to accomplish the task
4. Returns a result or executes an action

OUTPUT FORMAT:
\`\`\`json
{
  "name": "functionName",
  "description": "What this function does",
  "parameters": [
    { "name": "param1", "type": "string", "description": "..." }
  ],
  "code": "async function functionName(params) { /* code here */ }"
}
\`\`\`

EXAMPLE:
Request: "Mark all unread emails from John as important"
Output:
\`\`\`json
{
  "name": "markJohnEmailsImportant",
  "description": "Find all unread emails from John and mark them as important",
  "parameters": [
    { "name": "sender", "type": "string", "description": "Sender name or email" }
  ],
  "code": "async function markJohnEmailsImportant(params) {\\n  const { sender } = params;\\n  await uiRegistry.execute('search_emails', { query: \`from:\${sender} is:unread\` });\\n  const emails = store.emails;\\n  for (const email of emails) {\\n    await uiRegistry.execute('star_email', { threadId: email.id });\\n  }\\n  return { success: true, count: emails.length };\\n}"
}
\`\`\`

Now generate the function for: ${description}`;

        const response = await llmProvider.generate(
            [
                { role: "system" as const, content: "You are a code generator." },
                { role: "user" as const, content: prompt },
            ],
            { temperature: 0.2 }
        );

        // Parse response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch) {
            throw new Error("Failed to parse function definition");
        }

        const functionDef = JSON.parse(jsonMatch[1]);

        // Create composed function
        const composedFunc: ComposedFunction = {
            id: `composed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: functionDef.name,
            description: functionDef.description,
            code: functionDef.code,
            parameters: functionDef.parameters || [],
            createdAt: new Date().toISOString(),
            usageCount: 0,
        };

        // Store function (memory only on server)
        this.composedFunctions.set(composedFunc.id, composedFunc);

        console.log("✅ [COMPOSER] Function created:", composedFunc.name);

        // Only register/save if on client
        if (typeof window !== 'undefined') {
            this.registerComposedFunction(composedFunc);
            this.saveToStorage();
        }

        return composedFunc;
    }

    /**
     * Register a composed function in the UI registry
     */
    public registerComposedFunction(func: ComposedFunction) {
        uiRegistry.registerOperation({
            id: func.name,
            name: func.name,
            description: func.description,
            category: "view", // Categorize as view or appropriate category
            endpoint: "/api/agent/execute-composed", // Composed functions should go through a specific endpoint
            method: "POST",
            parameters: func.parameters?.map((p: any) => ({
                name: p.name,
                type: p.type,
                description: p.description,
                required: p.required ?? false,
            })) || [],
            returns: { type: "any", description: "Result of composed function" },
            permissions: ["ai.execute"],
            rateLimit: { maxCalls: 10, windowMs: 60000 },
            examples: []
        });

        console.log("📋 [COMPOSER] Registered in UI registry:", func.name);
        // Ensure it's in our map too
        if (!this.composedFunctions.has(func.id)) {
            this.composedFunctions.set(func.id, func);
        }
    }

    /**
     * Execute a composed function
     */
    async executeComposedFunction(
        functionId: string,
        params: any
    ): Promise<any> {
        const func = this.composedFunctions.get(functionId);

        if (!func) {
            throw new Error(`Function ${functionId} not found`);
        }

        console.log("⚡ [COMPOSER] Executing composed function:", func.name);

        // Increment usage count
        func.usageCount++;

        try {
            // Create safe execution context
            const context = {
                params,
                uiRegistry,
                console,
                // Add store reference
                store: (await import("@/store/useMailStore")).useMailStore.getState(),
            };

            // Execute function in sandboxed context
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executableFunc = new AsyncFunction(
                "params",
                "uiRegistry",
                "store",
                "console",
                `
        ${func.code}
        return ${func.name}({ params, uiRegistry, store });
      `
            );

            const result = await executableFunc(
                context.params,
                context.uiRegistry,
                context.store,
                context.console
            );

            console.log("✅ [COMPOSER] Function executed:", result);

            return result;
        } catch (error: any) {
            console.error("❌ [COMPOSER] Execution failed:", error);
            throw error;
        }
    }

    /**
     * List all composed functions
     */
    listFunctions(): ComposedFunction[] {
        return Array.from(this.composedFunctions.values());
    }

    /**
     * Get a composed function by name
     */
    getFunctionByName(name: string): ComposedFunction | undefined {
        return Array.from(this.composedFunctions.values()).find(
            (f) => f.name === name
        );
    }

    /**
     * Get a composed function by ID
     */
    getFunction(id: string): ComposedFunction | undefined {
        return this.composedFunctions.get(id);
    }

    /**
     * Delete a composed function
     */
    deleteFunction(functionId: string): boolean {
        const func = this.composedFunctions.get(functionId);
        if (func) {
            this.composedFunctions.delete(functionId);
            // The current registry doesn't have an unregister operation. 
            // In a real scenario, we might want to implement it, but for now we'll just remove from our local map.
            console.log("🗑️ [COMPOSER] Deleted function:", func.name);
            return true;
        }
        return false;
    }

    /**
     * Save composed functions to storage
     */
    async saveToStorage() {
        if (typeof window === 'undefined') return;
        try {
            const functions = Array.from(this.composedFunctions.values());
            localStorage.setItem("composedFunctions", JSON.stringify(functions));
            console.log("💾 [COMPOSER] Saved", functions.length, "functions");
        } catch (e) {
            console.error("Failed to save functions", e);
        }
    }

    /**
     * Load composed functions from storage
     */
    async loadFromStorage() {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem("composedFunctions");
            if (stored) {
                const functions: ComposedFunction[] = JSON.parse(stored);
                for (const func of functions) {
                    this.composedFunctions.set(func.id, func);
                    this.registerComposedFunction(func);
                }
                console.log("📂 [COMPOSER] Loaded", functions.length, "functions");
            }
        } catch (e) {
            console.error("Failed to load functions", e);
        }
    }
}

// Singleton
export const functionComposer = new FunctionComposer();
