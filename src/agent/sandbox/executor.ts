
import { ExecutionSandbox } from "./execution-sandbox";
import { DEFAULT_POLICY, AIPlan, ExecutionResult } from "./sandbox-types";

/**
 * ExecutionEngine — higher-level executor that runs AIPlan objects.
 * Wraps ExecutionSandbox with plan-step orchestration.
 */
class ExecutionEngine {
    private sandbox: ExecutionSandbox;

    constructor() {
        this.sandbox = new ExecutionSandbox(DEFAULT_POLICY);
    }

    /**
     * Execute a single code string with an SDK context object.
     */
    async executeCode(
        code: string,
        sdkContext: Record<string, unknown> = {}
    ): Promise<ExecutionResult> {
        return this.sandbox.execute(code, sdkContext);
    }

    /**
     * Execute a structured AIPlan — runs each step sequentially.
     * Stops on first failure unless continueOnError is true.
     */
    async executePlan(
        plan: AIPlan,
        sdkContext: Record<string, unknown> = {},
        continueOnError = false
    ): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];

        for (const step of plan.steps) {
            const code = this.stepToCode(step);
            const result = await this.sandbox.execute(code, sdkContext);
            results.push(result);

            if (!result.success && !continueOnError) {
                console.error(
                    `[ExecutionEngine] Plan step failed: ${step.action}`,
                    result.error
                );
                break;
            }
        }

        return results;
    }

    /**
     * Convert an AIPlanStep to executable JS code using the SDK.
     */
    private stepToCode(step: { action: string; params?: Record<string, unknown> }): string {
        const params = step.params
            ? JSON.stringify(step.params)
            : "{}";

        // Map action names to SDK calls
        const actionMap: Record<string, string> = {
            navigate_folder: `await sdk.ui.navigate(${params})`,
            open_compose: `sdk.ui.openCompose()`,
            close_compose: `sdk.ui.closeCompose()`,
            fill_compose: `sdk.ui.fillCompose(${params})`,
            toggle_theme: `sdk.ui.toggleTheme()`,
            set_theme: `sdk.ui.setTheme(${params})`,
            set_search_query: `sdk.ui.setSearchQuery(${params})`,
            clear_search: `sdk.ui.clearSearch()`,
            select_thread: `sdk.ui.selectThread(${params})`,
            show_toast: `sdk.ui.showToast(${params})`,
            search_emails: `await sdk.mail.search(${params})`,
            mark_read: `await sdk.mail.markRead(${params})`,
            mark_unread: `await sdk.mail.markUnread(${params})`,
            star_email: `await sdk.mail.star(${params})`,
            archive_email: `await sdk.mail.archive(${params})`,
            delete_email: `await sdk.mail.delete(${params})`,
            send_email: `await sdk.mail.send(${params})`,
            bulk_mark_read: `await sdk.mail.bulkMarkRead(${params})`,
            bulk_archive: `await sdk.mail.bulkArchive(${params})`,
        };

        const sdkCall = actionMap[step.action];
        if (!sdkCall) {
            return `sdk.ui.showToast({ message: "Unknown action: ${step.action}", type: "warning" })`;
        }

        return sdkCall + ";";
    }
}

export const executionEngine = new ExecutionEngine();
