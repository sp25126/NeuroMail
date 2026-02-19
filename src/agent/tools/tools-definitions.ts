// src/agent/tools/tools-definitions.ts
// ─────────────────────────────────────────────────────
// Defines every tool the AI orchestrator can call.
// Two strict categories:
//   generate_workflow  → logic, data, multi-step sequences
//   execute_ai_plan    → single physical UI actions
// ─────────────────────────────────────────────────────

export type ToolName =
    // ── generate_workflow tools ──
    | "search_emails"
    | "get_thread"
    | "mark_read"
    | "mark_unread"
    | "star_email"
    | "unstar_email"
    | "archive_email"
    | "delete_email"
    | "send_email"
    | "reply_email"
    | "get_preferences"
    | "set_preferences"
    | "get_composed_functions"
    | "save_composed_function"
    | "bulk_mark_read"
    | "bulk_archive"
    | "bulk_delete"
    // ── execute_ai_plan tools ──
    | "navigate_folder"
    | "open_compose"
    | "close_compose"
    | "fill_compose"
    | "open_settings"
    | "close_settings"
    | "toggle_theme"
    | "set_theme"
    | "set_search_query"
    | "clear_search"
    | "select_thread"
    | "show_toast"
    | "open_ai_panel"
    | "close_ai_panel"
    | "reset_ai_chat";

export interface ToolParameter {
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    required?: boolean;
    enum?: string[];
}

export interface ToolDefinition {
    name: ToolName;
    description: string;
    category: "generate_workflow" | "execute_ai_plan";
    parameters: Record<string, ToolParameter>;
}

export interface ToolCall {
    id: string;
    name: ToolName;
    arguments: Record<string, unknown>;
}

