"use client"

import React, { useState, useEffect, useRef } from "react"
import { 
    Send, Bot, User, RefreshCw, 
    Ship, AlertCircle, FileText, CheckCircle2,
    ArrowRight, Sparkles, BrainCircuit, Tool,
    ClipboardList, Clock, ShieldCheck
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface Message {
    id: string
    role: "user" | "assistant"
    content: string
    response_mode?: string
    cited_objects?: any[]
    tool_calls?: any[]
    approval_requests?: any[]
    timestamp: Date
}

export default function TrackflowCopilotPage() {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [conversationId, setConversationId] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    const suggestions = [
        "What needs attention today?",
        "Which shipments are at risk?",
        "Show quarantined emails needing review",
        "Generate today’s operations report"
    ]

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    const handleSend = async (text: string = input) => {
        if (!text.trim() || isLoading) return

        const userMsg: Message = {
            id: Math.random().toString(36).substring(7),
            role: "user",
            content: text,
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMsg])
        setInput("")
        setIsLoading(true)

        try {
            const res = await ApiClient.request<any>("/freight/copilot/chat", {
                method: "POST",
                body: JSON.stringify({ message: text }),
                headers: conversationId ? { "X-Conversation-Id": conversationId } : {}
            })

            const assistantMsg: Message = {
                id: Math.random().toString(36).substring(7),
                role: "assistant",
                content: res.response_text,
                response_mode: res.response_mode,
                cited_objects: res.cited_objects,
                tool_calls: res.tool_calls,
                approval_requests: res.approval_requests,
                timestamp: new Date()
            }

            setMessages(prev => [...prev, assistantMsg])
            // Note: If backend returned conversation_id we should store it
        } catch (e) {
            console.error(e)
            toast.error("Copilot failed to respond")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-screen bg-[#050505] text-neutral-200">
            {/* Header */}
            <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40 backdrop-blur-xl shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <BrainCircuit size={18} className="text-primary" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-tight">TrackFlow AI</h1>
                        <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Neural Operations Copilot</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Live Intelligence</span>
                    </div>
                </div>
            </header>

            {/* Chat Area */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar"
            >
                {messages.length === 0 && (
                    <div className="max-w-2xl mx-auto pt-12 space-y-12">
                        <div className="space-y-4 text-center">
                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                            >
                                <Sparkles size={32} className="text-primary" />
                            </motion.div>
                            <h2 className="text-3xl font-bold text-white tracking-tight">How can I help you today?</h2>
                            <p className="text-neutral-400 text-sm max-w-md mx-auto">
                                I can query live shipments, analyze risks, generate reports, and draft communications across your entire logistics operations.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {suggestions.map((s, i) => (
                                <motion.button
                                    key={s}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    onClick={() => handleSend(s)}
                                    className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/30 transition-all text-left group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">{s}</span>
                                        <ArrowRight size={14} className="text-neutral-600 group-hover:text-primary transition-colors" />
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </div>
                )}

                <AnimatePresence>
                    {messages.map((m) => (
                        <motion.div 
                            key={m.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "flex gap-4 max-w-4xl mx-auto",
                                m.role === "user" ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-1",
                                m.role === "user" ? "bg-neutral-800 border-white/10" : "bg-primary/10 border-primary/20"
                            )}>
                                {m.role === "user" ? <User size={16} /> : <Bot size={16} className="text-primary" />}
                            </div>
                            <div className={cn(
                                "space-y-4 flex-1",
                                m.role === "user" ? "text-right" : "text-left"
                            )}>
                                <div className={cn(
                                    "inline-block p-4 rounded-2xl text-sm leading-relaxed",
                                    m.role === "user" ? "bg-white/5 border border-white/10 text-white" : "text-neutral-200"
                                )}>
                                    {m.content}
                                </div>

                                {m.role === "assistant" && (
                                    <div className="space-y-4">
                                        {/* Tools Section */}
                                        {m.tool_calls && m.tool_calls.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {m.tool_calls.map((t: any, i: number) => (
                                                    <div key={i} className={cn(
                                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
                                                        t.status === "success" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" :
                                                        t.status === "approval_required" ? "bg-amber-500/5 border-amber-500/20 text-amber-400" :
                                                        "bg-red-500/5 border-red-500/20 text-red-400"
                                                    )}>
                                                        {t.status === "success" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                                        {t.tool_name.replace("tool_", "").replace(/_/g, " ")}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Citations Section */}
                                        {m.cited_objects && m.cited_objects.length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {m.cited_objects.map((obj: any, i: number) => (
                                                    <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all cursor-pointer">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 rounded-lg bg-white/5 text-neutral-400 group-hover:text-primary transition-colors">
                                                                {obj.record_type === "SHIPMENT" ? <Ship size={14} /> :
                                                                 obj.record_type === "ALERT" ? <AlertCircle size={14} /> :
                                                                 <FileText size={14} />}
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{obj.record_type}</div>
                                                                <div className="text-xs font-bold text-neutral-300">{obj.reference || obj.record_id}</div>
                                                            </div>
                                                        </div>
                                                        <ArrowRight size={14} className="text-neutral-700 group-hover:text-white transition-colors" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Approvals Section */}
                                        {m.approval_requests && m.approval_requests.length > 0 && (
                                            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                                                <div className="flex items-center gap-2 text-amber-500">
                                                    <ShieldCheck size={16} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Approval Required</span>
                                                </div>
                                                {m.approval_requests.map((appr: any) => (
                                                    <div key={appr.approval_id} className="flex items-center justify-between">
                                                        <p className="text-xs text-neutral-400">{appr.description}</p>
                                                        <Button variant="outline" className="h-8 text-[10px] font-bold border-amber-500/20 hover:bg-amber-500/10 text-amber-500">
                                                            View Request
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Response Mode Badge */}
                                        <div className="flex items-center gap-2 text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
                                            <span>Mode: {m.response_mode}</span>
                                            <span>•</span>
                                            <span>{m.timestamp.toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4 max-w-4xl mx-auto">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <Bot size={16} className="text-primary animate-pulse" />
                            </div>
                            <div className="flex items-center gap-2 text-neutral-500 text-xs italic">
                                <RefreshCw size={12} className="animate-spin" />
                                Processing operations data...
                            </div>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Input Area */}
            <div className="p-8 pt-0 z-10">
                <div className="max-w-4xl mx-auto relative">
                    <div className="absolute inset-0 bg-primary/20 blur-[100px] -z-10 opacity-20" />
                    <div className="bg-neutral-900/50 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl flex items-end gap-2 focus-within:border-primary/50 transition-all">
                        <textarea
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder="Ask TrackFlow AI anything..."
                            className="flex-1 bg-transparent border-none outline-none py-3 px-4 text-sm text-white placeholder:text-neutral-600 resize-none min-h-[44px] max-h-32 custom-scrollbar"
                        />
                        <Button 
                            onClick={() => handleSend()}
                            disabled={!input.trim() || isLoading}
                            className="bg-primary hover:bg-primary/90 text-white w-10 h-10 p-0 rounded-xl shrink-0"
                        >
                            <Send size={18} />
                        </Button>
                    </div>
                    <p className="mt-4 text-center text-[10px] text-neutral-600 font-mono uppercase tracking-[0.2em]">
                        Grounded in Canonical Live Data • Secure AI Execution
                    </p>
                </div>
            </div>
        </div>
    )
}
