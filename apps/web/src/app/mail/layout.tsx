"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/api-client";
import { uiRegistry } from "@/lib/ui-registry";
import { InboxView } from "@/components/mail/InboxView";
import { ThreadDetailView } from "@/components/mail/ThreadDetailView";
import { ComposeModal } from "@/components/mail/ComposeModal";
import { CopilotSidebar } from "@/components/mail/CopilotSidebar";
import { Sidebar } from "@/components/mail/Sidebar";
import { SettingsView } from "@/components/mail/SettingsView";
import { DashboardView } from "@/components/mail/DashboardView";
import { AlertsView } from "@/components/mail/AlertsView";
import { ReportsView } from "@/components/mail/ReportsView";
import OpsView from "@/components/mail/OpsView";
import MailboxSettingsPage from "@/app/trackflow/settings/mailboxes/page";
import TrackflowCopilotPage from "@/app/trackflow/copilot/page";
import { useMailStore } from "@/store/useMailStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal";
import { Bot, X, Sparkles, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { UIOperationsProvider } from "@/components/UIOperationsProvider";
import { MODULE_IDENTITY } from "@/config/module-identity";

export default function MailLayout({ children }: { children?: React.ReactNode }) {
    const { data: session } = useSession();
    const { view, isMobileMenuOpen, setMobileMenuOpen, fetchThreads } = useMailStore();
    const { showAssistant, isSidebarOpen, updateSettings } = useSettingsStore();

    // 1. Full-Stack Sync: Connect real email session to modernized backend
    useEffect(() => {
        const syncRealEmail = async () => {
            if (session?.user?.email) {
                console.log("🔗 [AUTH] Synchronizing session with backend...");
                
                const tenantId = session.user.email === "dev@neuromail.local"
                    ? "demo-tenant"
                    : `tenant-${session.user.email}`;
                const userId = session.user.email === "dev@neuromail.local"
                    ? "demo-admin"
                    : (session.user.id || `user-${session.user.email}`);
                
                // Update ApiClient context
                ApiClient.setAuth(tenantId, userId);
                
                try {
                    // Register/Update mailbox on backend with real or fallback developer token
                    await ApiClient.registerMailbox({
                        provider_type: "GMAIL",
                        email: session.user.email,
                        access_token: (session as any).accessToken || "dev-bypass-token",
                        refresh_token: (session as any).refreshToken || "dev-bypass-refresh-token",
                        tenant_id: tenantId,
                        user_id: userId
                    } as any);
                    console.log("✅ [AUTH] Backend synchronized with email.");
                } catch (error) {
                    console.error("❌ [AUTH] Failed to synchronize email with backend:", error);
                }
                
                // Refresh threads to show data
                fetchThreads();
            }
        };
        syncRealEmail();
    }, [session, fetchThreads]);

    const setShowAssistant = (show: boolean) => updateSettings({ showAssistant: show });
    const showMobileSidebar = isMobileMenuOpen;
    const setShowMobileSidebar = setMobileMenuOpen;
    const { isComposeOpen } = useMailStore();

    const { showShortcutsModal, setShowShortcutsModal } = useKeyboardShortcuts();

    return (
        <UIOperationsProvider>
            <div className="flex h-screen overflow-hidden bg-background">
                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                    {showMobileSidebar && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden"
                                onClick={() => setShowMobileSidebar(false)}
                            />
                            <motion.div
                                initial={{ x: "-100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "-100%" }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="fixed inset-y-0 left-0 z-[50] lg:hidden"
                            >
                                <Sidebar />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Sidebar - Desktop */}
                <div className={cn("hidden", isSidebarOpen ? "lg:block" : "")}>
                    <Sidebar />
                </div>

                {/* Mobile Top Bar */}
                <div className="fixed top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-xl border-b border-white/5 flex items-center px-4 z-30 lg:hidden">
                    <button
                        onClick={() => setShowMobileSidebar(true)}
                        className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground transition-colors mr-3"
                    >
                        <Menu size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                            <Sparkles size={14} className="text-white" />
                        </div>
                        <span className="font-bold text-sm text-foreground">{MODULE_IDENTITY.displayName}</span>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden relative pt-14 lg:pt-0">
                    {/* Mail View Content */}
                    <div className={cn(
                        "flex-1 flex flex-col transition-all duration-300 ease-in-out h-full overflow-hidden",
                        showAssistant ? "lg:mr-80 mr-0" : "mr-0"
                    )}>
                        <AnimatePresence mode="wait">
                            {view === "copilot" && (
                                <motion.div
                                    key="copilot"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <TrackflowCopilotPage />
                                </motion.div>
                            )}
                            {view === "dashboard" && (
                                <motion.div
                                    key="dashboard"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <DashboardView />
                                </motion.div>
                            )}
                            {view === "alerts" && (
                                <motion.div
                                    key="alerts"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <AlertsView />
                                </motion.div>
                            )}
                            {view === "reports" && (
                                <motion.div
                                    key="reports"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <ReportsView />
                                </motion.div>
                            )}
                            {view === "mailboxes" && (
                                <motion.div
                                    key="mailboxes"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <MailboxSettingsPage />
                                </motion.div>
                            )}
                            {view === "ops" && (
                                <motion.div
                                    key="ops"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <OpsView />
                                </motion.div>
                            )}
                            {view === "inbox" && (
                                <motion.div
                                    key="inbox"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <InboxView />
                                </motion.div>
                            )}
                            {view === "thread" && (
                                <motion.div
                                    key="thread"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <ThreadDetailView />
                                </motion.div>
                            )}
                            {view === "settings" && (
                                <motion.div
                                    key="settings"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className="h-full"
                                >
                                    <SettingsView />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {children}
                    </div>

                    {/* Assistant Panel (Copilot) - Right Side */}
                    <div
                        className={cn(
                            "fixed right-0 top-0 bottom-0 w-80 border-l border-white/5 bg-card/50 backdrop-blur-md z-40 transition-transform duration-300 ease-in-out",
                            "hidden lg:block",
                            showAssistant ? "translate-x-0" : "translate-x-full"
                        )}
                    >
                        <CopilotSidebar
                            isOpen={true}
                            onClose={() => setShowAssistant(false)}
                            providerName="Local AI"
                        />
                    </div>

                    {/* Toggle Assistant Button - Floating Premium Trigger */}
                    <motion.div
                        className={cn(
                            "fixed bottom-6 z-50 transition-all duration-300 ease-in-out",
                            showAssistant ? "lg:right-[21rem] right-6" : "right-6"
                        )}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <Button
                            size="lg"
                            className={cn(
                                "rounded-full w-14 h-14 shadow-2xl border border-white/10 group overflow-hidden",
                                showAssistant ? "bg-zinc-800 hover:bg-zinc-700" : "bg-primary hover:opacity-90"
                            )}
                            onClick={() => setShowAssistant(!showAssistant)}
                        >
                            <div className="relative w-full h-full flex items-center justify-center">
                                <AnimatePresence mode="wait">
                                    {showAssistant ? (
                                        <motion.div
                                            key="close"
                                            initial={{ rotate: -90, opacity: 0 }}
                                            animate={{ rotate: 0, opacity: 1 }}
                                            exit={{ rotate: 90, opacity: 0 }}
                                        >
                                            <X className="h-6 w-6 text-zinc-400 group-hover:text-white" />
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="open"
                                            initial={{ rotate: 90, opacity: 0 }}
                                            animate={{ rotate: 0, opacity: 1 }}
                                            exit={{ rotate: -90, opacity: 0 }}
                                            className="flex items-center gap-2"
                                        >
                                            <Bot className="h-6 w-6 text-white" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </Button>
                        {!showAssistant && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="absolute right-16 top-1/2 -translate-y-1/2 bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-xl whitespace-nowrap text-xs font-bold text-zinc-200 pointer-events-none shadow-xl"
                            >
                                <Sparkles size={12} className="inline mr-1 text-primary" />
                                ASK COPILOT
                            </motion.div>
                        )}
                    </motion.div>
                </div>

                {/* Modals - Managed globally */}
                <ComposeModal />
                <KeyboardShortcutsModal isOpen={showShortcutsModal} onClose={() => setShowShortcutsModal(false)} />
            </div>
        </UIOperationsProvider>
    );
}