export const TOOLS: ToolDefinition[] = [
    // ════════════════════════════════════════
    // CATEGORY: generate_workflow
    // Use for: data operations, logic, multi-step sequences
    // ════════════════════════════════════════
    {
        name: "search_emails",
        category: "generate_workflow",
        description:
            "Search emails using Gmail query syntax. Use for: finding emails from a sender, by subject, date range, label, or any Gmail operator (from:, subject:, is:unread, newer_than:, has:attachment).",
        parameters: {
            query: {
                type: "string",
                description: "Gmail search query string. Examples: 'from:google.com', 'is:unread newer_than:7d', 'subject:invoice has:attachment'",
                required: true,
            },
            maxResults: {
                type: "number",
                description: "Maximum number of results. Default: 20. Max: 100.",
            },
        },
    },
    {
        name: "get_thread",
        category: "generate_workflow",
        description: "Fetch the full content of a specific email thread by its ID.",
        parameters: {
            threadId: {
                type: "string",
                description: "The Gmail thread ID to fetch.",
                required: true,
            },
        },
    },
    {
        name: "mark_read",
        category: "generate_workflow",
        description: "Mark a single email thread as read.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to mark as read.",
                required: true,
            },
        },
    },
    {
        name: "mark_unread",
        category: "generate_workflow",
        description: "Mark a single email thread as unread.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to mark as unread.",
                required: true,
            },
        },
    },
    {
        name: "star_email",
        category: "generate_workflow",
        description: "Star (bookmark) an email thread.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to star.",
                required: true,
            },
        },
    },
    {
        name: "unstar_email",
        category: "generate_workflow",
        description: "Remove star from an email thread.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to unstar.",
                required: true,
            },
        },
    },
    {
        name: "archive_email",
        category: "generate_workflow",
        description: "Archive an email thread (remove from inbox, keep in All Mail).",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to archive.",
                required: true,
            },
        },
    },
    {
        name: "delete_email",
        category: "generate_workflow",
        description: "Move an email thread to trash.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to trash.",
                required: true,
            },
        },
    },
    {
        name: "send_email",
        category: "generate_workflow",
        description: "Send a new email.",
        parameters: {
            to: {
                type: "string",
                description: "Recipient email address(es), comma-separated.",
                required: true,
            },
            subject: {
                type: "string",
                description: "Email subject line.",
                required: true,
            },
            body: {
                type: "string",
                description: "Plain text email body.",
                required: true,
            },
            cc: {
                type: "string",
                description: "CC recipients, comma-separated.",
            },
        },
    },
    {
        name: "reply_email",
        category: "generate_workflow",
        description: "Reply to an existing email thread.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to reply to.",
                required: true,
            },
            body: {
                type: "string",
                description: "The reply body text.",
                required: true,
            },
        },
    },
    {
        name: "get_preferences",
        category: "generate_workflow",
        description: "Get the current user's preferences (theme, AI provider, persona).",
        parameters: {},
    },
    {
        name: "set_preferences",
        category: "generate_workflow",
        description: "Update user preferences in the database.",
        parameters: {
            theme: {
                type: "string",
                description: "UI theme.",
                enum: ["dark", "light"],
            },
            llm_provider: {
                type: "string",
                description: "AI provider to use.",
                enum: ["ollama", "openai", "openrouter", "colab"],
            },
            persona: {
                type: "string",
                description: "AI reply persona style.",
                enum: ["professional", "casual", "concise", "detailed"],
            },
        },
    },
    {
        name: "get_composed_functions",
        category: "generate_workflow",
        description: "Retrieve all custom AI-composed functions saved by the user.",
        parameters: {},
    },
    {
        name: "save_composed_function",
        category: "generate_workflow",
        description: "Save a new custom AI-generated function to the database for future reuse.",
        parameters: {
            name: {
                type: "string",
                description: "A short camelCase function name.",
                required: true,
            },
            description: {
                type: "string",
                description: "What this function does, in plain English.",
                required: true,
            },
            code: {
                type: "string",
                description: "The JavaScript code of the function using the Neuromail SDK.",
                required: true,
            },
        },
    },
    {
        name: "bulk_mark_read",
        category: "generate_workflow",
        description: "Mark multiple email threads as read in one operation.",
        parameters: {
            threadIds: {
                type: "array",
                description: "Array of thread IDs to mark as read.",
                required: true,
            },
        },
    },
    {
        name: "bulk_archive",
        category: "generate_workflow",
        description: "Archive multiple email threads at once.",
        parameters: {
            threadIds: {
                type: "array",
                description: "Array of thread IDs to archive.",
                required: true,
            },
        },
    },
    {
        name: "bulk_delete",
        category: "generate_workflow",
        description: "Move multiple threads to trash at once.",
        parameters: {
            threadIds: {
                type: "array",
                description: "Array of thread IDs to delete.",
                required: true,
            },
        },
    },

    // ════════════════════════════════════════
    // CATEGORY: execute_ai_plan
    // Use for: single UI state changes, navigation, visual actions
    // ════════════════════════════════════════
    {
        name: "navigate_folder",
        category: "execute_ai_plan",
        description: "Switch the inbox view to a different Gmail folder/label.",
        parameters: {
            folder: {
                type: "string",
                description: "The folder to navigate to.",
                enum: ["inbox", "sent", "drafts", "starred", "trash", "spam", "all"],
                required: true,
            },
        },
    },
    {
        name: "open_compose",
        category: "execute_ai_plan",
        description: "Open the email compose modal (empty, ready for input).",
        parameters: {},
    },
    {
        name: "close_compose",
        category: "execute_ai_plan",
        description: "Close the email compose modal.",
        parameters: {},
    },
    {
        name: "fill_compose",
        category: "execute_ai_plan",
        description:
            "Open compose modal and pre-fill fields. Use when user says 'write an email to X about Y'.",
        parameters: {
            to: {
                type: "string",
                description: "Pre-fill the To field.",
            },
            subject: {
                type: "string",
                description: "Pre-fill the Subject field.",
            },
            body: {
                type: "string",
                description: "Pre-fill the Body field.",
            },
        },
    },
    {
        name: "open_settings",
        category: "execute_ai_plan",
        description: "Open the settings panel.",
        parameters: {},
    },
    {
        name: "close_settings",
        category: "execute_ai_plan",
        description: "Close the settings panel.",
        parameters: {},
    },
    {
        name: "toggle_theme",
        category: "execute_ai_plan",
        description: "Toggle between dark and light theme.",
        parameters: {},
    },
    {
        name: "set_theme",
        category: "execute_ai_plan",
        description: "Explicitly set the theme to dark or light.",
        parameters: {
            theme: {
                type: "string",
                description: "The theme to apply.",
                enum: ["dark", "light"],
                required: true,
            },
        },
    },
    {
        name: "set_search_query",
        category: "execute_ai_plan",
        description:
            "Set the inbox search/filter query, instantly updating the email list. Use for: 'show unread', 'show starred', 'show emails from X'.",
        parameters: {
            query: {
                type: "string",
                description: "Gmail query string to filter the inbox view.",
                required: true,
            },
        },
    },
    {
        name: "clear_search",
        category: "execute_ai_plan",
        description: "Clear the search query and return to the full inbox view.",
        parameters: {},
    },
    {
        name: "select_thread",
        category: "execute_ai_plan",
        description: "Open a specific email thread in the detail view.",
        parameters: {
            threadId: {
                type: "string",
                description: "The thread ID to open.",
                required: true,
            },
        },
    },
    {
        name: "show_toast",
        category: "execute_ai_plan",
        description: "Display a notification toast message to the user.",
        parameters: {
            message: {
                type: "string",
                description: "The message to display.",
                required: true,
            },
            type: {
                type: "string",
                description: "Toast style.",
                enum: ["success", "error", "info", "warning"],
            },
        },
    },
    {
        name: "open_ai_panel",
        category: "execute_ai_plan",
        description: "Open/expand the AI assistant panel.",
        parameters: {},
    },
    {
        name: "close_ai_panel",
        category: "execute_ai_plan",
        description: "Close/collapse the AI assistant panel.",
        parameters: {},
    },
    {
        name: "reset_ai_chat",
        category: "execute_ai_plan",
        description: "Clear the AI chat history and start a fresh conversation.",
        parameters: {},
    },
];

// ── Lookup helpers used by the orchestrator ──────────────────

/** Get a tool definition by name */
export function getToolByName(name: ToolName): ToolDefinition | undefined {
    return TOOLS.find((t) => t.name === name);
}

/** Get all tools in a specific category */
export function getToolsByCategory(
    category: "generate_workflow" | "execute_ai_plan"
): ToolDefinition[] {
    return TOOLS.filter((t) => t.category === category);
}

/** Get a compact list of tool names + descriptions for LLM system prompts */
export function getToolsSystemPrompt(): string {
    const workflowTools = getToolsByCategory("generate_workflow");
    const planTools = getToolsByCategory("execute_ai_plan");

    const format = (t: ToolDefinition) =>
        `- ${t.name}: ${t.description}`;

    return [
        "=== WORKFLOW TOOLS (data & logic) ===",
        ...workflowTools.map(format),
        "",
        "=== UI PLAN TOOLS (visual actions) ===",
        ...planTools.map(format),
    ].join("\n");
}
