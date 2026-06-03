"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Activity, Server, Database, Cpu, Zap, RotateCcw, AlertCircle, CheckCircle, Clock, Trash2, Play, Loader2 } from "lucide-react"
import { ApiClient, SystemHealth, DLQItem } from "@/lib/api-client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function OpsView() {
    const [health, setHealth] = useState<SystemHealth | null>(null)
    const [dlq, setDlq] = useState<DLQItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isReplaying, setIsReplaying] = useState<string | null>(null)

    const fetchData = async () => {
        try {
            const [healthData, dlqData] = await Promise.all([
                ApiClient.getSystemHealth(),
                ApiClient.getDLQ()
            ])
            setHealth(healthData)
            setDlq(dlqData)
        } catch (error) {
            console.error("Failed to fetch ops data:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 15000) // Refresh every 15s
        return () => clearInterval(interval)
    }, [])

    const handleReplay = async (id: string) => {
        setIsReplaying(id)
        try {
            await ApiClient.replayDLQ(id)
            toast.success("Job replay initiated")
            await fetchData()
        } catch (error: any) {
            toast.error(`Replay failed: ${error.message}`)
        } finally {
            setIsReplaying(null)
        }
    }

    return (
        <div className="flex-1 h-screen overflow-y-auto p-8 relative scrollbar-hide">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="max-w-5xl mx-auto space-y-8 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-between items-end"
                >
                    <div>
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-500">
                            System Operations
                        </h1>
                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <Server size={14} className="text-orange-400" />
                            Backend node monitoring // {dlq.length} items in DLQ
                        </p>
                    </div>
                </motion.div>

                {/* System Health Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <HealthCard label="Database" status={health?.db || "..."} icon={Database} />
                    <HealthCard label="Redis" status={health?.redis || "..."} icon={Zap} />
                    <HealthCard label="Worker" status={health?.worker || "..."} icon={Cpu} />
                    <HealthCard label="AI Core" status={health?.ai_provider || "..."} icon={Activity} />
                </div>

                {/* Dead Letter Queue */}
                <div className="glass-panel rounded-2xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <AlertCircle size={16} className="text-red-400" />
                            Dead Letter Queue (DLQ)
                        </h3>
                        <button 
                            onClick={fetchData}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors"
                        >
                            <RotateCcw size={14} className={isLoading ? "animate-spin" : ""} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="animate-spin text-muted-foreground" size={32} />
                            </div>
                        ) : dlq.length > 0 ? (
                            dlq.map((item) => (
                                <div key={item.id} className="flex flex-col gap-3 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold uppercase">
                                                FAILED
                                            </div>
                                            <div className="text-sm font-medium font-mono text-foreground">
                                                {item.provider_message_id}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground">Retries: {item.retry_count}</span>
                                            <button 
                                                onClick={() => handleReplay(item.id)}
                                                disabled={isReplaying === item.id}
                                                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-50"
                                            >
                                                {isReplaying === item.id ? <Loader2 className="animate-spin" size={10} /> : <Play size={10} />}
                                                REPLAY
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-red-400/80 bg-red-400/5 p-2 rounded-lg border border-red-400/10 italic">
                                        {item.fail_reason}
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                        <span>Mailbox: {item.mailbox_id.slice(0, 8)}...</span>
                                        <span>{new Date(item.created_at).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                                <CheckCircle className="mx-auto mb-3 opacity-20 text-emerald-400" size={32} />
                                <p className="text-sm text-muted-foreground">DLQ is empty. All systems normal.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function HealthCard({ label, status, icon: Icon }: any) {
    const isOk = status.includes("ok") || status === "healthy" || status === "ready"
    return (
        <div className="glass-panel p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-lg bg-white/5 text-muted-foreground group-hover:text-primary transition-colors">
                    <Icon size={18} />
                </div>
                <div className={cn(
                    "w-2 h-2 rounded-full",
                    isOk ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                )} />
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">{label}</div>
            <div className={cn(
                "text-sm font-bold uppercase",
                isOk ? "text-emerald-400" : "text-red-400"
            )}>
                {status}
            </div>
        </div>
    )
}
