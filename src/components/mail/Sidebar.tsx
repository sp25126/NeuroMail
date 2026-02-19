"use client"

import { Inbox, Send, Star, Trash, FileText, Settings, LogOut, Brain, Zap, Fingerprint, Cpu, PenSquare, RotateCcw } from "lucide-react"
import { useMailStore } from "@/store/useMailStore"
import { useSettingsStore } from "@/store/useSettingsStore"
import { useUIStore } from "@/store/uiStore"
import { useDeepAIStore, Persona } from "@/store/useDeepAIStore"
import { cn } from "@/lib/utils"
import { signOut } from "next-auth/react"
import { motion } from "framer-motion"
import { ThemeToggle } from "@/components/ui/ThemeToggle"

const navItems = [
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "sent", label: "Sent", icon: Send },
    { id: "starred", label: "Starred", icon: Star },
    { id: "drafts", label: "Drafts", icon: FileText },
    { id: "trash", label: "Trash", icon: Trash },
]

interface SidebarProps {
    onOpenSettings?: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
    const { currentFolder, setFolder, openCompose } = useMailStore()
    const { isSidebarOpen } = useSettingsStore()
    const composeButtonColor = useUIStore((state) => state.composeButtonColor)
    const { persona, setPersona, styleProfile, setStyleProfile, isAnalyzing, setIsAnalyzing } = useDeepAIStore()

    const handleAnalyzeStyle = async () => {
        setIsAnalyzing(true)
        try {
            const res = await fetch("/api/ai/analyze-style", { method: "POST" })
            const data = await res.json()
            if (data.profile) setStyleProfile(data.profile)
        } catch (e) {
            console.error(e)
        } finally {
            setIsAnalyzing(false)
        }
    }

    return (
        <div className="w-16 lg:w-64 glass border-r h-screen shrink-0 flex flex-col justify-between transition-all duration-300 hidden md:flex">
            <aside
                className={cn(
                    "border-r border-white/10 bg-black/20 backdrop-blur-md transition-all duration-300 ease-in-out flex flex-col z-20 h-full",
                    // Mobile: Full width if shown (handled by parent overlay), usually hidden here
                    // Tablet (md): w-16 (Icons only)
                    // Desktop (lg): w-64 (Full) unless collapsed by user
                    isSidebarOpen ? "lg:w-64 md:w-16" : "lg:w-[72px] md:w-16",
                    // On mobile, this component is rendered inside a specific mobile drawer wrapper, so these classes apply mostly to desktop/tablet usage
                    "w-full h-full"
                )}
            >
                <div className="p-4 flex flex-col gap-2">
                    {/* Original Neuromail Logo/Title - Adjusted to be inside the new p-4 div and conditional on sidebar open */}
                    {isSidebarOpen ? (
                        <div className="flex items-center gap-3 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-primary/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <div className="relative z-10 w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(var(--primary)/0.5)]">
                                <Brain size={20} />
                            </div>
                            <div className="relative z-10">
                                <div className="font-bold text-lg tracking-tight leading-none">Neuromail</div>
                                <div className="text-[10px] text-primary font-mono uppercase tracking-widest">v2.0 Beta</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-10">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(var(--primary)/0.5)]">
                                <Brain size={20} />
                            </div>
                        </div>
                    )}

