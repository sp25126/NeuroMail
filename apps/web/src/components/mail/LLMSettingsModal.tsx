"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Check, Loader2, Server, Cloud, Globe, Eye, EyeOff, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface LLMConfig {
    provider: string
    providerLabel: string
    model: string
    apiKeyMasked: string
    hasApiKey: boolean
    ollamaAvailable: boolean
    availableProviders: {
        id: string
        label: string
        requiresKey: boolean
        defaultModel: string
    }[]
}

const providerIcons: Record<string, typeof Server> = {
    ollama: Server,
    openai: Cloud,
    openrouter: Globe,
}

export function LLMSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [config, setConfig] = useState<LLMConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    // Form state
    const [selectedProvider, setSelectedProvider] = useState("")
    const [apiKey, setApiKey] = useState("")
    const [showApiKey, setShowApiKey] = useState(false)

    // Fetch current config
    useEffect(() => {
        if (!isOpen) return
        setLoading(true)
        setSaved(false)
        fetch("/api/user/preferences/llm")
            .then(r => r.json())
            .then((data: LLMConfig) => {
                setConfig(data)
                setSelectedProvider(data.provider)
                setApiKey("")
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [isOpen])

    const selectedProviderInfo = config?.availableProviders.find(p => p.id === selectedProvider)

    const handleSave = async () => {
        setSaving(true)
        setSaved(false)
        try {
            const body: any = { provider: selectedProvider }
            if (apiKey.trim()) body.apiKey = apiKey.trim()
            if (selectedProviderInfo) body.model = selectedProviderInfo.defaultModel

            await fetch("/api/user/preferences/llm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)

            // Refresh config
            const refreshed = await fetch("/api/user/preferences/llm").then(r => r.json())
            setConfig(refreshed)
            setApiKey("")
        } catch (e) {
            console.error("Failed to save LLM settings:", e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed inset-0 flex items-center justify-center z-[101] p-4"
                    >
                        <div className="w-full max-w-lg bg-background border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-primary/5 to-purple-500/5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Zap size={18} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold text-foreground">AI Model Settings</h2>
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Configure your LLM provider</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                                {loading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="animate-spin text-primary" size={24} />
                                    </div>
                                ) : config ? (
                                    <>
                                        {/* Provider Selection */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                Provider
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {config.availableProviders.map(p => {
                                                    const Icon = providerIcons[p.id] || Cloud
                                                    const isSelected = selectedProvider === p.id
                                                    const isDisabled = p.id === "ollama" && !config.ollamaAvailable

                                                    return (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => {
                                                                setSelectedProvider(p.id)
                                                                setApiKey("")
                                                                setShowApiKey(false)
                                                            }}
                                                            disabled={isDisabled}
                                                            className={cn(
                                                                "flex items-center gap-4 p-4 rounded-xl border transition-all text-left group relative overflow-hidden",
                                                                isSelected
                                                                    ? "border-primary/30 bg-primary/5"
                                                                    : "border-white/5 hover:border-white/10 hover:bg-white/5",
                                                                isDisabled && "opacity-40 cursor-not-allowed"
                                                            )}
                                                        >
                                                            {isSelected && (
                                                                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
                                                            )}
                                                            <div className={cn(
                                                                "p-2.5 rounded-lg relative z-10 transition-colors",
                                                                isSelected ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
                                                            )}>
                                                                <Icon size={18} />
                                                            </div>
                                                            <div className="flex-1 relative z-10">
                                                                <div className="font-semibold text-sm text-foreground">{p.label}</div>
                                                                <div className="text-[11px] text-muted-foreground">
                                                                    Model: <span className="font-mono text-foreground/60">{p.defaultModel}</span>
                                                                    {p.id === "ollama" && !config.ollamaAvailable && (
                                                                        <span className="ml-2 text-amber-400 font-bold">● Offline</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {isSelected && (
                                                                <div className="relative z-10 p-1 rounded-full bg-primary text-primary-foreground">
                                                                    <Check size={12} />
                                                                </div>
                                                            )}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* API Key Input (only for cloud providers) */}
                                        {selectedProviderInfo?.requiresKey && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="space-y-3"
                                            >
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                    API Key
                                                </label>

                                                {config.hasApiKey && config.provider === selectedProvider && (
                                                    <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                                                        <Check size={12} />
                                                        Key saved: <span className="font-mono text-emerald-300">{config.apiKeyMasked}</span>
                                                    </div>
                                                )}

                                                <div className="relative">
                                                    <input
                                                        type={showApiKey ? "text" : "password"}
                                                        value={apiKey}
                                                        onChange={e => setApiKey(e.target.value)}
                                                        placeholder={config.hasApiKey && config.provider === selectedProvider
                                                            ? "Enter new key to update..."
                                                            : "Enter your API key..."}
                                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 placeholder:text-muted-foreground/40 transition-all"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowApiKey(!showApiKey)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>

                                                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                                                    Your key is stored locally and never sent to third parties.
                                                    {selectedProvider === "openai" && " Get one at platform.openai.com"}
                                                    {selectedProvider === "openrouter" && " Get one at openrouter.ai/keys"}
                                                </p>
                                            </motion.div>
                                        )}

                                        {/* Current Status */}
                                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                                            <div className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Current Active</div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    config.provider === "ollama" && config.ollamaAvailable
                                                        ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                                                        : config.hasApiKey
                                                            ? "bg-blue-400 shadow-[0_0_6px_#60a5fa]"
                                                            : "bg-amber-400 shadow-[0_0_6px_#fbbf24]"
                                                )} />
                                                <span className="font-medium text-foreground">{config.providerLabel}</span>
                                                <span className="text-muted-foreground/60 font-mono text-[11px]">({config.model})</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-destructive text-center py-8">Failed to load settings</div>
                                )}
                            </div>

                            {/* Footer */}
                            {!loading && config && (
                                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3 bg-black/20">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || (selectedProviderInfo?.requiresKey && !apiKey.trim() && !(config.hasApiKey && config.provider === selectedProvider))}
                                        className={cn(
                                            "px-5 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all",
                                            saved
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--primary)/0.3)]",
                                            "disabled:opacity-40 disabled:cursor-not-allowed"
                                        )}
                                    >
                                        {saving ? (
                                            <><Loader2 size={14} className="animate-spin" /> Saving...</>
                                        ) : saved ? (
                                            <><Check size={14} /> Saved!</>
                                        ) : (
                                            "Save Settings"
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
