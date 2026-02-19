"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Minimize2, Maximize2 } from "lucide-react";
import { useMailStore } from "@/store/useMailStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { createNeuromailSDK } from "@/agent/sdk";
import { toast } from "sonner";
import { functionComposer } from "@/agent/function-composer";
import { useAIChangesStore } from "@/store/useAIChangesStore";
import { useUILoggerStore } from "@/store/useUILoggerStore";
import { UILogger } from "./UILogger";
import { DOMQueryEngine } from "@/agent/dom-query";
import { domScanner } from "@/agent/sandbox/scanner";
import { uiRegistry } from "@/agent/ui-registry/registry";
import { executionEngine } from "@/agent/sandbox/executor";
import { executeAiWorkflow } from "@/agent/sandbox/runner";
import { ExecutionSandbox } from "@/agent/sandbox/execution-sandbox";
import { DEFAULT_POLICY } from "@/agent/sandbox/sandbox-types";
import { AIChangesPanel } from "./AIChangesPanel";
import { Terminal, ChevronUp, ChevronDown } from "lucide-react";

declare global {
    interface Window {
        ai: {
            click: (id: string) => void;
            type: (id: string, text: string) => void;
            toast: (msg: string) => void;
            setStyle: (id: string, styles: Partial<CSSStyleDeclaration>) => void;
            navigate: (view: any) => void;
        }
    }
}

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
    const [showLogger, setShowLogger] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const addLog = useUILoggerStore(state => state.addLog);

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
            // Serialize UI registry tools for the server
            const registeredTools = uiRegistry.getAllOperations().map((op) => ({
                id: op.id,
                name: op.name,
                description: op.description,
                category: op.category,
                parameters: op.parameters
            }));

            // Get standard screen context
            const screenContext = JSON.stringify(domScanner.scan());

            const sdk = createNeuromailSDK();

            console.log("📤 [ASSISTANT] Sending request:", {
                message: input,
                view: store.view,
                registeredToolsCount: registeredTools.length,
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
                        isSidebarOpen: useSettingsStore.getState().isSidebarOpen,
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
                    availableTools: [], // PURGED: User requested to remove client-side tool noise (48+ tools)
                    aiProvider: useSettingsStore.getState().aiProvider,
                    aiModel: useSettingsStore.getState().aiModel,
                    aiApiKey: useSettingsStore.getState().aiApiKey,
                    colabUrl: useSettingsStore.getState().colabUrl,
                    screenContext, // Inject DOM map
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // 1. Execute actions FIRST
            if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
                for (const action of data.actions) {
                    await executeAction(action);
                }
            }

            // 2. Add assistant message ONLY AFTER actions complete
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.assistantMessage || "Done.",
                timestamp: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
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
        addLog({
            type: 'tool',
            message: `Invoking action: ${action.type}`,
            details: action
        });
        console.log("🎬🎬🎬 [ACTION] Executing action:", JSON.stringify(action, null, 2));

        const store = useMailStore.getState();

        try {
            switch (action.type) {
                case "set_theme": {
                    const { theme } = action;
                    console.log("🌓 [ACTION] Setting theme:", theme);
                    const settings = useSettingsStore.getState();
                    settings.updateSettings({ theme });
                    addLog({
                        type: 'success',
                        message: `Theme set to ${theme}`,
                    });
                    toast.success(`Theme set to ${theme}`);
                    break;
                }

                case "toggle_sidebar": {
                    console.log("↔️ [ACTION] Toggling sidebar");
                    const settings = useSettingsStore.getState();
                    settings.updateSettings({ isSidebarOpen: !settings.isSidebarOpen });
                    addLog({
                        type: 'success',
                        message: 'Sidebar toggled',
                    });
                    break;
                }

                case "ui_navigate": {
                    const { view, threadId } = action;
                    console.log("📍 [ACTION] Navigating to:", view, threadId);
                    if (view === 'settings') {
                        store.setView('settings');
                    } else if (view === 'compose') {
                        store.openCompose();
                    } else if (view === 'detail' && threadId) {
                        store.setSelectedThread(threadId);
                    } else if (['inbox', 'sent', 'archive'].includes(view)) {
                        store.setFolder(view === 'archive' ? 'trash' : view);
                    }
                    addLog({
                        type: 'success',
                        message: `Navigated to ${view}${threadId ? ': ' + threadId : ''}`,
                    });
                    break;
                }

                case "TOGGLE": {
                    console.log("🔘 [ACTION] Toggle operation:", action.operationId);
                    const op = uiRegistry.getOperation(action.id);
                    if (op) {
                        const res = await fetch(op.endpoint, {
                            method: op.method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(action.params)
                        });
                        const result = await res.json();
                        toast.success("Done");
                        return result;
                    }
                    toast.error("Operation not found: " + action.id);
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
                    break;
                }

                case "SEARCH": {
                    console.log("🔍 [ACTION] Searching with query:", action.query);
                    if (!action.query || action.query === "undefined") {
                        toast.error("Invalid search query");
                        return;
                    }
                    toast.loading("Searching...", { id: "search" });
                    const results = await store.searchEmails(action.query);
                    toast.success(`Found ${results.length} results`, { id: "search" });
                    break;
                }

                case "OPEN_THREAD": {
                    console.log("📧 [ACTION] Opening thread:", action.threadId);
                    if (!action.threadId) {
                        toast.error("No email ID provided");
                        return;
                    }
                    const thread = store.emails.find((e: any) => e.id === action.threadId);
                    if (thread) {
                        store.setCurrentThread(thread);
                        toast.success("Email opened");
                    } else {
                        toast.error("Email not found");
                    }
                    break;
                }

                case "OPEN_COMPOSE": {
                    console.log("✉️ [ACTION] Opening compose:", action.to);
                    store.openCompose({
                        to: action.to || "",
                        subject: action.subject || "",
                        body: action.body || "",
                        threadId: action.threadId,
                    });
                    toast.success("Compose opened");
                    break;
                }

                case "FILTER": {
                    console.log("🔎 [ACTION] Applying filter:", action.operationId);
                    if (action.operationId === "filter_unread") {
                        store.setActiveFilter({ label: "Unread", query: "is:unread" });
                        toast.success("Showing unread only");
                    } else if (action.operationId === "filter_starred") {
                        store.setActiveFilter({ label: "Starred", query: "is:starred" });
                        toast.success("Showing starred only");
                    }
                    break;
                }

                case "generate_workflow": {
                    const { code, workflow_name } = action.input || action;
                    console.log(`⚙️ [ACTION] Executing Workflow: ${workflow_name}`);

                    try {
                        const sdk = createNeuromailSDK();
                        addLog({
                            type: 'info',
                            message: `Fetching data for workflow: ${workflow_name}...`
                        });
                        await executeAiWorkflow(code, sdk);

                        toast.success(`Workflow "${workflow_name}" completed.`);
                        addLog({
                            type: 'success',
                            message: `Workflow "${workflow_name}" executed successfully.`
                        });
                    } catch (e: any) {
                        console.error("❌ Workflow Failed:", e);
                        toast.error(`Workflow Failed: ${e.message}`);
                        addLog({
                            type: 'error',
                            message: `Workflow "${workflow_name}" failed: ${e.message}`
                        });
                    }
                    break;
                }

                case "REGISTER_TOOL": {
                    const { toolId, toolDescription, toolJsCode, toolParameters } = action;
                    console.log("🛠️ [ACTION] Registering autonomous tool:", toolId);

                    const func: any = {
                        id: `autonomous_${Date.now()}`,
                        name: toolId,
                        description: toolDescription,
                        code: toolJsCode,
                        parameters: toolParameters || [],
                        createdAt: new Date().toISOString(),
                        usageCount: 0,
                    };

                    functionComposer.registerComposedFunction(func);
                    await functionComposer.saveToStorage();

                    toast.success(`Skill Acquired: ${toolId}`, {
                        description: `Capability: ${toolDescription}`,
                        duration: 5000,
                        icon: "💡"
                    });
                    break;
                }

                case "ACTION": {
                    console.log("⚙️ [ACTION] Generic action:", action.operationId);
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
                    break;
                }

                case "UI_OPERATION": {
                    console.log("🔧 [ACTION] Executing UI operation via registry:", action.operationId);
                    const op = uiRegistry.getOperation(action.operationId);
                    if (op) {
                        const res = await fetch(op.endpoint, {
                            method: op.method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(action.args || action)
                        });
                        if (res.ok) {
                            toast.success("Done");
                        } else {
                            toast.error("Operation failed");
                        }
                    } else {
                        toast.error("Operation not found: " + action.operationId);
                    }
                    break;
                }

                case "FUNCTION_CREATED": {
                    console.log("✨ [ACTION] Function created:", action.functionName);
                    if (action.functionDefinition) {
                        try {
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
                    if (action.name) {
                        const func = functionComposer.getFunctionByName(action.name);
                        if (func) {
                            functionComposer.deleteFunction(func.id);
                            await functionComposer.saveToStorage();
                            toast.success("Function deleted");
                        }
                    }
                    break;
                }

                case "QUERY_DOM": {
                    console.log("🔍 [ACTION] Querying DOM:", action.action, action.selector);
                    let result;
                    if (action.action === "structure") {
                        result = DOMQueryEngine.getPageStructure();
                    } else if (action.action === "find") {
                        result = DOMQueryEngine.findElements(action.selector || "*");
                    } else {
                        result = { error: "Unknown query action" };
                    }

                    // Send feedback to AI
                    const feedback = `DOM Query Result (${action.action}): ${JSON.stringify(result, null, 2)}`;
                    console.log("📡 [ASSISTANT] Sending DOM query feedback back to AI");

                    // Simulate a silent turn by calling a internal handler or just toast for now
                    // In a production app, we would use a proper chat feedback loop
                    toast.success("DOM Query Complete", {
                        description: `Found ${Array.isArray(result) ? result.length : "page structure"}`
                    });

                    // OPTIONAL: Self-correction/Feedback loop
                    // We can append this to the chat as a system-like message
                    const systemMessage: Message = {
                        id: Date.now().toString(),
                        role: "assistant",
                        content: `Introspection Result: ${feedback.substring(0, 100)}...`,
                        timestamp: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, systemMessage]);
                    break;
                }

                case "EXECUTE_PLAN": {
                    console.log("📜 [ACTION] Executing AI Plan");
                    const { plan } = action; // Expects AIPlan object
                    if (!plan) {
                        toast.error("Missing AI Plan");
                        return;
                    }

                    // Import dynamically or use the imported instance
                    const { executionEngine: engine } = await import("@/agent/sandbox/executor");
                    await engine.executePlan(plan);
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
                        <p className="text-sm text-gray-500 dark:text-gray-400">Assistant Persona: Software Engineer</p>
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
                                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 shadow-sm"
                                    }`}
                            >
                                <p className="text-sm border-0 bg-transparent focus:ring-0 whitespace-pre-wrap">{message.content}</p>
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
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 shadow-sm">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Neural Trace Toggle & Panel */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <button
                    onClick={() => setShowLogger(!showLogger)}
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                >
                    <div className="flex items-center gap-2">
                        <Terminal className="w-3 h-3" />
                        <span>Neural Trace Log</span>
                    </div>
                    {showLogger ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </button>
                {showLogger && (
                    <div className="h-48 px-2 pb-2">
                        <UILogger />
                    </div>
                )}
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

            {/* AI Change History Panel */}
            <AIChangesPanel />
        </div>
    );
}
