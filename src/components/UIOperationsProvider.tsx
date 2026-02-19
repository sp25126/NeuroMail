"use client";

import { useEffect } from "react";
import { uiRegistry } from "@/lib/ui-registry";
import { useMailStore } from "@/store/useMailStore";
import { useUIStore } from "@/store/uiStore";
import { useRouter } from "next/navigation";
import { functionComposer } from "@/agent/function-composer";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAIChangesStore } from "@/store/useAIChangesStore";

export function UIOperationsProvider({ children }: { children: React.ReactNode }) {
    const store = useMailStore();
    const router = useRouter();

    // Re-apply persistent AI changes on mount
    useEffect(() => {
        const { persistAIChanges } = useSettingsStore.getState();
        if (persistAIChanges) {
            const changes = useAIChangesStore.getState().changes;
            console.log("🔄 [UI_OPS] Re-applying", changes.length, "persistent AI changes");

            changes.forEach(change => {
                try {
                    console.log(`✨ [UI_OPS] Re-applying change: ${change.id} (${change.type})`);
                    if (change.type === 'style' || change.type === 'script') {
                        // For generic scripts, we re-run them
                        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                        const execFunc = new AsyncFunction(
                            "uiRegistry",
                            "store",
                            "document",
                            "window",
                            "console",
                            change.value
                        );
                        execFunc(uiRegistry, useMailStore.getState(), document, window, console);
                    }
                } catch (e) {
                    console.error("❌ [UI_OPS] Failed to re-apply change:", change.id, e);
                }
            });
        }
    }, []);

    useEffect(() => {
        console.log("📋 [UI_OPS] Registering COMPLETE UI operations...");

        // Load composed functions
        functionComposer.loadFromStorage().then(() => {
            console.log("✅ [UI_OPS] Composed functions loaded");
        });

        // ==================== THEME OPERATIONS ====================
        uiRegistry.register({
            id: "toggle_theme",
            type: "toggle",
            label: "Toggle Dark Mode",
            description: "Switch between light and dark theme",
            execute: () => {
                const current = useSettingsStore.getState().theme;
                const newTheme = current === "dark" ? "light" : "dark";
                useSettingsStore.getState().updateSettings({ theme: newTheme });
                console.log("🌓 [UI_OPS] Toggled theme to:", newTheme);
            },
            metadata: {
                category: "settings",
                priority: 1,
                keywords: ["theme", "dark", "light", "mode", "toggle"],
            },
        });

        uiRegistry.register({
            id: "set_theme",
            type: "action",
            label: "Set Theme",
            description: "Set specific theme (light or dark)",
            parameters: [
                { name: "theme", type: "enum", enum: ["light", "dark"], required: true, description: "Theme to set (light or dark)" },
            ],
            execute: (params: any) => {
                useSettingsStore.getState().updateSettings({ theme: params.theme });
                console.log("🌓 [UI_OPS] Set theme to:", params.theme);
            },
            metadata: { category: "settings" },
        });

        uiRegistry.register({
            id: "toggle_sidebar",
            type: "toggle",
            label: "Toggle Sidebar",
            description: "Toggle the main navigation sidebar visibility",
            execute: () => {
                const isMobile = window.innerWidth < 1024;
                if (isMobile) {
                    const current = useMailStore.getState().isMobileMenuOpen;
                    useMailStore.getState().setMobileMenuOpen(!current);
                } else {
                    const current = useSettingsStore.getState().isSidebarOpen;
                    useSettingsStore.getState().updateSettings({ isSidebarOpen: !current });
                }
            },
            metadata: { category: "layout", keywords: ["sidebar", "menu", "navigation"] },
        });

        uiRegistry.register({
            id: "set_sidebar",
            type: "action",
            label: "Set Sidebar Visibility",
            description: "Show or hide the sidebar",
            parameters: [
                { name: "visible", type: "boolean", description: "True to show, false to hide", required: true },
            ],
            execute: (params: any) => {
                const isMobile = window.innerWidth < 1024;
                if (isMobile) {
                    useMailStore.getState().setMobileMenuOpen(params.visible);
                } else {
                    useSettingsStore.getState().updateSettings({ isSidebarOpen: params.visible });
                }
            },
            metadata: { category: "layout" },
        });

        uiRegistry.register({
            id: "toggle_assistant",
            type: "toggle",
            label: "Toggle Assistant",
            description: "Toggle the AI Assistant sidebar visibility",
            execute: () => {
                const current = useSettingsStore.getState().showAssistant;
                useSettingsStore.getState().updateSettings({ showAssistant: !current });
            },
            metadata: { category: "layout", keywords: ["assistant", "copilot", "ai"] },
        });

        // ==================== NAVIGATION ====================
        uiRegistry.register({
            id: "navigate_inbox",
            type: "navigation",
            label: "Go to Inbox",
            description: "Navigate to inbox view",
            execute: () => store.setFolder("inbox"),
            metadata: { category: "navigation", keywords: ["inbox"] },
        });

        uiRegistry.register({
            id: "navigate_sent",
            type: "navigation",
            label: "Go to Sent",
            description: "Navigate to sent emails",
            execute: () => store.setFolder("sent"),
            metadata: { category: "navigation", keywords: ["sent"] },
        });

        uiRegistry.register({
            id: "navigate_starred",
            type: "navigation",
            label: "Go to Starred",
            description: "Navigate to starred emails",
            execute: () => store.setFolder("starred"),
            metadata: { category: "navigation", keywords: ["starred"] },
        });

        uiRegistry.register({
            id: "navigate_drafts",
            type: "navigation",
            label: "Go to Drafts",
            description: "Navigate to drafts",
            execute: () => store.setFolder("drafts"),
            metadata: { category: "navigation", keywords: ["drafts"] },
        });

        uiRegistry.register({
            id: "navigate_trash",
            type: "navigation",
            label: "Go to Trash",
            description: "Navigate to trash/deleted emails",
            execute: () => store.setFolder("trash"),
            metadata: { category: "navigation", keywords: ["trash", "deleted"] },
        });

        uiRegistry.register({
            id: "navigate_settings",
            type: "navigation",
            label: "Go to Settings",
            description: "Open settings page",
            execute: () => router.push("/mail/settings"),
            metadata: { category: "navigation", keywords: ["settings", "preferences"] },
        });

        uiRegistry.register({
            id: "go_back_to_list",
            type: "navigation",
            label: "Go Back to List",
            description: "Close current email and return to list view",
            execute: () => store.setCurrentThread(null),
            metadata: { category: "navigation", keywords: ["back", "close", "list"] },
        });

        // ==================== SEARCH & FILTERS ====================
        uiRegistry.register({
            id: "search_emails",
            type: "filter",
            label: "Search Emails",
            description: "Search emails using Gmail query syntax",
            parameters: [
                { name: "query", type: "string", description: "Search query", required: true },
            ],
            execute: async (params: any) => {
                if (params?.query) await store.searchEmails(params.query);
            },
            metadata: { category: "search", keywords: ["search", "find", "filter"] },
        });

        uiRegistry.register({
            id: "clear_search",
            type: "action",
            label: "Clear Search",
            description: "Clear search and show all emails",
            execute: () => {
                if (store.clearSearch) {
                    store.clearSearch();
                } else {
                    useUIStore.getState().setSearchCommand({ query: "", timestamp: Date.now() });
                }
            },
            metadata: { category: "search" },
        });

        uiRegistry.register({
            id: "filter_unread",
            type: "filter",
            label: "Show Unread Only",
            description: "Filter to show only unread emails",
            execute: () => store.setFilter({ unread: true }),
            metadata: { category: "filters", keywords: ["unread"] },
        });

        uiRegistry.register({
            id: "filter_starred",
            type: "filter",
            label: "Show Starred Only",
            description: "Filter to show starred emails",
            execute: () => store.setFilter({ starred: true }),
            metadata: { category: "filters", keywords: ["starred"] },
        });

        uiRegistry.register({
            id: "filter_has_attachment",
            type: "filter",
            label: "Show Emails with Attachments",
            description: "Filter to show emails with attachments",
            execute: () => store.setFilter({ hasAttachment: true }),
            metadata: { category: "filters", keywords: ["attachment", "files"] },
        });

        uiRegistry.register({
            id: "clear_filters",
            type: "action",
            label: "Clear All Filters",
            description: "Remove all active filters",
            execute: () => store.clearFilters(),
            metadata: { category: "filters" },
        });

        // ==================== COMPOSE OPERATIONS ====================
        uiRegistry.register({
            id: "open_compose",
            type: "modal",
            label: "Open Compose",
            description: "Open email compose window",
            parameters: [
                { name: "to", type: "string", description: "Recipient email" },
                { name: "subject", type: "string", description: "Email subject" },
                { name: "body", type: "string", description: "Email body" },
            ],
            execute: (params: any) => store.openCompose(params || {}),
            metadata: { category: "compose", keywords: ["compose", "write", "new"] },
        });

        uiRegistry.register({
            id: "close_compose",
            type: "action",
            label: "Close Compose",
            description: "Close compose window",
            execute: () => store.setComposeOpen(false),
            metadata: { category: "compose" },
        });

        uiRegistry.register({
            id: "compose_set_recipient",
            type: "input",
            label: "Set Recipient",
            description: "Set the To field in compose",
            parameters: [
                { name: "email", type: "string", description: "Recipient email", required: true },
            ],
            execute: (params: any) => {
                const current = store.composeDraft || {};
                store.openCompose({ ...current, to: params.email });
            },
            metadata: { category: "compose" },
        });

        uiRegistry.register({
            id: "compose_set_subject",
            type: "input",
            label: "Set Subject",
            description: "Set the subject line in compose",
            parameters: [
                { name: "subject", type: "string", description: "Email subject", required: true },
            ],
            execute: (params: any) => {
                const current = store.composeDraft || {};
                store.openCompose({ ...current, subject: params.subject });
            },
            metadata: { category: "compose" },
        });

        uiRegistry.register({
            id: "compose_set_body",
            type: "input",
            label: "Set Body",
            description: "Set the email body in compose",
            parameters: [
                { name: "body", type: "string", description: "Email body", required: true },
            ],
            execute: (params: any) => {
                const current = store.composeDraft || {};
                store.openCompose({ ...current, body: params.body });
            },
            metadata: { category: "compose" },
        });

        uiRegistry.register({
            id: "compose_add_cc",
            type: "input",
            label: "Add CC",
            description: "Add CC recipients",
            parameters: [
                { name: "email", type: "string", description: "CC email", required: true },
            ],
            execute: (params: any) => {
                // @ts-ignore
                const current = store.composeDraft || {};
                // @ts-ignore
                store.openCompose({ ...current, cc: params.email });
            },
            metadata: { category: "compose" },
        });

        uiRegistry.register({
            id: "compose_add_bcc",
            type: "input",
            label: "Add BCC",
            description: "Add BCC recipients",
            parameters: [
                { name: "email", type: "string", description: "BCC email", required: true },
            ],
            execute: (params: any) => {
                // @ts-ignore
                const current = store.composeDraft || {};
                // @ts-ignore
                store.openCompose({ ...current, bcc: params.email });
            },
            metadata: { category: "compose" },
        });

        uiRegistry.register({
            id: "send_email",
            type: "action",
            label: "Send Email",
            description: "Send the currently composed email",
            execute: async () => {
                await store.sendEmail?.();
            },
            metadata: { category: "compose", keywords: ["send", "submit"] },
        });

        // ==================== EMAIL ACTIONS ====================
        uiRegistry.register({
            id: "open_thread",
            type: "action",
            label: "Open Email",
            description: "Open a specific email thread",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID", required: true },
            ],
            execute: (params: any) => {
                const thread = store.emails.find((e: any) => e.id === params.threadId);
                if (thread) store.setCurrentThread(thread);
            },
            metadata: { category: "email", keywords: ["open", "view", "read"] },
        });

        uiRegistry.register({
            id: "close_thread",
            type: "action",
            label: "Close Email",
            description: "Close currently open email",
            execute: () => store.setCurrentThread(null),
            metadata: { category: "email", keywords: ["close", "back"] },
        });

        uiRegistry.register({
            id: "reply_to_email",
            type: "action",
            label: "Reply to Email",
            description: "Open compose to reply to current email",
            execute: () => {
                const current = store.currentThread;
                if (current) {
                    store.openCompose({
                        to: current.lastMessage?.from || "",
                        subject: `Re: ${current.subject}`,
                        threadId: current.id,
                    });
                }
            },
            metadata: { category: "email", keywords: ["reply", "respond"] },
        });

        uiRegistry.register({
            id: "reply_all",
            type: "action",
            label: "Reply All",
            description: "Reply to all recipients",
            execute: () => {
                const current = store.currentThread;
                if (current) {
                    store.openCompose({
                        to: current.lastMessage?.from || "",
                        // @ts-ignore
                        cc: current.lastMessage?.cc || "",
                        subject: `Re: ${current.subject}`,
                        threadId: current.id,
                    });
                }
            },
            metadata: { category: "email", keywords: ["reply", "all"] },
        });

        uiRegistry.register({
            id: "forward_email",
            type: "action",
            label: "Forward Email",
            description: "Forward current email",
            execute: () => {
                const current = store.currentThread;
                if (current) {
                    store.openCompose({
                        subject: `Fwd: ${current.subject}`,
                        body: `\n\n--- Forwarded Message ---\nFrom: ${current.lastMessage?.from}\nSubject: ${current.subject}\n\n${current.snippet}`,
                        threadId: current.id,
                    });
                }
            },
            metadata: { category: "email", keywords: ["forward", "fwd"] },
        });

        uiRegistry.register({
            id: "star_email",
            type: "action",
            label: "Star Email",
            description: "Add star to email",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.starThread?.(threadId);
            },
            metadata: { category: "email", keywords: ["star", "favorite", "important"] },
        });

        uiRegistry.register({
            id: "unstar_email",
            type: "action",
            label: "Unstar Email",
            description: "Remove star from email",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.unstarThread?.(threadId);
            },
            metadata: { category: "email", keywords: ["unstar", "remove star"] },
        });

        uiRegistry.register({
            id: "mark_as_read",
            type: "action",
            label: "Mark as Read",
            description: "Mark email as read",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.markAsRead?.(threadId);
            },
            metadata: { category: "email", keywords: ["read", "mark"] },
        });

        uiRegistry.register({
            id: "mark_as_unread",
            type: "action",
            label: "Mark as Unread",
            description: "Mark email as unread",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.markAsUnread?.(threadId);
            },
            metadata: { category: "email", keywords: ["unread", "mark"] },
        });

        uiRegistry.register({
            id: "archive_email",
            type: "action",
            label: "Archive Email",
            description: "Archive email (remove from inbox)",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.archiveThread?.(threadId);
            },
            metadata: { category: "email", keywords: ["archive", "remove"] },
        });

        uiRegistry.register({
            id: "delete_email",
            type: "action",
            label: "Delete Email",
            description: "Move email to trash",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.deleteThread?.(threadId);
            },
            metadata: { category: "email", keywords: ["delete", "trash", "remove"] },
        });

        uiRegistry.register({
            id: "move_to_spam",
            type: "action",
            label: "Mark as Spam",
            description: "Move email to spam",
            parameters: [
                { name: "threadId", type: "string", description: "Thread ID (optional)" },
            ],
            execute: async (params: any) => {
                const threadId = params?.threadId || store.currentThread?.id;
                if (threadId) await store.markAsSpam?.(threadId);
            },
            metadata: { category: "email", keywords: ["spam", "junk"] },
        });

        // ==================== GENERAL ACTIONS ====================
        uiRegistry.register({
            id: "refresh_inbox",
            type: "action",
            label: "Refresh Inbox",
            description: "Reload emails from server",
            execute: async () => {
                await store.fetchThreads();
            },
            metadata: { category: "actions", keywords: ["refresh", "reload", "sync"] },
        });

        uiRegistry.register({
            id: "sync_now",
            type: "action",
            label: "Sync Now",
            description: "Force sync with Gmail",
            execute: async () => {
                await store.syncNow?.();
            },
            metadata: { category: "actions", keywords: ["sync", "update"] },
        });

        uiRegistry.register({
            id: "select_all_emails",
            type: "action",
            label: "Select All Emails",
            description: "Select all emails in current view",
            execute: () => {
                store.selectAll?.();
            },
            metadata: { category: "actions", keywords: ["select", "all"] },
        });

        uiRegistry.register({
            id: "deselect_all",
            type: "action",
            label: "Deselect All",
            description: "Deselect all selected emails",
            execute: () => {
                store.deselectAll?.();
            },
            metadata: { category: "actions" },
        });

        // ==================== SORTING ====================
        uiRegistry.register({
            id: "sort_by_date_newest",
            type: "action",
            label: "Sort by Newest First",
            description: "Sort emails by date (newest first)",
            execute: () => {
                store.setSortOrder?.("date_desc");
            },
            metadata: { category: "sorting", keywords: ["sort", "newest", "recent"] },
        });

        uiRegistry.register({
            id: "sort_by_date_oldest",
            type: "action",
            label: "Sort by Oldest First",
            description: "Sort emails by date (oldest first)",
            execute: () => {
                store.setSortOrder?.("date_asc");
            },
            metadata: { category: "sorting", keywords: ["sort", "oldest"] },
        });

        uiRegistry.register({
            id: "sort_by_sender",
            type: "action",
            label: "Sort by Sender",
            description: "Sort emails by sender name",
            execute: () => {
                store.setSortOrder?.("sender");
            },
            metadata: { category: "sorting", keywords: ["sort", "sender", "from"] },
        });

        uiRegistry.register({
            id: "sort_by_subject",
            type: "action",
            label: "Sort by Subject",
            description: "Sort emails by subject",
            execute: () => {
                store.setSortOrder?.("subject");
            },
            metadata: { category: "sorting", keywords: ["sort", "subject"] },
        });

        // ==================== SETTINGS ====================
        uiRegistry.register({
            id: "change_ai_provider",
            type: "action",
            label: "Change AI Provider",
            description: "Switch AI provider (ollama, openai, etc.)",
            parameters: [
                {
                    name: "provider",
                    type: "enum",
                    enum: ["ollama", "openai", "openrouter"],
                    required: true,
                    description: "AI provider to switch to"
                },
            ],
            execute: (params: any) => {
                store.updateSettings?.({ aiProvider: params.provider });
            },
            metadata: { category: "settings" },
        });

        uiRegistry.register({
            id: "enable_keyboard_shortcuts",
            type: "toggle",
            label: "Enable Keyboard Shortcuts",
            description: "Toggle keyboard shortcuts on/off",
            execute: () => {
                // @ts-ignore
                const current = store.settings?.keyboardShortcuts ?? true;
                store.updateSettings?.({ keyboardShortcuts: !current });
            },
            metadata: { category: "settings" },
        });

        const registeredCount = uiRegistry.getAll().length;
        console.log(`✅ [UI_OPS] Registered ${registeredCount} operations`);
        console.log("📊 [UI_OPS] Categories:", {
            theme: uiRegistry.getByCategory("settings").length,
            navigation: uiRegistry.getByCategory("navigation").length,
            search: uiRegistry.getByCategory("search").length,
            compose: uiRegistry.getByCategory("compose").length,
            email: uiRegistry.getByCategory("email").length,
            actions: uiRegistry.getByCategory("actions").length,
            filters: uiRegistry.getByCategory("filters").length,
            sorting: uiRegistry.getByCategory("sorting").length,
        });

        return () => {
            console.log("🧹 [UI_OPS] Cleanup");
        };
    }, [store, router]);

    return <>{children}</>;
}
