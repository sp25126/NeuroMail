import { ToolCall } from "../tools/tools-definitions";

/**
 * Infer tool calls from user intent when AI doesn't explicitly call functions
 */
export class IntentInference {
    /**
     * Infer tool calls from user message
     */
    static infer(
        userMessage: string,
        aiResponse: string,
        context: any,
        availableTools: string[]
    ): ToolCall[] {
        const calls: ToolCall[] = [];
        const userLower = userMessage.toLowerCase();
        const aiLower = aiResponse.toLowerCase();

        console.log("🔍 [INFERENCE] Analyzing intent:", {
            userMessage: userMessage.substring(0, 100),
            availableTools: availableTools.length,
        });

        // Priority 1: Check for direct tool name matches
        for (const toolName of availableTools) {
            if (userLower.includes(toolName.toLowerCase().replace(/_/g, ' '))) {
                calls.push(this.createCall(toolName, this.extractParams(userMessage, toolName)));
                console.log("✅ [INFERENCE] Direct match:", toolName);
                return calls; // Return immediately if direct match
            }
        }

        // Priority 2: Theme operations
        if (this.matchesIntent(userLower, ["toggle theme", "switch theme", "dark mode", "light mode", "change theme"])) {
            if (userLower.includes("dark")) {
                calls.push(this.createCall("set_theme", { theme: "dark" }));
            } else if (userLower.includes("light")) {
                calls.push(this.createCall("set_theme", { theme: "light" }));
            } else {
                calls.push(this.createCall("toggle_theme", {}));
            }
            console.log("✅ [INFERENCE] Theme operation");
            return calls;
        }

        // Priority 3: Navigation
        const navigationMap: Record<string, string[]> = {
            navigate_inbox: ["inbox", "go to inbox", "show inbox", "open inbox"],
            navigate_sent: ["sent", "sent emails", "go to sent", "show sent", "outbox"],
            navigate_starred: ["starred", "important", "favorites", "starred emails"],
            navigate_drafts: ["drafts", "draft emails", "unsent"],
        };

        for (const [tool, keywords] of Object.entries(navigationMap)) {
            if (this.matchesIntent(userLower, keywords)) {
                calls.push(this.createCall(tool, {}));
                console.log("✅ [INFERENCE] Navigation:", tool);
                return calls;
            }
        }

        // Priority 4: Filters
        if (this.matchesIntent(userLower, ["unread", "show unread", "unread only", "new emails"])) {
            calls.push(this.createCall("filter_unread", {}));
            return calls;
        }

        if (this.matchesIntent(userLower, ["starred only", "show starred", "important only"])) {
            calls.push(this.createCall("filter_starred", {}));
            return calls;
        }

        if (this.matchesIntent(userLower, ["clear filter", "remove filter", "show all"])) {
            calls.push(this.createCall("clear_filters", {}));
            return calls;
        }

        // Priority 5: Search/Find
        if (this.matchesIntent(userLower, ["find", "search", "show", "filter", "locate", "get"]) &&
            this.matchesIntent(userLower, ["email", "mail", "message"])) {

            const query = this.extractSearchQuery(userMessage);
            if (query) {
                calls.push(this.createCall("searchEmails", { query }));
                console.log("✅ [INFERENCE] Search:", query);

                // If also mentions "open" or "show", add open action
                if (this.matchesIntent(userLower, ["open", "show me", "display"])) {
                    // Will open after search completes
                    calls.push(this.createCall("open_thread", { threadId: context.recentThreads?.[0]?.id || "" }));
                }

                return calls;
            }
        }

        // Priority 6: Open email
        if (this.matchesIntent(userLower, ["open", "show", "read", "display"]) &&
            this.matchesIntent(userLower, ["email", "mail", "message"])) {

            if (context.recentThreads?.length > 0) {
                calls.push(this.createCall("open_thread", { threadId: context.recentThreads[0].id }));
                console.log("✅ [INFERENCE] Open thread");
                return calls;
            }
        }

        // Priority 7: Compose
        if (this.matchesIntent(userLower, ["compose", "write", "send", "draft", "new email"])) {
            const emailMatch = userMessage.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
            const subjectMatch = userMessage.match(/subject[:\s]+["']?([^"'\n]+)["']?/i);

            calls.push(this.createCall("composeEmail", {
                to: emailMatch?.[1] || "",
                subject: subjectMatch?.[1] || "",
            }));
            console.log("✅ [INFERENCE] Compose");
            return calls;
        }

        // Priority 8: Email actions
        if (this.matchesIntent(userLower, ["mark as read", "mark read"])) {
            calls.push(this.createCall("mark_as_read", { threadId: context.currentThread?.id }));
            return calls;
        }

        if (this.matchesIntent(userLower, ["star", "favorite", "important"])) {
            calls.push(this.createCall("star_email", { threadId: context.currentThread?.id }));
            return calls;
        }

        if (this.matchesIntent(userLower, ["archive"])) {
            calls.push(this.createCall("archive_email", { threadId: context.currentThread?.id }));
            return calls;
        }

        if (this.matchesIntent(userLower, ["delete", "trash"])) {
            calls.push(this.createCall("delete_email", { threadId: context.currentThread?.id }));
            return calls;
        }

        // Priority 9: Refresh
        if (this.matchesIntent(userLower, ["refresh", "reload", "sync", "update"])) {
            calls.push(this.createCall("refresh_inbox", {}));
            return calls;
        }

        console.log("⚠️ [INFERENCE] No intent matched");
        return calls;
    }

    /**
     * Check if text matches any of the keywords
     */
    private static matchesIntent(text: string, keywords: string[]): boolean {
        return keywords.some(keyword => text.includes(keyword));
    }

    /**
     * Extract search query from message
     */
    private static extractSearchQuery(message: string): string | null {
        // Try to extract name
        const nameMatch = message.match(/\b(?:from|by|sent by)\s+([a-z][a-z\s]+?)(?:\s+email|\s+about|$)/i);
        if (nameMatch) {
            return `from:${nameMatch[1].trim()}`;
        }

        // Try to extract capitalized name
        const capitalMatch = message.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
        if (capitalMatch) {
            return `from:${capitalMatch[1].trim()}`;
        }

        // Try to extract email
        const emailMatch = message.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
        if (emailMatch) {
            return `from:${emailMatch[1]}`;
        }

        return null;
    }

    /**
     * Extract parameters for a tool
     */
    private static extractParams(message: string, toolName: string): Record<string, any> {
        // Tool-specific param extraction
        if (toolName === "searchEmails") {
            const query = this.extractSearchQuery(message);
            return query ? { query } : {};
        }

        if (toolName === "composeEmail") {
            const emailMatch = message.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
            return emailMatch ? { to: emailMatch[1] } : {};
        }

        return {};
    }

    /**
     * Create a tool call
     */
    private static createCall(name: string, args: Record<string, any>): ToolCall {
        return {
            id: `inferred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name as any,
            arguments: args,
        };
    }
}
