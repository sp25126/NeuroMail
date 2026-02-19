import { UIOperation, ComposedFunction } from "./types";
import { createLogger } from "../observability/logger";

const logger = createLogger("UIRegistry");

export class UIComponentRegistry {
    private operations: Map<string, UIOperation> = new Map();
    private composedFunctions: Map<string, ComposedFunction> = new Map();

    constructor() {
        this.registerBuiltInOperations();
    }

    /**
     * Register all UI operations that AI can discover and use
     */
    private registerBuiltInOperations() {
        // Navigation Operations
        this.registerOperation({
            id: "ui.view.switch",
            name: "switch_view",
            description: "Switch between different views (inbox, sent, compose, settings)",
            category: "navigation",
            endpoint: "/api/ui/view/switch",
            method: "POST",
            parameters: [
                {
                    name: "view",
                    type: "string",
                    description: "Target view to switch to",
                    required: true,
                    enum: ["inbox", "sent", "compose", "settings", "thread"],
                },
            ],
            returns: {
                type: "ViewState",
                description: "Current view state after switch",
            },
            permissions: ["ui.navigate"],
            rateLimit: { maxCalls: 30, windowMs: 60000 },
            examples: [
                {
                    input: { view: "inbox" },
                    output: { currentView: "inbox", success: true },
                    description: "Switch to inbox view",
                },
            ],
        });

        this.registerOperation({
            id: "ui.thread.open",
            name: "open_thread",
            description: "Open a specific email thread by ID",
            category: "navigation",
            endpoint: "/api/ui/thread/open",
            method: "POST",
            parameters: [
                {
                    name: "threadId",
                    type: "string",
                    description: "ID of thread to open",
                    required: true,
                },
            ],
            returns: {
                type: "ThreadState",
                description: "Thread opened successfully",
            },
            permissions: ["ui.navigate", "mail.read"],
            rateLimit: { maxCalls: 50, windowMs: 60000 },
            examples: [
                {
                    input: { threadId: "thread-123" },
                    output: { currentThread: "thread-123", view: "thread" },
                    description: "Open thread with ID thread-123",
                },
            ],
        });

        // Filter Operations
        this.registerOperation({
            id: "ui.filter.apply",
            name: "apply_filters",
            description: "Apply filters to inbox (date range, unread, sender)",
            category: "filter",
            endpoint: "/api/ui/filter/apply",
            method: "POST",
            parameters: [
                {
                    name: "dateRange",
                    type: "string",
                    description: "Date range filter",
                    required: false,
                    enum: ["1d", "7d", "30d", "90d", "all"],
                },
                {
                    name: "unreadOnly",
                    type: "boolean",
                    description: "Show only unread emails",
                    required: false,
                },
                {
                    name: "from",
                    type: "string",
                    description: "Filter by sender email",
                    required: false,
                },
            ],
            returns: {
                type: "FilterState",
                description: "Active filters after application",
            },
            permissions: ["ui.filter"],
            rateLimit: { maxCalls: 20, windowMs: 60000 },
            examples: [
                {
                    input: { dateRange: "7d", unreadOnly: true },
                    output: { filters: { dateRange: "7d", unreadOnly: true } },
                    description: "Show unread emails from last 7 days",
                },
            ],
        });

        this.registerOperation({
            id: "ui.search.execute",
            name: "search_emails",
            description: "Search emails using query string",
            category: "filter",
            endpoint: "/api/ui/search/execute",
            method: "POST",
            parameters: [
                {
                    name: "query",
                    type: "string",
                    description: "Search query (Gmail search syntax)",
                    required: true,
                    validation: {
                        min: 1,
                        max: 500,
                    },
                },
            ],
            returns: {
                type: "SearchResults",
                description: "Count of matching threads (not actual emails)",
            },
            permissions: ["ui.search"],
            rateLimit: { maxCalls: 10, windowMs: 60000 },
            examples: [
                {
                    input: { query: "from:sarah subject:project" },
                    output: { matchCount: 5, searchActive: true },
                    description: "Search for emails from Sarah about project",
                },
            ],
        });

        // Compose Operations
        this.registerOperation({
            id: "ui.compose.open",
            name: "open_compose",
            description: "Open compose modal with optional pre-filled data",
            category: "compose",
            endpoint: "/api/ui/compose/open",
            method: "POST",
            parameters: [
                {
                    name: "to",
                    type: "string",
                    description: "Recipient email address",
                    required: false,
                },
                {
                    name: "subject",
                    type: "string",
                    description: "Email subject",
                    required: false,
                },
                {
                    name: "body",
                    type: "string",
                    description: "Email body",
                    required: false,
                },
                {
                    name: "threadId",
                    type: "string",
                    description: "Thread ID for reply",
                    required: false,
                },
            ],
            returns: {
                type: "ComposeState",
                description: "Compose modal state",
            },
            permissions: ["ui.compose"],
            rateLimit: { maxCalls: 20, windowMs: 60000 },
            examples: [
                {
                    input: { to: "john@example.com", subject: "Meeting" },
                    output: { composeOpen: true, data: { to: "john@example.com" } },
                    description: "Open compose with recipient pre-filled",
                },
            ],
        });

        this.registerOperation({
            id: "ui.compose.fill",
            name: "fill_compose_field",
            description: "Fill a specific field in the compose form with animation",
            category: "compose",
            endpoint: "/api/ui/compose/fill",
            method: "POST",
            parameters: [
                {
                    name: "field",
                    type: "string",
                    description: "Field to fill",
                    required: true,
                    enum: ["to", "subject", "body"],
                },
                {
                    name: "value",
                    type: "string",
                    description: "Value to fill",
                    required: true,
                },
                {
                    name: "animate",
                    type: "boolean",
                    description: "Use typing animation",
                    required: false,
                },
            ],
            returns: {
                type: "FieldState",
                description: "Field state after filling",
            },
            permissions: ["ui.compose"],
            rateLimit: { maxCalls: 50, windowMs: 60000 },
            examples: [
                {
                    input: { field: "body", value: "Hello!", animate: true },
                    output: { field: "body", filled: true },
                    description: "Fill body with typing animation",
                },
            ],
        });

        // Selection Operations
        this.registerOperation({
            id: "ui.thread.select",
            name: "select_threads",
            description: "Select threads for bulk operations",
            category: "selection",
            endpoint: "/api/ui/thread/select",
            method: "POST",
            parameters: [
                {
                    name: "threadIds",
                    type: "array",
                    description: "Array of thread IDs to select",
                    required: true,
                },
                {
                    name: "action",
                    type: "string",
                    description: "Action to perform",
                    required: true,
                    enum: ["select", "deselect", "toggle"],
                },
            ],
            returns: {
                type: "SelectionState",
                description: "Current selection state",
            },
            permissions: ["ui.select"],
            rateLimit: { maxCalls: 30, windowMs: 60000 },
            examples: [
                {
                    input: { threadIds: ["t1", "t2"], action: "select" },
                    output: { selectedCount: 2 },
                    description: "Select two threads",
                },
            ],
        });

        // View State Operations
        this.registerOperation({
            id: "ui.state.get",
            name: "get_ui_state",
            description: "Get current UI state (view, filters, selection) - NO USER DATA",
            category: "view",
            endpoint: "/api/ui/state/get",
            method: "GET",
            parameters: [],
            returns: {
                type: "UIState",
                description: "Current UI state metadata only",
            },
            permissions: ["ui.read"],
            rateLimit: { maxCalls: 100, windowMs: 60000 },
            examples: [
                {
                    input: {},
                    output: {
                        view: "inbox",
                        filtersActive: true,
                        selectedCount: 0,
                        composeOpen: false,
                    },
                    description: "Get current UI state",
                },
            ],
        });

        logger.info("UI operations registered", {
            count: this.operations.size,
        });
    }

