"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Send, Loader2, Link as LinkIcon, MessageSquare, ShieldAlert } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { MODULE_IDENTITY } from "@/config/module-identity"

export function FreightCopilot() {
    const [query, setQuery] = useState("")
    const [messages, setMessages] = useState<any[]>([
        { role: 'assistant', text: `I'm your ${MODULE_IDENTITY.copilotName}. I can analyze shipments, cite specific carrier events, and draft updates. What needs attention today?`, sources: [] }
    ])
    const [isTyping, setIsTyping] = useState(false)

    const handleSend = async () => {
        if (!query.trim()) return
        
        const userMsg = { role: 'user', text: query }
        setMessages([...messages, userMsg])
        setQuery("")
        setIsTyping(true)

        try {
            // Audit the query on backend
            await ApiClient.request('/freight/demo/queries', {
                method: 'POST',
                body: JSON.stringify({ query: userMsg.text })
            })

            // In a real implementation, this calls the LLM with deterministic context
            // Simulating a synthesized response with citations
            setTimeout(() => {
                const response = {
                    role: 'assistant',
                    text: "Based on real-time Terminal49 data, 2 shipments (BOL-994, BOL-102) are currently at risk of demurrage at the Port of Long Beach. BOL-994 has been at the terminal for 4 days without a pickup appointment.",
                    sources: [
                        { type: 'SHIPMENT', ref: 'BOL-994', id: 'ship-1' },
                        { type: 'ALERT', ref: 'Demurrage Risk', id: 'alert-5' }
                    ]
                }
                setMessages(prev => [...prev, response])
                setIsTyping(false)
            }, 1500)

        } catch (e) {
            setIsTyping(false)
        }
    }

    return (
        <div className="flex flex-col h-[500px] bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            <header className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-primary" />
                    <h3 className="text-sm font-bold text-neutral-100">{MODULE_IDENTITY.copilotName}</h3>
                </div>
                <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase">
                    Grounded Mode
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                            m.role === 'user' 
                            ? 'bg-primary text-white font-medium' 
                            : 'bg-neutral-800 text-neutral-200 border border-white/5'
                        }`}>
                            {m.text}
                            
                            {m.sources?.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                                    {m.sources.map((s: any, si: number) => (
                                        <div key={si} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-950 border border-white/10 text-[9px] font-mono text-primary cursor-pointer hover:bg-neutral-900 transition-colors">
                                            <LinkIcon size={8} /> {s.ref}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-neutral-800 p-3 rounded-2xl border border-white/5 flex gap-1">
                            <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
            </div>

            <footer className="p-4 bg-neutral-950 border-t border-white/5">
                <div className="relative">
                    <input 
                        type="text" 
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about at-risk shipments..." 
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-xs text-neutral-200 focus:outline-none focus:border-primary/50"
                    />
                    <button 
                        onClick={handleSend}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity"
                    >
                        <Send size={14} />
                    </button>
                </div>
                <div className="mt-2 text-[8px] text-center text-neutral-600 font-mono flex items-center justify-center gap-1">
                    <ShieldCheck size={8} /> Determinstic queries prioritized. AI Synthesis used for natural language.
                </div>
            </footer>
        </div>
    )
}

function ShieldCheck({ size }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
  )
}
