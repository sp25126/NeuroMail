"use client"

import React, { useEffect, useRef } from "react"
import { useUILoggerStore, LogEntry } from "@/store/useUILoggerStore"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Terminal, Shield, CheckCircle, AlertTriangle, XCircle, Code } from "lucide-react"
import { cn } from "@/lib/utils"

export function UILogger() {
    const { logs, clearLogs } = useUILoggerStore()
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0
        }
    }, [logs])

    const getIcon = (type: LogEntry['type']) => {
        switch (type) {
            case 'info': return <Terminal className="w-3 h-3" />
            case 'success': return <CheckCircle className="w-3 h-3 text-green-500" />
            case 'warning': return <AlertTriangle className="w-3 h-3 text-yellow-500" />
            case 'error': return <XCircle className="w-3 h-3 text-red-500" />
            case 'tool': return <Code className="w-3 h-3 text-blue-500" />
            case 'sandbox': return <Shield className="w-3 h-3 text-purple-500" />
            default: return null
        }
    }

    const getTypeColor = (type: LogEntry['type']) => {
        switch (type) {
            case 'info': return "text-zinc-400"
            case 'success': return "text-green-400"
            case 'warning': return "text-yellow-400"
            case 'error': return "text-red-400"
            case 'tool': return "text-blue-400"
            case 'sandbox': return "text-purple-400"
            default: return "text-zinc-400"
        }
    }

    return (
        <div className="flex flex-col h-full bg-black/40 backdrop-blur-xl border border-white/5 rounded-lg overflow-hidden font-mono text-[10px]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-zinc-400" />
                    <span className="font-semibold text-zinc-300 uppercase tracking-tighter">Neural Trace</span>
                </div>
                <button
                    onClick={clearLogs}
                    className="text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    CLEAR
                </button>
            </div>

            <ScrollArea className="flex-1 p-2" viewportRef={scrollRef as React.RefObject<HTMLDivElement>}>
                <div className="space-y-2">
                    {logs.length === 0 && (
                        <div className="py-8 text-center text-zinc-600 italic">
                            Awaiting neural signals...
                        </div>
                    )}
                    {logs.map((log) => (
                        <div key={log.id} className="group animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="flex items-start gap-2">
                                <span className="text-zinc-600 shrink-0 mt-0.5">{log.timestamp}</span>
                                <div className="flex-1 space-y-1 overflow-hidden">
                                    <div className="flex items-center gap-1.5 line-clamp-1">
                                        {getIcon(log.type)}
                                        <span className={cn("font-medium break-all", getTypeColor(log.type))}>
                                            {log.message}
                                        </span>
                                    </div>
                                    {log.details && (
                                        <pre className="p-1.5 rounded bg-white/5 border border-white/5 text-zinc-500 overflow-x-auto max-w-full">
                                            {typeof log.details === 'string'
                                                ? log.details
                                                : JSON.stringify(log.details, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}
