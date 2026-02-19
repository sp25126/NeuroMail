

import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("ExecutionSandbox");

export interface SandboxResult {
    success: boolean;
    result?: unknown;
    error?: string;
    errorType?: "compilation" | "runtime";
    executionTimeMs?: number;
}

export interface ComposedFunctionRequest {
    functionId: string;
    arguments: Record<string, unknown>;
    sessionId?: string;
    [key: string]: unknown;
}

export interface OperationRequest {
    operationId: string;
    arguments: Record<string, unknown>;
    sessionId?: string;
    userId?: string; // route.ts passes userId
    [key: string]: unknown;
}

/**
 * Neuromail SDK Execution Sandbox.
 * Runs AI-generated code in isolation.
 * - DOM access is explicitly blocked (document, window, localStorage = undefined)
 * - Brace auto-balancing handles Llama 3.2 syntax quirks
 * - Two-stage error handling: compilation errors and runtime errors caught separately
 */
class ExecutionSandbox {
    /**
     * Counts unbalanced braces in a code string and appends missing closing braces.
     */
    private autoBalanceBraces(code: string): string {
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < code.length; i++) {
            const ch = code[i];
            const prev = i > 0 ? code[i - 1] : '';

            if (inString) {
                if (ch === stringChar && prev !== '\\') inString = false;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                inString = true;
                stringChar = ch;
                continue;
            }
            if (ch === '{') depth++;
            if (ch === '}') depth--;
        }

        if (depth > 0) {
            logger.warn(`Auto-balancing: appending ${depth} missing closing brace(s)`);
            code += '}'.repeat(depth);
        }

        return code;
    }

    /**
     * Execute AI-generated code safely.
     * @param code - The raw JS/TS code string from the AI
     * @param sdkContext - The Neuromail SDK object to inject as 'sdk'
     */
    async execute(
        code: string,
        sdkContext: Record<string, unknown>
    ): Promise<SandboxResult> {
        // Stage 1: Auto-balance braces (Llama 3.2 often misses closing braces)
        const balancedCode = this.autoBalanceBraces(code);

        // Stage 2: Wrap in IIFE with DOM poisoning
        const wrappedCode = `
      (async function neuromailSandbox(sdk) {
        "use strict";
        // DOM Poisoning — AI cannot access browser globals
        const document = undefined;
        const window = undefined;
        const localStorage = undefined;
        const sessionStorage = undefined;
        const fetch = undefined;
        const XMLHttpRequest = undefined;
        const WebSocket = undefined;
        const eval = undefined;
        const Function = undefined;

        // Execute AI code
        ${balancedCode}
      })
    `;

        let compiledFn: (sdk: Record<string, unknown>) => Promise<unknown>;

        // Stage 3a: Compilation error catch
        try {
            // eslint-disable-next-line no-new-func
            compiledFn = new globalThis.Function('return ' + wrappedCode)();
        } catch (compilationError: unknown) {
            const msg = compilationError instanceof Error
                ? compilationError.message
                : String(compilationError);
            logger.error("Sandbox compilation error", { error: msg });
            return {
                success: false,
                error: `Syntax error in generated code: ${msg}`,
                errorType: "compilation",
            };
        }

        // Stage 3b: Runtime error catch
        try {
            const result = await Promise.race([
                compiledFn(sdkContext),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Execution timeout (5s)")), 5000)
                ),
            ]);
            logger.info("Sandbox execution successful");
            return { success: true, result };
        } catch (runtimeError: unknown) {
            const msg = runtimeError instanceof Error
                ? runtimeError.message
                : String(runtimeError);
            logger.error("Sandbox runtime error", { error: msg });
            return {
                success: false,
                error: `Runtime error: ${msg}`,
                errorType: "runtime",
            };
        }
    }
    async executeComposedFunction(
        request: ComposedFunctionRequest
    ): Promise<SandboxResult> {
        const start = Date.now();

        try {
            // Resolve the composed function definition from the registry
            // Dynamic import to avoid circular dependencies
            const { functionComposer } = await import("@/agent/function-composer");

            const fn = functionComposer.getFunction(request.functionId);

            if (!fn) {
                return {
                    success: false,
                    error: `Composed function not found: ${request.functionId}`,
                    errorType: "runtime",
                    executionTimeMs: Date.now() - start,
                };
            }

            // Build executable code string from the composed function
            const code = typeof fn === "string"
                ? fn
                : (fn as any).code ?? (fn as any).body ?? JSON.stringify(fn);

            // Execute through the sandboxed runtime with provided arguments
            const result = await this.execute(code, {
                args: request.arguments,
                sessionId: request.sessionId ?? "default",
            });

            return {
                ...result,
                executionTimeMs: Date.now() - start,
            };
        } catch (e: unknown) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorType: "runtime",
                executionTimeMs: Date.now() - start,
            };
        }
    }

    /**
     * Execute a named operation (SDK action).
     */
    async executeOperation(
        request: OperationRequest
    ): Promise<SandboxResult> {
        const start = Date.now();
        try {
            // Map operationId to an executable code snippet using the agent SDK
            const actionCode = this.operationToCode(
                request.operationId,
                request.arguments
            );

            return await this.execute(actionCode, {
                args: request.arguments,
                sessionId: request.sessionId ?? "default",
            });
        } catch (e: unknown) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorType: "runtime",
                executionTimeMs: Date.now() - start,
            };
        }
    }

    private operationToCode(
        operationId: string,
        params: Record<string, unknown>
    ): string {
        const p = JSON.stringify(params);
        const operationMap: Record<string, string> = {
            send_email: `await sdk.mail.send(${p})`,
            archive_email: `await sdk.mail.archive(${p})`,
            delete_email: `await sdk.mail.delete(${p})`,
            mark_read: `await sdk.mail.markRead(${p})`,
            mark_unread: `await sdk.mail.markUnread(${p})`,
            star_email: `await sdk.mail.star(${p})`,
            bulk_archive: `await sdk.mail.bulkArchive(${p})`,
            bulk_mark_read: `await sdk.mail.bulkMarkRead(${p})`,
            search_emails: `await sdk.mail.search(${p})`,
            show_toast: `sdk.ui.showToast(${p})`,

            // Allow UI navigation operations too
            navigate_folder: `await sdk.ui.navigate(${p})`,
            open_compose: `sdk.ui.openCompose()`,
            close_compose: `sdk.ui.closeCompose()`,
            fill_compose: `sdk.ui.fillCompose(${p})`,
        };

        return (
            operationMap[operationId] ??
            `sdk.ui.showToast({ message: "Unknown operation: ${operationId}", type: "warning" })`
        ) + ";";
    }
}

// Singleton export
export const executionSandbox = new ExecutionSandbox();
