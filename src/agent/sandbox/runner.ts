
import { executionEngine } from "./executor";
import { AIPlan, ExecutionResult } from "./sandbox-types";

/**
 * executeAiWorkflow — top-level entry point called by AssistantPanel.
 * Takes an AI-generated plan or raw code string and executes it safely.
 */
export async function executeAiWorkflow(
    input: AIPlan | string,
    sdkContext: any = {}
): Promise<ExecutionResult | ExecutionResult[]> {
    if (typeof input === "string") {
        // Raw code string — execute directly
        const cleanCode = input.replace(/```(?:typescript|javascript|js|ts)?/g, "").replace(/```/g, "").trim();
        return executionEngine.executeCode(cleanCode, sdkContext);
    }

    // Structured AIPlan — execute step by step
    return executionEngine.executePlan(input, sdkContext);
}

/**
 * Quick helper — execute a single named action with params.
 * Used for simple one-shot AI commands.
 */
export async function executeAiAction(
    action: string,
    params: Record<string, unknown> = {},
    sdkContext: Record<string, unknown> = {}
): Promise<ExecutionResult> {
    const plan: AIPlan = {
        steps: [{ action, params }],
        description: `Execute: ${action}`,
    };
    const results = await executionEngine.executePlan(plan, sdkContext);
    return results[0] ?? {
        success: false,
        error: "No steps executed",
        errorType: "runtime",
    };
}
