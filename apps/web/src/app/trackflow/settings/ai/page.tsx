"use client"

import React, { useState, useEffect } from "react"
import { 
    Cpu, Save, RefreshCw, AlertCircle, 
    CheckCircle2, Info, Sliders, ShieldCheck,
    Bot, Zap, BrainCircuit
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { MODULE_IDENTITY } from "@/config/module-identity"
import { cn } from "@/lib/utils"

export default function AIExtractionSettingsPage() {
    const [config, setConfig] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        loadConfig()
    }, [])

    const loadConfig = async () => {
        setIsLoading(true)
        try {
            const data = await ApiClient.getFreightConfig()
            setConfig(data)
        } catch (e) {
            console.error(e)
            toast.error("Failed to load AI configuration")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await ApiClient.updateFreightConfig(config)
            toast.success("AI Extraction settings updated")
        } catch (e) {
            console.error(e)
            toast.error("Failed to update configuration")
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <RefreshCw className="animate-spin text-primary" size={32} />
            </div>
        )
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 pb-24">
            <header className="space-y-1">
                <div className="flex items-center gap-2 text-neutral-500 mb-1">
                    <BrainCircuit size={14} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Neural Processing</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-100">AI Extraction Engine</h1>
                <p className="text-sm text-neutral-400">Configure how {MODULE_IDENTITY.displayName} uses LLMs to autonomously parse shipment data from live emails.</p>
            </header>

            <div className="grid gap-8">
                {/* Master Toggle Section */}
                <section className={cn(
                    "p-6 rounded-2xl border transition-all",
                    config.ai_extraction_enabled ? "bg-primary/5 border-primary/20" : "bg-neutral-900 border-white/5"
                )}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-2xl border",
                                config.ai_extraction_enabled ? "bg-primary/10 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-neutral-500"
                            )}>
                                <Bot size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-neutral-100">AI-Powered Extraction</h3>
                                <p className="text-xs text-neutral-500">Use structured LLM outputs when deterministic rules fall below confidence thresholds.</p>
                            </div>
                        </div>
                        <div 
                            onClick={() => setConfig({...config, ai_extraction_enabled: !config.ai_extraction_enabled})}
                            className={cn(
                                "w-14 h-7 rounded-full relative cursor-pointer transition-colors duration-200",
                                config.ai_extraction_enabled ? "bg-primary" : "bg-neutral-800"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-200",
                                config.ai_extraction_enabled ? "left-8" : "left-1"
                            )} />
                        </div>
                    </div>
                </section>

                {config.ai_extraction_enabled && (
                    <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2">
                        {/* Model Configuration */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Cpu size={16} className="text-primary" />
                                <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Model Routing</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral-500 uppercase">Primary AI Model</label>
                                    <select 
                                        value={config.primary_ai_model}
                                        onChange={(e) => setConfig({...config, primary_ai_model: e.target.value})}
                                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:border-primary/50"
                                    >
                                        <option value="gpt-4o">GPT-4o (OpenAI) - Fast & Precise</option>
                                        <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Anthropic) - High Recall</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Google) - Large Context</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral-500 uppercase">Fallback Model</label>
                                    <select 
                                        value={config.fallback_ai_model}
                                        onChange={(e) => setConfig({...config, fallback_ai_model: e.target.value})}
                                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:border-primary/50"
                                    >
                                        <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Anthropic)</option>
                                        <option value="gpt-4o">GPT-4o (OpenAI)</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Google)</option>
                                    </select>
                                    <p className="text-[10px] text-neutral-500 italic">Used only if the primary model is unavailable or rate-limited.</p>
                                </div>
                            </div>
                        </div>

                        {/* Threshold Configuration */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Sliders size={16} className="text-primary" />
                                <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Confidence Logic</h3>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-neutral-500 uppercase">Extraction Threshold</label>
                                        <span className="text-xs font-mono text-primary font-bold">{Math.round(config.extraction_confidence_threshold * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.05"
                                        value={config.extraction_confidence_threshold}
                                        onChange={(e) => setConfig({...config, extraction_confidence_threshold: parseFloat(e.target.value)})}
                                        className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                    <p className="text-[10px] text-neutral-500">If deterministic confidence is below this, AI is triggered.</p>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-neutral-500 uppercase">Quarantine Threshold</label>
                                        <span className="text-xs font-mono text-amber-500 font-bold">{Math.round(config.quarantine_threshold * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="0.5" step="0.05"
                                        value={config.quarantine_threshold}
                                        onChange={(e) => setConfig({...config, quarantine_threshold: parseFloat(e.target.value)})}
                                        className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />
                                    <p className="text-[10px] text-neutral-500">If both methods fall below this, email is quarantined for review.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Body Length Restriction */}
                <section className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
                    <div className="flex items-center gap-3">
                        <Zap size={18} className="text-neutral-400" />
                        <h3 className="text-sm font-bold text-neutral-200">Processing Constraints</h3>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase">Max Email Body (Chars)</label>
                            <input 
                                type="number"
                                value={config.max_email_body_chars_for_ai}
                                onChange={(e) => setConfig({...config, max_email_body_chars_for_ai: parseInt(e.target.value)})}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-neutral-200 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
                            <Info size={16} className="text-primary shrink-0" />
                            <p className="text-[10px] text-neutral-400 leading-tight">
                                Large emails increase token costs. We truncate the body before sending to AI to maintain precision and stay within context limits.
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            {/* Bottom Bar for Saving */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-4xl px-8 z-50">
                <div className="bg-neutral-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className="text-primary" />
                        <span className="text-[10px] font-bold text-neutral-400 uppercase">Changes are not yet applied</span>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={loadConfig} className="h-10 border-white/10 text-xs font-bold">Discard</Button>
                        <Button 
                            onClick={handleSave} 
                            disabled={isSaving}
                            className="bg-primary hover:bg-primary/90 text-white h-10 px-8 font-bold gap-2"
                        >
                            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                            Save AI Configuration
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