    /**
     * Register a UI operation
     */
    registerOperation(operation: UIOperation) {
        this.operations.set(operation.id, operation);
        logger.debug("Operation registered", { id: operation.id });
    }

    /**
     * Get all discoverable operations (for AI)
     */
    getAllOperations(): UIOperation[] {
        return Array.from(this.operations.values());
    }

    /**
     * Get operation by ID
     */
    getOperation(id: string): UIOperation | undefined {
        return this.operations.get(id);
    }

    /**
     * Load all composed functions from database via API
     */
    async loadComposedFunctions(userId: string) {
        try {
            // Registry is used on client, so we must fetch via API
            const response = await fetch(`/api/agent/registry/functions?userId=${userId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const functions: ComposedFunction[] = await response.json();

            for (const fn of functions) {
                this.composedFunctions.set(fn.id, fn);
            }

            logger.info("Composed functions loaded from API", { count: functions.length });
        } catch (error: any) {
            logger.error("Failed to load composed functions", { error: error.message });
        }
    }

    /**
     * Register AI-composed function (Persists via API)
     */
    async registerComposedFunction(fn: ComposedFunction, userId?: string) {
        this.composedFunctions.set(fn.id, fn);

        if (userId) {
            try {
                const response = await fetch('/api/agent/registry/functions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fn, userId })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

            } catch (error: any) {
                logger.error("Failed to persist composed function", { error: error.message });
            }
        }

        logger.info("Composed function registered", {
            id: fn.id,
            name: fn.name,
            steps: fn.steps.length,
        });
    }

    /**
     * Get composed function
     */
    getComposedFunction(id: string): ComposedFunction | undefined {
        return this.composedFunctions.get(id);
    }

    /**
     * List all composed functions
     */
    getAllComposedFunctions(): ComposedFunction[] {
        return Array.from(this.composedFunctions.values());
    }
}

export const uiRegistry = new UIComponentRegistry();
