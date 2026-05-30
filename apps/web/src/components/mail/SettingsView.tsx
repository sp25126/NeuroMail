"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { useSettingsStore } from "@/store/useSettingsStore"
import { useDeepAIStore, Persona } from "@/store/useDeepAIStore"
import { useMailStore } from "@/store/useMailStore"
import { ArrowLeft, Save, RotateCcw, Brain, Bell, Mail, Palette, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function SettingsView() {
    const settings = useSettingsStore()
    const { persona, setPersona } = useDeepAIStore()
    const { setView } = useMailStore()

    const [localSettings, setLocalSettings] = useState({
        aiProvider: settings.aiProvider,
        aiApiKey: settings.aiApiKey,
        aiModel: settings.aiModel,
        emailsPerPage: settings.emailsPerPage,
        autoRefreshInterval: settings.autoRefreshInterval,
        compactView: settings.compactView,
        desktopNotifications: settings.desktopNotifications,
        soundEnabled: settings.soundEnabled,
    })

    const handleSave = () => {
        settings.updateSettings(localSettings)
        toast.success("Settings saved!", { icon: "⚙️" })
    }

    const handleReset = () => {
        settings.resetSettings()
        setLocalSettings({
            aiProvider: "ollama",
            aiApiKey: "",
            aiModel: "gemma2:2b",
            emailsPerPage: 20,
            autoRefreshInterval: 5,
            compactView: false,
            desktopNotifications: false,
            soundEnabled: true,
        })
        toast.info("Settings reset to defaults")
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

                {/* AI Configuration */}
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
                        <h2 className="font-bold text-foreground">AI Configuration</h2>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Provider</label>
                        <select
                            value={localSettings.aiProvider}
                            onChange={(e) => setLocalSettings({ ...localSettings, aiProvider: e.target.value as any })}
                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        >
                            <option value="ollama">Ollama (Local)</option>
                            <option value="openai">OpenAI</option>
                            <option value="openrouter">OpenRouter</option>
                        </select>
                    </div>

                    {localSettings.aiProvider !== "ollama" && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                        >
                            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">API Key</label>
                            <input
                                type="password"
                                value={localSettings.aiApiKey}
                                onChange={(e) => setLocalSettings({ ...localSettings, aiApiKey: e.target.value })}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </motion.div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Model</label>
                        <input
                            type="text"
                            value={localSettings.aiModel}
                            onChange={(e) => setLocalSettings({ ...localSettings, aiModel: e.target.value })}
                            placeholder="gemma2:2b"
                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                        />
                    </div>

                    <div>
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
