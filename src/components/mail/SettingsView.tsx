"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useSettingsStore } from "@/store/useSettingsStore"
import { useDeepAIStore, Persona } from "@/store/useDeepAIStore"
import { useMailStore } from "@/store/useMailStore"
import { ArrowLeft, Save, RotateCcw, Brain, Bell, Mail, Palette, Sparkles, AlertTriangle, Cpu, Cloud, Key, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { PersistenceToggle } from '@/components/settings/PersistenceToggle';
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function SettingsView() {
    const settings = useSettingsStore()
    const { persona, setPersona } = useDeepAIStore()
    const { setView } = useMailStore()

    const [localSettings, setLocalSettings] = useState({
        aiProvider: settings.aiProvider as "ollama" | "openai" | "openrouter" | "colab",
        aiApiKey: settings.aiApiKey,
        aiModel: settings.aiModel,
        colabUrl: settings.colabUrl || "",
        emailsPerPage: settings.emailsPerPage,
        autoRefreshInterval: settings.autoRefreshInterval,
        compactView: settings.compactView,
        desktopNotifications: settings.desktopNotifications,
        soundEnabled: settings.soundEnabled,
        persistAIChanges: settings.persistAIChanges,
    })

    const [colabStatus, setColabStatus] = useState<"idle" | "testing" | "ok" | "error">("idle")
    const [colabError, setColabError] = useState<string>("")

    // Sync from server on mount
    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    settings.updateSettings(data)
                    setLocalSettings(prev => ({ ...prev, ...data }))
                }
            })
            .catch(err => console.error("Failed to load settings:", err))
    }, [])

    const handleSave = async () => {
        settings.updateSettings(localSettings)

        // Persist to server
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(localSettings)
            })
            toast.success("Settings saved remotely!", { icon: "☁️" })
        } catch (e) {
            toast.error("Saved locally but failed to sync to server")
        }
    }

    const handleReset = async () => {
        settings.resetSettings()
        const defaults = {
            aiProvider: "ollama",
            aiApiKey: "",
            aiModel: "llama3.2:latest",
            colabUrl: "",
            emailsPerPage: 20,
            autoRefreshInterval: 5,
            compactView: false,
            desktopNotifications: false,
            soundEnabled: true,
            persistAIChanges: false,
        }
        setLocalSettings(defaults as any)

        setColabStatus("idle")

        // Reset server too
        await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(defaults)
        })

        toast.info("Settings reset to defaults")
    }

    const testColabConnection = async () => {
        if (!localSettings.colabUrl) {
            toast.error("Please enter your ngrok URL first")
            return
        }
        setColabStatus("testing")
        setColabError("")
        try {
            const res = await fetch(`/api/agent/test-colab?url=${encodeURIComponent(localSettings.colabUrl)}`)
            const data = await res.json()
            if (data.ok) {
                setColabStatus("ok")
                toast.success(`🟢 Connected! Model: ${data.model || "unknown"}`, { duration: 3000 })
            } else {
                setColabStatus("error")
                setColabError(data.error || "Connection failed")
                toast.error(`Connection failed: ${data.error}`)
            }
        } catch (e: any) {
            setColabStatus("error")
            setColabError(e.message)
            toast.error("Could not reach Colab server")
        }
    }

    // Sections can be used for a sidebar if needed, but unused here
    // const sections = [...]

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02] shrink-0"
            >
                <div className="flex items-center gap-3">
                    <motion.button
                        whileHover={{ x: -3 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setView("inbox")}
                        className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </motion.button>
                    <h1 className="text-lg font-bold text-foreground">Settings</h1>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                    >
                        <RotateCcw size={12} />
                        Reset
                    </button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-all"
                    >
                        <Save size={12} />
                        Save
                    </motion.button>
                </div>
            </motion.div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">

                {/* Appearance */}
                <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="glass border border-white/5 rounded-2xl p-5 space-y-4"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                            <Palette size={16} className="text-purple-400" />
                        </div>
                        <h2 className="font-bold text-foreground">Appearance</h2>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <div>
                            <p className="text-sm font-medium text-foreground">Theme</p>
                            <p className="text-xs text-muted-foreground">Toggle between dark and light mode</p>
                        </div>
                        <ThemeToggle />
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <div>
                            <p className="text-sm font-medium text-foreground">Compact View</p>
                            <p className="text-xs text-muted-foreground">Show more emails in less space</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={localSettings.compactView}
                                onChange={(e) => setLocalSettings({ ...localSettings, compactView: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/60 after:border after:border-transparent after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                        </label>
                    </div>
                </motion.section>

                {/* AI Configuration - Tri-Mode Brain Selector */}
                <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass border border-white/5 rounded-2xl p-5 space-y-4"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <Brain size={16} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground">AI Brain</h2>
                            <p className="text-[10px] text-muted-foreground">Choose where your AI runs</p>
                        </div>
                    </div>

                    {/* Brain Mode Cards */}
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { id: "ollama", icon: Cpu, label: "Local Brain", desc: "Ollama on your PC", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/40" },
                            { id: "colab", icon: Cloud, label: "Colab Brain", desc: "Google T4 GPU", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/40" },
                            { id: "openrouter", icon: Key, label: "API Brain", desc: "OpenAI / OpenRouter", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40" },
                        ] as const).map(({ id, icon: Icon, label, desc, color, bg, border }) => (
                            <motion.button
                                key={id}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setLocalSettings({ ...localSettings, aiProvider: id })}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all",
                                    localSettings.aiProvider === id
                                        ? `${border} ${bg} shadow-lg`
                                        : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/5"
                                )}
                            >
                                <div className={cn("p-2 rounded-lg", localSettings.aiProvider === id ? bg : "bg-white/5")}>
                                    <Icon size={16} className={localSettings.aiProvider === id ? color : "text-muted-foreground"} />
                                </div>
                                <div>
                                    <p className={cn("text-xs font-bold", localSettings.aiProvider === id ? color : "text-muted-foreground")}>{label}</p>
                                    <p className="text-[9px] text-muted-foreground/60 leading-tight">{desc}</p>
                                </div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Colab Brain Config */}
                    <AnimatePresence>
                        {localSettings.aiProvider === "colab" && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3 pt-2 border-t border-purple-500/20"
                            >
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                    <Cloud size={14} className="text-purple-400 shrink-0" />
                                    <p className="text-[10px] text-purple-200 leading-tight">
                                        Run the <strong>colab_brain.ipynb</strong> notebook, copy the ngrok URL, and paste it below.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Ngrok Tunnel URL</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={localSettings.colabUrl}
                                            onChange={(e) => {
                                                setLocalSettings({ ...localSettings, colabUrl: e.target.value })
                                                setColabStatus("idle")
                                            }}
                                            placeholder="https://xxxx-xx-xx-xxx-xx.ngrok-free.app"
                                            className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono"
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={testColabConnection}
                                            disabled={colabStatus === "testing"}
                                            className="px-3 py-2 text-xs font-bold rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-50 whitespace-nowrap"
                                        >
                                            {colabStatus === "testing" ? <Loader2 size={14} className="animate-spin" /> : "Test"}
                                        </motion.button>
                                    </div>
                                    {colabStatus === "ok" && (
                                        <div className="flex items-center gap-1.5 mt-2 text-green-400 text-xs">
                                            <CheckCircle2 size={12} /> Connected to Colab GPU!
                                        </div>
                                    )}
                                    {colabStatus === "error" && (
                                        <div className="flex items-center gap-1.5 mt-2 text-red-400 text-xs">
                                            <XCircle size={12} /> {colabError}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Model on Colab</label>
                                    <input
                                        type="text"
                                        value={localSettings.aiModel}
                                        onChange={(e) => setLocalSettings({ ...localSettings, aiModel: e.target.value })}
                                        placeholder="llama3.2:latest"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono"
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* API Brain Config */}
                    <AnimatePresence>
                        {(localSettings.aiProvider === "openrouter" || localSettings.aiProvider === "openai") && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3 pt-2 border-t border-amber-500/20"
                            >
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">API Key</label>
                                    <input
                                        type="password"
                                        value={localSettings.aiApiKey}
                                        onChange={(e) => setLocalSettings({ ...localSettings, aiApiKey: e.target.value })}
                                        placeholder="sk-..."
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Model</label>
                                    <input
                                        type="text"
                                        value={localSettings.aiModel}
                                        onChange={(e) => setLocalSettings({ ...localSettings, aiModel: e.target.value })}
                                        placeholder="gpt-4o-mini"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono"
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Local Brain Config */}
                    <AnimatePresence>
                        {localSettings.aiProvider === "ollama" && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="pt-2 border-t border-green-500/20"
                            >
                                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Local Model</label>
                                <input
                                    type="text"
                                    value={localSettings.aiModel}
                                    onChange={(e) => setLocalSettings({ ...localSettings, aiModel: e.target.value })}
                                    placeholder="llama3.2:latest"
                                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-green-500/50 transition-all font-mono"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1.5">Run <code className="bg-white/10 px-1 rounded">ollama list</code> to see available models</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Neural Persona */}
                    <div className="pt-2 border-t border-white/5">
                        <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Neural Persona</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["professional", "casual", "enthusiastic", "concise"] as Persona[]).map((p) => (
                                <motion.button
                                    key={p}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                        setPersona(p)
                                        toast(`Persona: ${p}`, { icon: "🧠", duration: 1500 })
                                    }}
                                    className={cn(
                                        "p-3 rounded-xl border-2 text-sm font-medium capitalize transition-all",
                                        persona === p
                                            ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary)/0.15)]"
                                            : "border-white/5 bg-white/[0.02] text-muted-foreground hover:border-white/15 hover:bg-white/5"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={14} className={persona === p ? "text-primary" : "text-muted-foreground/40"} />
                                        {p}
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Permanent AI Changes Toggle */}
                    <div className="pt-2 border-t border-white/5">
                        <PersistenceToggle />
                    </div>
                </motion.section>

                {/* Email Preferences */}
                <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="glass border border-white/5 rounded-2xl p-5 space-y-4"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-green-500/10">
                            <Mail size={16} className="text-green-400" />
                        </div>
                        <h2 className="font-bold text-foreground">Email Preferences</h2>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Emails per page</span>
                            <span className="font-mono text-foreground font-semibold">{localSettings.emailsPerPage}</span>
                        </div>
                        <input
                            type="range"
                            min="10"
                            max="50"
                            step="10"
                            value={localSettings.emailsPerPage}
                            onChange={(e) => setLocalSettings({ ...localSettings, emailsPerPage: parseInt(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Auto-refresh interval</span>
                            <span className="font-mono text-foreground font-semibold">{localSettings.autoRefreshInterval} min</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="30"
                            value={localSettings.autoRefreshInterval}
                            onChange={(e) => setLocalSettings({ ...localSettings, autoRefreshInterval: parseInt(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>
                </motion.section>

                {/* Notifications */}
                <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass border border-white/5 rounded-2xl p-5 space-y-4"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-amber-500/10">
                            <Bell size={16} className="text-amber-400" />
                        </div>
                        <h2 className="font-bold text-foreground">Notifications</h2>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <div>
                            <p className="text-sm font-medium text-foreground">Desktop Notifications</p>
                            <p className="text-xs text-muted-foreground">Get notified of new emails</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={localSettings.desktopNotifications}
                                onChange={(e) => setLocalSettings({ ...localSettings, desktopNotifications: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/60 after:border after:border-transparent after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                        </label>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <div>
                            <p className="text-sm font-medium text-foreground">Sound Effects</p>
                            <p className="text-xs text-muted-foreground">Play sounds for actions</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={localSettings.soundEnabled}
                                onChange={(e) => setLocalSettings({ ...localSettings, soundEnabled: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/60 after:border after:border-transparent after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                        </label>
                    </div>
                </motion.section>

                {/* Version Info */}
                <div className="text-center py-4">
                    <p className="text-[10px] text-muted-foreground/40 font-mono">NEUROMAIL v2.0 BETA — Built with Neural Architecture</p>
                </div>
            </div>
        </div>
    )
}
