"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/mail/Sidebar"
import { ThreadList } from "@/components/mail/ThreadList"
import { ThreadDetail } from "@/components/mail/ThreadDetail"
import { CopilotSidebar } from "@/components/mail/CopilotSidebar"
import { ComposeModal } from "@/components/mail/ComposeModal"
import { LLMSettingsModal } from "@/components/mail/LLMSettingsModal"
import { Sparkles, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

import { useMailStore } from "@/store/useMailStore"
import { useQuery } from "@tanstack/react-query"
import { ThreadDetailView } from "@/components/mail/ThreadDetailView"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

async function fetchThreadDetail(id: string) {
    const res = await fetch(`/api/mail/threads/${id}`)
    if (!res.ok) throw new Error("Failed to fetch thread detail")
    return res.json()
}

interface HomeClientProps {
    defaultProvider?: string
}

export function HomeClient({ defaultProvider = "Local AI" }: HomeClientProps) {
    const [isCopilotOpen, setIsCopilotOpen] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const { selectedThreadId, setSelectedThread, setCurrentThread, view, setView, isComposeOpen, setComposeOpen } = useMailStore()

    // Initialize keyboard shortcuts
    useKeyboardShortcuts()

    // Responsive detection
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Real-Time Sync: Background Polling every 30s
    useEffect(() => {
        const refreshThreads = useMailStore.getState().refreshThreads
        const interval = setInterval(() => {
            console.log("⏱️ [SYNC] Triggering background refresh...")
            refreshThreads()
        }, 30000)

        return () => clearInterval(interval)
    }, [])

    const { data: thread } = useQuery({
        queryKey: ["thread", selectedThreadId],
        queryFn: async () => {
            const data = await fetchThreadDetail(selectedThreadId!);
            setCurrentThread(data);
            if (isMobile) setView('thread');
            return data;
        },
        enabled: !!selectedThreadId,
    })

    const threadContext = thread?.messages
        .map((m: any) => `From: ${m.from}\nContent: ${m.bodyText || m.body || ""}`)
        .join("\n\n---\n\n")

    return (
        <div className="flex h-[100dvh] w-full overflow-hidden bg-background">

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {isSidebarOpen && isMobile && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Navigation */}
            <motion.div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto h-full",
                    isMobile && !isSidebarOpen ? "-translate-x-full" : "translate-x-0"
                )}
                initial={false}
                animate={{ x: isMobile && !isSidebarOpen ? "-100%" : "0%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
                <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
            </motion.div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 relative h-full">

                {/* Mobile Header (Visible only on small screens) */}
                <div className="lg:hidden h-14 border-b border-white/5 flex items-center px-4 justify-between bg-background/50 backdrop-blur-md sticky top-0 z-40">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
                        <Menu size={20} />
                    </button>
                    <span className="font-bold text-sm tracking-widest uppercase text-primary/80">Neuromail</span>
                    <div className="w-8" /> {/* Spacer */}
                </div>

                <div className="flex-1 flex overflow-hidden relative">
                    {/* Thread List Pane */}
                    <motion.div
                        layout
                        className={cn(
                            "flex-none border-r border-white/5 h-full overflow-hidden flex flex-col bg-background/30",
                            isMobile && view === 'thread' ? "hidden" : "flex"
                        )}
                        initial={false}
                        animate={{
                            width: (!isMobile && !selectedThreadId) ? "100%" : (isMobile ? "100%" : "384px"),
                            opacity: 1,
                            backgroundColor: "rgba(var(--background), 0.7)"
                        }}
                        transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    >
                        <ThreadList />
                    </motion.div>

                    {/* Detail View Pane */}
                    <AnimatePresence mode="popLayout">
                        {(!isMobile || view === 'thread') && selectedThreadId && (
                            <motion.div
                                key="detail-view"
                                layout
                                className={cn(
                                    "flex-1 h-full overflow-hidden bg-background/50 relative",
                                    isMobile && view !== 'thread' ? "hidden" : "block"
                                )}
                                initial={isMobile ? { x: "100%" } : { opacity: 0, x: 20 }}
                                animate={isMobile ? { x: "0%" } : { opacity: 1, x: 0, backgroundColor: "rgba(var(--background), 0.85)" }}
                                exit={isMobile ? { x: "100%" } : { opacity: 0, x: 20 }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            >
                                <ThreadDetailView />

                                {/* Floating Copilot Trigger */}
                                {!isCopilotOpen && (
                                    <motion.button
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => setIsCopilotOpen(true)}
                                        className="absolute bottom-6 right-6 bg-primary text-primary-foreground p-4 rounded-full shadow-[0_0_20px_rgba(var(--primary)/0.3)] z-50 flex items-center gap-2 border border-white/10"
                                    >
                                        <Sparkles size={20} />
                                        <span className="text-sm font-bold pr-1 hidden sm:inline">Ask Copilot</span>
                                    </motion.button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Desktop Empty State (When no thread selected) */}
                    {!isMobile && !selectedThreadId && (
                        <div className="hidden" /> // Space is taken by 100% width list
                    )}
                </div>
            </main>

            {/* Right Sidebar: Copilot */}
            <CopilotSidebar
                isOpen={isCopilotOpen}
                onClose={() => setIsCopilotOpen(false)}
                context={threadContext}
            />

            <ComposeModal />

            {/* LLM Settings Modal */}
            <LLMSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    )
}
