
import { SandboxPolicy, DEFAULT_POLICY, ExecutionResult } from "./sandbox-types";
import { toast } from "sonner";

/**
 * Client-safe execution sandbox.
 * Runs AI-generated code with DOM poisoning and timeout enforcement.
 * This is the CLIENT-SIDE version (no 'server-only' guard).
 */
export class ExecutionSandbox {
    private policy: SandboxPolicy;

    constructor(policy: SandboxPolicy = DEFAULT_POLICY) {
        this.policy = policy;
    }

    private autoBalanceBraces(code: string): string {
        let depth = 0;
        let inString = false;
        let stringChar = "";

        for (let i = 0; i < code.length; i++) {
            const ch = code[i];
            const prev = i > 0 ? code[i - 1] : "";

            if (inString) {
                if (ch === stringChar && prev !== "\\") inString = false;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === "`") {
                inString = true;
                stringChar = ch;
                continue;
            }
            if (ch === "{") depth++;
            if (ch === "}") depth--;
        }

        if (depth > 0) code += "}".repeat(depth);
        return code;
    }

    async execute(
        code: string,
        context: Record<string, unknown> = {}
    ): Promise<ExecutionResult> {
        const start = Date.now();
        const balanced = this.autoBalanceBraces(code);

        const blockedGlobals = [
            !this.policy.allowDOMAccess ? "const document = undefined;" : "",
            !this.policy.allowDOMAccess ? "const window = undefined;" : "",
            !this.policy.allowLocalStorage ? "const localStorage = undefined;" : "",
            !this.policy.allowLocalStorage ? "const sessionStorage = undefined;" : "",
            !this.policy.allowNetworkAccess ? "const fetch = undefined;" : "",
            !this.policy.allowNetworkAccess ? "const XMLHttpRequest = undefined;" : "",
            "const eval = undefined;",
        ]
            .filter(Boolean)
            .join("\n");

        const wrapped = `
      (async function neuromailSandbox(sdk) {
        "use strict";
        ${blockedGlobals}
        ${balanced}
      })
    `;

        let fn: (ctx: Record<string, unknown>) => Promise<unknown>;

        try {
            // eslint-disable-next-line no-new-func
            fn = new Function("return " + wrapped)();
        } catch (e: unknown) {
            const msg = `Syntax error: ${e instanceof Error ? e.message : String(e)}`;
            toast.error(msg);
            return {
                success: false,
                error: msg,
                errorType: "compilation",
                executionTimeMs: Date.now() - start,
            };
        }

        try {
            const result = await Promise.race([
                fn(context),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error("Execution timeout")),
                        this.policy.timeoutMs
                    )
                ),
            ]);
            return {
                success: true,
                result,
                executionTimeMs: Date.now() - start,
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(`Execution failed: ${msg}`);
            return {
                success: false,
                error: msg,
                errorType: msg.includes("timeout") ? "timeout" : "runtime",
                executionTimeMs: Date.now() - start,
            };
        }
    }
}

export const executionSandboxInstance = new ExecutionSandbox();