                    {/* Compose Button */}
                    <button
                        id="sidebar_compose_action"
                        data-ai-id="sidebar_compose_action"
                        onClick={() => openCompose()}
                        style={{ background: composeButtonColor || undefined }}
                        className={`
            relative group overflow-hidden
            flex items-center justify-center gap-3 px-4 py-3 rounded-xl
            text-white font-medium shadow-lg shadow-blue-500/20
            transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-500/30
            ${!composeButtonColor ? "bg-primary" : ""}
          `}
                    >
                        {/* Shimmer Effect (Only if no custom color) */}
                        {!composeButtonColor && (
                            <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        )}
                        <PenSquare size={18} className="relative z-10" />
                        <span className="hidden lg:block relative z-10">Compose</span>
                    </button>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                    <div className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Navigation
                    </div>
                    {navItems.map((item) => {
                        const Icon = item.icon
                        return (
                            <motion.button
                                key={item.id}
                                data-ai-id={`sidebar_nav_${item.id}`}
                                onClick={() => setFolder(item.id)}
                                whileHover={{ x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative overflow-hidden",
                                    currentFolder === item.id
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <div className={cn(
                                    "absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 transition-opacity",
                                    currentFolder === item.id && "opacity-100"
                                )} />
                                <Icon size={18} className="relative z-10" />
                                <span className="hidden lg:block font-medium text-sm relative z-10">{item.label}</span>
                            </motion.button>
                        )
                    })}
                    <div className="mt-8 px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                        <span>Neural Persona</span>
                        {styleProfile && <span className="text-neon-blue text-[9px] px-1 py-0.5 rounded bg-neon-blue/10 border border-neon-blue/20">MATCHED</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-2 px-1">
                        {(['professional', 'casual', 'enthusiastic', 'concise'] as Persona[]).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPersona(p)}
                                className={cn(
                                    "text-[10px] font-medium py-1.5 rounded-md border transition-all capitalized",
                                    persona === p
                                        ? "bg-primary/20 border-primary/30 text-primary shadow-[0_0_10px_rgba(var(--primary)/0.2)]"
                                        : "border-transparent hover:bg-white/5 text-muted-foreground"
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    <div className="px-1 mt-3">
                        <button
                            onClick={handleAnalyzeStyle}
                            disabled={isAnalyzing}
                            className="w-full relative overflow-hidden p-3 rounded-xl border border-white/5 bg-black/20 group"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10 flex items-center gap-3">
                                <div className={cn("p-2 rounded-lg bg-white/5 text-muted-foreground transition-colors", isAnalyzing && "text-neon-blue animate-pulse")}>
                                    {isAnalyzing ? <Zap size={16} /> : <Fingerprint size={16} />}
                                </div>
                                <div className="text-left">
                                    <div className="text-xs font-bold text-foreground">Style Cloning</div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {isAnalyzing ? "Analyzing Synapses..." : styleProfile ? "Profile Active" : "Analyze Sent Mails"}
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </nav>

                <div className="p-4 border-t border-white/5 bg-black/20 space-y-1">
                    {/* Reset AI UI Button - Conditional */}
                    {(composeButtonColor) && (
                        <button
                            onClick={() => {
                                useUIStore.getState().setComposeButtonColor(null);
                                useUIStore.getState().setSearchCommand({ query: "", timestamp: Date.now() });
                                useMailStore.getState().clearFilter();
                            }}
                            className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors mb-2 animate-in fade-in slide-in-from-left-2"
                            title="Reset AI Changes"
                        >
                            <RotateCcw size={18} />
                            <span className="hidden lg:block text-sm font-medium">Reset Theme</span>
                        </button>
                    )}
                    <button
                        onClick={async () => {
                            const res = await fetch("/api/mail/sync", { method: "POST" });
                            const data = await res.json();
                            if (data.success) alert("Live Sync Active!");
                            else alert("Sync Error: " + data.error);
                        }}
                        className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                        <div className="relative">
                            <Settings size={18} />
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_#10b981]" />
                        </div>
                        <span className="hidden lg:block text-sm font-medium">Live Sync</span>
                    </button>
                    <button
                        onClick={() => {
                            useMailStore.getState().setView('settings');
                            onOpenSettings?.();
                        }}
                        data-ai-id="sidebar_settings_action"
                        className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                    >
                        <Cpu size={18} />
                        <span className="hidden lg:block text-sm font-medium">Settings</span>
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1">
                        <ThemeToggle />
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="hidden lg:block text-sm font-medium">Disconnect</span>
                    </button>
                </div>
            </aside>
        </div>
    )
}
