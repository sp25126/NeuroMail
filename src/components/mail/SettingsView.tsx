"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useSettingsStore } from "@/store/useSettingsStore"
import { useDeepAIStore, Persona } from "@/store/useDeepAIStore"
import { useMailStore } from "@/store/useMailStore"
import { ArrowLeft, Save, RotateCcw, Brain, Bell, Mail, Palette, Sparkles, Plus, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react"
import { ApiClient, Mailbox as MailboxType } from "@/lib/api-client"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function SettingsView() {
    const settings = useSettingsStore()
    const { persona, setPersona } = useDeepAIStore()
    const { setView } = useMailStore()

    const [mailboxes, setMailboxes] = useState<MailboxType[]>([])
    const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(true)

    const [freightConfig, setFreightConfig] = useState<any>({
        sync_interval_minutes: 60,
        no_update_threshold_hours: 24,
        storage_risk_days: 3,
        freight_subject_patterns: ["shipment", "freight", "cargo", "delivery", "bol", "tracking"],
        freight_from_addresses: [],
        active_carriers: ["project44", "terminal49", "dhl", "fedex"],
        notification_email_addresses: [],
        slack_webhook_url: "",
        external_webhook_url: "",
        alert_severity_threshold: "MEDIUM",
        mute_start_hour: 22,
        mute_end_hour: 6
    })
    const [isLoadingFreightConfig, setIsLoadingFreightConfig] = useState(true)

    useEffect(() => {
        const fetchMailboxes = async () => {
            try {
                const data = await ApiClient.getMailboxes()
                setMailboxes(data)
            } catch (error) {
                console.error("Failed to fetch mailboxes:", error)
            } finally {
                setIsLoadingMailboxes(false)
            }
        }
        const fetchFreightConfig = async () => {
            try {
                const config = await ApiClient.getFreightConfig()
                if (config) {
                    setFreightConfig(config)
                }
            } catch (error) {
                console.error("Failed to fetch freight config:", error)
            } finally {
                setIsLoadingFreightConfig(false)
            }
        }
        fetchMailboxes()
        fetchFreightConfig()
    }, [])

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

    const handleSave = async () => {
        settings.updateSettings(localSettings)
        try {
            await ApiClient.updateFreightConfig(freightConfig)
            toast.success("Settings saved!", { icon: "⚙️" })
        } catch (error) {
            console.error("Failed to save freight config:", error)
            toast.error("Failed to save freight config settings")
        }
    }

    const handleReset = async () => {
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
        try {
            const defaults = {
                sync_interval_minutes: 60,
                no_update_threshold_hours: 24,
                storage_risk_days: 3,
                freight_subject_patterns: ["shipment", "freight", "cargo", "delivery", "bol", "tracking"],
                freight_from_addresses: [],
                active_carriers: ["project44", "terminal49", "dhl", "fedex"],
                notification_email_addresses: [],
                slack_webhook_url: "",
                external_webhook_url: "",
                alert_severity_threshold: "MEDIUM",
                mute_start_hour: 22,
                mute_end_hour: 6
            }
            await ApiClient.updateFreightConfig(defaults)
            setFreightConfig(defaults)
            toast.info("Settings reset to defaults")
        } catch (error) {
            console.error("Failed to reset freight config:", error)
            toast.error("Failed to reset freight config settings")
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

                {/* Mailboxes */}
                <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="glass border border-white/5 rounded-2xl p-5 space-y-4"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-500/10">
                                <Mail size={16} className="text-orange-400" />
                            </div>
                            <h2 className="font-bold text-foreground">Mailboxes</h2>
                        </div>
                        <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors">
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {isLoadingMailboxes ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="animate-spin text-muted-foreground" size={20} />
                            </div>
                        ) : mailboxes.length > 0 ? (
                            mailboxes.map((mb) => (
                                <div key={mb.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "p-2 rounded-lg",
                                            mb.connection_status === "CONNECTED" ? "bg-emerald-500/10" : "bg-red-500/10"
                                        )}>
                                            {mb.connection_status === "CONNECTED" ? (
                                                <ShieldCheck size={14} className="text-emerald-400" />
                                            ) : (
                                                <ShieldAlert size={14} className="text-red-400" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground capitalize">{mb.provider_type}</p>
                                            <p className="text-[10px] text-muted-foreground font-mono">{mb.id.slice(0, 8)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={cn(
                                            "text-[10px] font-bold uppercase tracking-widest",
                                            mb.connection_status === "CONNECTED" ? "text-emerald-400" : "text-red-400"
                                        )}>
                                            {mb.connection_status}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {mb.last_sync_time ? new Date(mb.last_sync_time).toLocaleDateString() : "Never synced"}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4 text-xs text-muted-foreground italic">
                                No mailboxes connected.
                            </div>
                        )}
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

                {/* Freight Automation Configuration */}
                <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="glass border border-white/5 rounded-2xl p-5 space-y-4"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-indigo-500/10">
                            <ShieldCheck size={16} className="text-indigo-400" />
                        </div>
                        <h2 className="font-bold text-foreground">Freight Automation Settings</h2>
                    </div>

                    {isLoadingFreightConfig ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="animate-spin text-muted-foreground" size={20} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Sync Interval (Min)</label>
                                    <input
                                        type="number"
                                        value={freightConfig.sync_interval_minutes}
                                        onChange={(e) => setFreightConfig({ ...freightConfig, sync_interval_minutes: parseInt(e.target.value) || 60 })}
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">No-Update Alert Threshold (Hrs)</label>
                                    <input
                                        type="number"
                                        value={freightConfig.no_update_threshold_hours}
                                        onChange={(e) => setFreightConfig({ ...freightConfig, no_update_threshold_hours: parseInt(e.target.value) || 24 })}
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Storage Risk Warning (Days)</label>
                                    <input
                                        type="number"
                                        value={freightConfig.storage_risk_days}
                                        onChange={(e) => setFreightConfig({ ...freightConfig, storage_risk_days: parseInt(e.target.value) || 3 })}
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Subject Filter Patterns (Comma-separated)</label>
                                    <input
                                        type="text"
                                        value={Array.isArray(freightConfig.freight_subject_patterns) ? freightConfig.freight_subject_patterns.join(", ") : ""}
                                        onChange={(e) => setFreightConfig({ 
                                            ...freightConfig, 
                                            freight_subject_patterns: e.target.value.split(",").map(s => s.trim()).filter(Boolean) 
                                        })}
                                        placeholder="e.g. shipment, cargo, tracking"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Sender Whitelist (Comma-separated)</label>
                                    <input
                                        type="text"
                                        value={Array.isArray(freightConfig.freight_from_addresses) ? freightConfig.freight_from_addresses.join(", ") : ""}
                                        onChange={(e) => setFreightConfig({ 
                                            ...freightConfig, 
                                            freight_from_addresses: e.target.value.split(",").map(s => s.trim()).filter(Boolean) 
                                        })}
                                        placeholder="e.g. carriers@delivery.com, notify@shipper.org"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Active Carrier Adapters (Comma-separated)</label>
                                    <input
                                        type="text"
                                        value={Array.isArray(freightConfig.active_carriers) ? freightConfig.active_carriers.join(", ") : ""}
                                        onChange={(e) => setFreightConfig({ 
                                            ...freightConfig, 
                                            active_carriers: e.target.value.split(",").map(s => s.trim()).filter(Boolean) 
                                        })}
                                        placeholder="e.g. project44, terminal49"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Alert Level Severity Threshold</label>
                                    <select
                                        value={freightConfig.alert_severity_threshold}
                                        onChange={(e) => setFreightConfig({ ...freightConfig, alert_severity_threshold: e.target.value })}
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium text-foreground bg-zinc-900 border-white/10"
                                    >
                                        <option value="LOW">LOW (All Alerts)</option>
                                        <option value="MEDIUM">MEDIUM (Warnings and Critical)</option>
                                        <option value="HIGH">HIGH (Critical Breaches Only)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Slack Notification Webhook</label>
                                    <input
                                        type="text"
                                        value={freightConfig.slack_webhook_url || ""}
                                        onChange={(e) => setFreightConfig({ ...freightConfig, slack_webhook_url: e.target.value })}
                                        placeholder="https://hooks.slack.com/services/..."
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">External API Webhook</label>
                                    <input
                                        type="text"
                                        value={freightConfig.external_webhook_url || ""}
                                        onChange={(e) => setFreightConfig({ ...freightConfig, external_webhook_url: e.target.value })}
                                        placeholder="https://your-api.com/freight-webhook"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Notification Recipients (Comma-separated)</label>
                                    <input
                                        type="text"
                                        value={Array.isArray(freightConfig.notification_email_addresses) ? freightConfig.notification_email_addresses.join(", ") : ""}
                                        onChange={(e) => setFreightConfig({ 
                                            ...freightConfig, 
                                            notification_email_addresses: e.target.value.split(",").map(s => s.trim()).filter(Boolean) 
                                        })}
                                        placeholder="ops-manager@company.com, team@company.com"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Quiet Start Hr</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="23"
                                            value={freightConfig.mute_start_hour !== null && freightConfig.mute_start_hour !== undefined ? freightConfig.mute_start_hour : ""}
                                            onChange={(e) => setFreightConfig({ ...freightConfig, mute_start_hour: e.target.value === "" ? null : parseInt(e.target.value) })}
                                            placeholder="22"
                                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Quiet End Hr</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="23"
                                            value={freightConfig.mute_end_hour !== null && freightConfig.mute_end_hour !== undefined ? freightConfig.mute_end_hour : ""}
                                            onChange={(e) => setFreightConfig({ ...freightConfig, mute_end_hour: e.target.value === "" ? null : parseInt(e.target.value) })}
                                            placeholder="6"
                                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.section>

                {/* Version Info */}
                <div className="text-center py-4">
                    <p className="text-[10px] text-muted-foreground/40 font-mono">NEUROMAIL v2.0 BETA — Built with Neural Architecture</p>
                </div>
            </div>
        </div>
    )
}
