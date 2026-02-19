
export type ExecutionMode = "safe" | "strict" | "permissive";

export interface SandboxPolicy {
    allowDOMAccess: boolean;
    allowNetworkAccess: boolean;
    allowLocalStorage: boolean;
    timeoutMs: number;
    mode: ExecutionMode;
}

export const DEFAULT_POLICY: SandboxPolicy = {
    allowDOMAccess: false,
    allowNetworkAccess: false,
    allowLocalStorage: false,
    timeoutMs: 5000,
    mode: "safe",
};

export interface ExecutionResult {
    success: boolean;
    result?: unknown;
    error?: string;
    errorType?: "compilation" | "runtime" | "timeout" | "policy";
    executionTimeMs?: number;
}

export interface AIPlan {
    steps: AIPlanStep[];
    description?: string;
}

export interface AIPlanStep {
    action: string;
    params?: Record<string, unknown>;
    description?: string;
}
