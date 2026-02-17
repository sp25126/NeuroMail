"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Minimize2, Maximize2 } from "lucide-react";
import { useMailStore } from "@/store/useMailStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { uiRegistry } from "@/lib/ui-registry";
import { toast } from "sonner";
import { functionComposer } from "@/agent/function-composer";

export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

export function AssistantPanel() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const store = useMailStore.getState();

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input,
            timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            // ⚡ CRITICAL: Serialize UI registry tools for the server
            const registeredTools = uiRegistry.getAll().map((op) => ({
                id: op.id,
                type: op.type,
                label: op.label,
                description: op.description,
                parameters: op.parameters || [],
                metadata: op.metadata || {},
                // NOTE: `execute` is a function and cannot be serialized
            }));

            console.log("📤 [ASSISTANT] Sending request:", {
                message: input,
                view: store.view,
                emailsCount: store.emails.length,
                registeredToolsCount: registeredTools.length,
                toolIds: registeredTools.map((t) => t.id),
            });

            const response = await fetch("/api/agent/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage.content,
                    sessionId: "session-123",
                    appState: {
                        view: store.view,
                        filters: store.activeFilter || {},
                    },
                    clientState: {
                        theme: useSettingsStore.getState().theme,
                        isSidebarOpen: window.innerWidth < 1024 ? store.isMobileMenuOpen : useSettingsStore.getState().isSidebarOpen,
                        isComposeOpen: store.isComposeOpen,
                        activeModals: store.isComposeOpen ? ["compose"] : [],
                        viewport: {
                            width: window.innerWidth,
                            height: window.innerHeight,
                            isMobile: window.innerWidth < 1024
                        }
                    },
                    currentThread: store.currentThread,
                    recentThreads: store.emails.slice(0, 5),
                    availableTools: registeredTools, // ⚡ SEND TOOLS TO SERVER
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            console.log("📥 [ASSISTANT] Full response:", data);
            console.log("🔍 [ASSISTANT] Actions received:", data.actions);

            // Add assistant message
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.assistantMessage || "Done.",
                timestamp: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, assistantMessage]);

            // ⚡⚡⚡ CRITICAL: Execute actions ⚡⚡⚡
            if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
                console.log("⚡⚡⚡ [ASSISTANT] Executing", data.actions.length, "actions");

                for (let i = 0; i < data.actions.length; i++) {
                    const action = data.actions[i];
                    console.log(`🎬 [ASSISTANT] Action ${i + 1}/${data.actions.length}:`, action);

                    await executeAction(action);
                }

                console.log("✅ [ASSISTANT] All actions executed");
            } else {
                console.warn("⚠️ [ASSISTANT] No actions to execute. Response:", data);
            }
        } catch (error: any) {
            console.error("❌ [ASSISTANT] Request failed:", error);

            const errorMessage: Message = {
                id: (Date.now() + 2).toString(),
                role: "assistant",
                content: "I encountered an error processing your request.",
                timestamp: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, errorMessage]);
            toast.error("Request failed");
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Execute a single action
     */
    const executeAction = async (action: any) => {
        console.log("🎬🎬🎬 [ACTION] Executing action:", JSON.stringify(action, null, 2));

        const store = useMailStore.getState();

        try {
            switch (action.type) {
                case "TOGGLE": {
                    console.log("🔘 [ACTION] Toggle operation:", action.operationId);
                    await uiRegistry.execute(action.operationId, action.args || action);
                    toast.success("Done");
                    break;
                }

                case "NAVIGATE": {
                    console.log("🧭 [ACTION] Navigate to:", action.view || action.operationId);

                    const viewMap: Record<string, any> = {
                        navigate_inbox: "inbox",
                        navigate_sent: "sent",
                        navigate_starred: "starred",
                        navigate_drafts: "drafts",
                    };

                    const targetView = action.view || viewMap[action.operationId] || "inbox";

                    store.setFolder(targetView);
                    toast.success(`Switched to ${targetView}`);
                    console.log("✅ [ACTION] Navigation complete");
                    break;
                }

                case "SEARCH": {
                    console.log("🔍 [ACTION] Searching with query:", action.query);

                    if (!action.query || action.query === "undefined") {
                        console.error("❌ [ACTION] Invalid search query");
                        toast.error("Invalid search query");
                        return;
                    }

                    toast.loading("Searching...", { id: "search" });

                    const results = await store.searchEmails(action.query);

                    toast.success(`Found ${results.length} ${results.length === 1 ? "email" : "emails"}`, {
                        id: "search",
                    });

                    console.log("✅ [ACTION] Search complete:", results.length, "results");
                    break;
                }

                case "OPEN_THREAD": {
                    console.log("📧 [ACTION] Opening thread:", action.threadId);

                    if (!action.threadId) {
                        console.error("❌ [ACTION] No threadId provided");
                        toast.error("No email ID provided");
                        return;
                    }

                    const thread = store.emails.find((e: any) => e.id === action.threadId);

                    if (thread) {
                        store.setCurrentThread(thread);
                        toast.success("Email opened");
                        console.log("✅ [ACTION] Thread opened");
                    } else {
                        console.error("❌ [ACTION] Thread not found:", action.threadId);
                        toast.error("Email not found");
                    }
                    break;
                }

                case "OPEN_COMPOSE": {
                    console.log("✉️ [ACTION] Opening compose:", {
                        to: action.to,
                        subjectLength: action.subject?.length || 0,
                        bodyLength: action.body?.length || 0,
                    });

                    store.openCompose({
                        to: action.to || "",
                        subject: action.subject || "",
                        body: action.body || "",
                        threadId: action.threadId,
                    });

                    toast.success("Compose opened");
                    console.log("✅ [ACTION] Compose opened");
                    break;
                }

                case "FILTER": {
                    console.log("🔎 [ACTION] Applying filter:", action.operationId);

                    // Apply specific filter based on operationId
                    if (action.operationId === "filter_unread") {
                        store.setActiveFilter({ label: "Unread", query: "is:unread" });
                        toast.success("Showing unread only");
                    } else if (action.operationId === "filter_starred") {
                        store.setActiveFilter({ label: "Starred", query: "is:starred" });
                        toast.success("Showing starred only");
                    }

                    console.log("✅ [ACTION] Filter applied");
                    break;
                }

                case "EXECUTE_JS": {
                    console.log("⚡ [ACTION] Executing God Mode JS");
                    try {
                        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                        const execFunc = new AsyncFunction(
                            "uiRegistry",
                            "store",
                            "document",
                            "window",
                            "console",
                            action.code
                        );
                        await execFunc(uiRegistry, store, document, window, console);
                        toast.success("JS Executed");
                    } catch (err: any) {
                        console.error("❌ [ACTION] JS Execution failed:", err);
                        toast.error(`JS Error: ${err.message}`);
                    }
                    break;
                }

                case "REGISTER_TOOL": {
                    console.log("🛠️ [ACTION] Registering autonomous tool:", action.toolId);
                    const func: any = {
                        id: `autonomous_${Date.now()}`,
                        name: action.toolId,
                        description: action.toolDescription,
                        code: action.toolJsCode,
                        parameters: action.toolParameters || [],
                        createdAt: new Date().toISOString(),
                        usageCount: 0,
                    };
                    functionComposer.registerComposedFunction(func);
                    await functionComposer.saveToStorage();
                    toast.success(`Tool '${action.toolId}' registered`);
                    break;
                }

                case "ACTION": {
                    console.log("⚙️ [ACTION] Generic action:", action.operationId);

                    // Handle specific actions
                    if (action.operationId === "refresh_inbox") {
                        toast.loading("Refreshing...", { id: "refresh" });
                        await store.fetchThreads();
                        toast.success("Inbox refreshed", { id: "refresh" });
                    } else if (action.operationId === "clear_filters") {
                        store.clearFilter();
                        toast.success("Filters cleared");
                    } else if (action.operationId === "close_thread") {
                        store.setCurrentThread(null);
                        toast.success("Email closed");
                    }

                    console.log("✅ [ACTION] Action complete");
                    break;
                }

                case "UI_OPERATION": {
                    console.log("🔧 [ACTION] Executing UI operation via registry:", action.operationId);
                    const success = await uiRegistry.execute(action.operationId, action.args || action);
                    if (success) {
                        toast.success("Done");
                    } else {
                        toast.error("Operation not found: " + action.operationId);
                    }
                    break;
                }

                case "MODAL": {
                    console.log("🪟 [ACTION] Modal operation:", action.operationId);
                    toast.success("Done");
                    break;
                }

                case "FUNCTION_CREATED": {
                    console.log("✨ [ACTION] Function created:", action.functionName);

                    if (action.functionDefinition) {
                        try {
                            // Register and save on client
                            functionComposer.registerComposedFunction(action.functionDefinition);
                            await functionComposer.saveToStorage();
                            toast.success(`Created function: ${action.functionName}`);
                        } catch (e) {
                            console.error("Failed to save function:", e);
                            toast.error("Failed to save function");
                        }
                    } else {
                        toast.error("Function definition missing");
                    }
                    break;
                }

                case "FUNCTION_DELETED": {
                    console.log("🗑️ [ACTION] Function deleted");
                    toast.success("Function deleted");
                    // Refetch/reload if needed, but local composer should already be updated by delete tool if we ran it on client...
                    // Wait, deleteFunction tool ran on server? 
                    // If deleteFunction ran on server, it deleted from server memory.
                    // We need to delete from client memory too.
                    // The action payload doesn't have the ID, just success.
                    // Actually, let's just create a deleteFunction tool for client side execution?
                    // Or simply reload?
                    // For now, let's assume the server told us it's deleted, but we need to delete it locally.
                    // The server "deleteFunction" tool doesn't know client storage.
                    // It seems "deleteFunction" should ALSO be a client-side action?
                    // The orchestrator `executeToolCall` for `deleteFunction` returns `{ action: "FUNCTION_DELETED" }`.
                    // But it doesn't pass the name back clearly for us to delete locally if it wasn't in the arguments?
                    // `action` object spreads `...toolCall.arguments`, so `name` should be there.

                    if (action.name) {
                        const func = functionComposer.getFunctionByName(action.name);
                        if (func) {
                            functionComposer.deleteFunction(func.id);
                            await functionComposer.saveToStorage();
                        }
                    }
                    break;
                }

                default:
                    console.warn("⚠️ [ACTION] Unknown action type:", action.type);
                    toast.info("Action completed");
            }
        } catch (error: any) {
            console.error("❌ [ACTION] Execution failed:", error);
            toast.error("Action failed: " + error.message);
        }
    };

    return (
        <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Copilot</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Running on local AI</p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence>
                    {messages.map((message) => (
                        <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === "user"
                                    ? "bg-blue-500 text-white"
                                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-start"
                    >
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                        </div>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Copilot..."
                        disabled={isLoading}
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
