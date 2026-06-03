"use client"

import { Inbox, Send, Star, Trash, FileText, Settings, LogOut, Brain, Zap, Fingerprint, Cpu, PenSquare, LayoutDashboard, Bell, BarChart3, Mail } from "lucide-react"
import { useMailStore } from "@/store/useMailStore"
import { useDeepAIStore, Persona } from "@/store/useDeepAIStore"
import { cn } from "@/lib/utils"
import { signOut } from "next-auth/react"
import { motion } from "framer-motion"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { MODULE_IDENTITY } from "@/config/module-identity"

const navItems = [
    { id: "dashboard", label: MODULE_IDENTITY.features.overview, icon: LayoutDashboard },
    { id: "copilot", label: "TrackFlow AI", icon: BrainCircuit },
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "mailboxes", label: MODULE_IDENTITY.features.mailboxes, icon: Mail },
    { id: "alerts", label: MODULE_IDENTITY.features.alerts, icon: Bell },
    { id: "reports", label: MODULE_IDENTITY.features.reports, icon: BarChart3 },
    { id: "ops", label: MODULE_IDENTITY.features.admin, icon: Cpu },
]

export interface SidebarProps {
    onOpenSettings?: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps = {}) {
    const { currentFolder, setFolder } = useMailStore()
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
        <div className="w-16 lg:w-64 glass border-r h-screen shrink-0 flex flex-col justify-between transition-all duration-300">
            <div className="p-6 flex items-center justify-center lg:justify-start gap-3 relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(var(--primary)/0.5)]">
                    <Brain size={20} />
                </div>
                <div className="hidden lg:block relative z-10">
                    <div className="font-bold text-lg tracking-tight leading-none">{MODULE_IDENTITY.displayName}</div>
                    <div className="text-[10px] text-primary font-mono uppercase tracking-widest">v2.0 Beta</div>
                </div>
            </div>

            {/* Compose Button */}
            <div className="px-3 mt-2 mb-4">
                <button
                    onClick={() => useMailStore.getState().openCompose()}
                    className="w-full flex items-center justify-center lg:justify-start gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold text-sm shadow-[0_0_20px_rgba(var(--primary)/0.3)] hover:shadow-[0_0_30px_rgba(var(--primary)/0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                    <PenSquare size={18} />
                    <span className="hidden lg:block">Compose</span>
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
                    onClick={() => useMailStore.getState().setView('settings')}
                    className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                    <Cpu size={18} />
                    <span className="hidden lg:block text-sm font-medium">Settings</span>
                </button>
                <div className="flex items-center gap-2 px-3 py-1">
                    <ThemeToggle />
                </div>
                {/* API Status Indicator */}
                <ApiStatusWidget />
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                    <LogOut size={18} />
                    <span className="hidden lg:block text-sm font-medium">Disconnect</span>
                </button>
            </div>
        </div>
    )
}

import { useState, useEffect } from "react"
import { ApiClient } from "@/lib/api-client"

function ApiStatusWidget() {
    const [status, setStatus] = useState<"connecting" | "online" | "offline">("connecting")

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await ApiClient.getReadiness()
                if (res.ready) {
                    setStatus("online")
                } else {
                    setStatus("offline")
                }
            } catch {
                setStatus("offline")
            }
        }

        checkStatus()
        const interval = setInterval(checkStatus, 10000) // Check every 10s
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono">
            <div className={cn(
                "w-2.5 h-2.5 rounded-full animate-pulse",
                status === "online" && "bg-emerald-500 shadow-[0_0_8px_#10b981]",
                status === "offline" && "bg-destructive shadow-[0_0_8px_#ef4444]",
                status === "connecting" && "bg-yellow-500 shadow-[0_0_8px_#eab308]"
            )} />
            <span className="hidden lg:block text-muted-foreground">
                {status === "online" && "API Connected"}
                {status === "offline" && "API Offline"}
                {status === "connecting" && "Connecting API..."}
            </span>
        </div>
    )
}

