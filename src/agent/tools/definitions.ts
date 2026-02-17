/**
 * Tool definitions for AI function calling
 */

export const TOOLS = [
    {
        name: "searchEmails",
        description: "Search for emails in the user's mailbox using Gmail query syntax. Use this to find specific emails by sender, subject, date, etc.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Gmail search query. Examples: 'from:john@example.com', 'subject:meeting', 'after:2024/01/01', 'has:attachment'",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "openThread",
        description: "Open a specific email thread to view its full content. Use this after searching to display an email.",
        parameters: {
            type: "object",
            properties: {
                threadId: {
                    type: "string",
                    description: "The ID of the thread to open. Get this from search results.",
                },
            },
            required: ["threadId"],
        },
    },
    {
        name: "composeEmail",
        description: "Open the compose window to draft a new email with pre-filled fields.",
        parameters: {
            type: "object",
            properties: {
                to: {
                    type: "string",
                    description: "Recipient email address",
                },
                subject: {
                    type: "string",
                    description: "Email subject line",
                },
                body: {
                    type: "string",
                    description: "Email body content",
                },
            },
            required: ["to"],
        },
    },
    {
        name: "navigateToFolder",
        description: "Switch to a different mail folder (inbox, sent, starred, drafts)",
        parameters: {
            type: "object",
            properties: {
                folder: {
                    type: "string",
                    enum: ["inbox", "sent", "starred", "drafts"],
                    description: "The folder to navigate to",
                },
            },
            required: ["folder"],
        },
    },
    {
        name: "replyToEmail",
        description: "Open compose window to reply to the currently open email",
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: "Optional pre-filled reply body",
                },
            },
            required: [],
        },
    },
    {
        name: "createFunction",
        description: "Create a new custom function to perform a specific task. Use this when the user asks to create a workflow, automate something, or perform a task that doesn't have an existing function.",
        parameters: {
            type: "object",
            properties: {
                description: {
                    type: "string",
                    description: "Natural language description of what the function should do. Be specific and detailed.",
                },
                name: {
                    type: "string",
                    description: "Optional: Suggested name for the function (camelCase)",
                },
            },
            required: ["description"],
        },
    },

    {
        name: "listCustomFunctions",
        description: "List all custom functions that have been created",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },

    {
        name: "deleteFunction",
        description: "Delete a custom function by name",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Name of the function to delete",
                },
            },
            required: ["name"],
        },
    },
    {
        name: "execute_js",
        description: "Directly execute JavaScript code in the browser. Use this for 100% control over the UI, stores, and DOM. The code has access to 'uiRegistry', 'store', and 'document'.",
        parameters: {
            type: "object",
            properties: {
                code: {
                    type: "string",
                    description: "The JavaScript code to execute.",
                },
            },
            required: ["code"],
        },
    },
    {
        name: "define_tool",
        description: "Autonomously define a new tool with custom JS logic. This skips LLM generation and registers the tool directly.",
        parameters: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: "Unique ID for the tool (snake_case)",
                },
                description: {
                    type: "string",
                    description: "What the tool does",
                },
                jsCode: {
                    type: "string",
                    description: "The JavaScript logic for the tool's 'execute' function.",
                },
                parameters: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            type: { type: "string" },
                            description: { type: "string" },
                            required: { type: "boolean" }
                        }
                    },
                    description: "Optional parameters definition",
                }
            },
            required: ["id", "description", "jsCode"],
        },
    },
];

export type ToolName =
    | "searchEmails"
    | "openThread"
    | "composeEmail"
    | "navigateToFolder"
    | "replyToEmail"
    | "search_emails"
    | "open_thread"
    | "open_compose"
    | "navigate_inbox"
    | "navigate_sent"
    | "navigate_starred"
    | "navigate_drafts"
    | "toggle_theme"
    | "set_theme"
    | "filter_unread"
    | "filter_starred"
    | "clear_filters"
    | "mark_as_read"
    | "star_email"
    | "archive_email"
    | "delete_email"
    | "refresh_inbox"
    | "createFunction"
    | "listCustomFunctions"
    | "deleteFunction"
    | "execute_js"
    | "define_tool";

export interface ToolCall {
    id: string;
    name: ToolName;
    arguments: Record<string, any>;
}
