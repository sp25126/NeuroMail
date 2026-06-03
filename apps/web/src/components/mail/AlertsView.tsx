"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Bell, AlertTriangle, AlertCircle, CheckCircle, Search, 
    Filter, ShieldAlert, Radio, Loader2, Check, Clock, Eye
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { MODULE_IDENTITY } from "@/config/module-identity"

interface Alert {
    id: string
    alert_type: string
    message: string
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    status: "UNRESOLVED" | "RESOLVED" | "SNOOZED" | "ACKNOWLEDGED" | "OPEN"
    created_at: string
    entity_id?: string
}

export function AlertsView() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [severityFilter, setSeverityFilter] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [searchQuery, setSearchQuery] = useState("")

    const fetchAlerts = async () => {
        try {
            const data = await ApiClient.getFreightDashboardAlerts({
                severity: severityFilter || undefined,
                status: statusFilter || undefined
            })
            setAlerts(data)
        } catch (error) {
            console.error("Failed to fetch freight alerts:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchAlerts()
    }, [severityFilter, statusFilter])

    const handleAcknowledge = async (id: string) => {
        try {
            await ApiClient.request(`/freight/alerts/${id}/acknowledge`, { method: "POST" })
            toast.success("Alert acknowledged")
            await fetchAlerts()
        } catch (e: any) {
            toast.error(`Acknowledge failed: ${e.message}`)
        }
    }

    const handleResolve = async (id: string) => {
        try {
            await ApiClient.request(`/freight/alerts/${id}/resolve`, { method: "POST" })
            toast.success("Alert resolved successfully")
            await fetchAlerts()
        } catch (e: any) {
            toast.error(`Resolution failed: ${e.message}`)
        }
    }

    const handleSnooze = async (id: string) => {
        try {
            const until = new Date()
            until.setHours(until.getHours() + 4) // Snooze for 4 hours
            await ApiClient.request(`/freight/alerts/${id}/snooze?snoozed_until=${until.toISOString()}`, { 
                method: "POST"
            })
            toast.success("Alert snoozed for 4 hours")
            await fetchAlerts()
        } catch (e: any) {
            toast.error(`Snooze failed: ${e.message}`)
        }
    }

    const filteredAlerts = alerts.filter(a => 
        a.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.alert_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.entity_id && a.entity_id.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    return (
        <div className="flex-1 h-screen overflow-y-auto p-8 relative scrollbar-hide bg-neutral-950 text-neutral-100">
            {/* Background grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="max-w-5xl mx-auto space-y-8 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-between items-end"
                >
                    <div>
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-orange-400 to-yellow-500">
                            {MODULE_IDENTITY.displayName} — {MODULE_IDENTITY.features.alerts}
                        </h1>

                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <Radio size={14} className="text-red-400 animate-pulse" />
                            Rules evaluator logs // {alerts.filter(a => a.status === 'OPEN').length} unresolved violations
                        </p>
                    </div>
                </motion.div>

                {/* Filters Row */}
                <div className="flex flex-col md:flex-row gap-4 p-4 rounded-xl glass border border-white/5 bg-neutral-900/40">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Filter alerts by keyword, code, shipment reference..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-neutral-800 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-300 focus:outline-none"
                        >
                            <option value="">All Severities</option>
                            <option value="CRITICAL">Critical</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                        </select>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-300 focus:outline-none"
                        >
                            <option value="">All Statuses</option>
                            <option value="OPEN">Open</option>
                            <option value="ACKNOWLEDGED">Acknowledged</option>
                            <option value="SNOOZED">Snoozed</option>
                            <option value="RESOLVED">Resolved</option>
                        </select>
                    </div>
                </div>

                {/* Alerts List */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Loader2 className="animate-spin mb-4 text-primary" size={32} />
                            <p className="text-xs font-mono">Evaluating logistics rule triggers...</p>
                        </div>
                    ) : filteredAlerts.length > 0 ? (
                        filteredAlerts.map((alert, index) => {
                            const isHigh = alert.severity === "HIGH" || alert.severity === "CRITICAL"
                            const Icon = isHigh ? AlertCircle : AlertTriangle
                            const colorMap = {
                                CRITICAL: "border-red-500/20 bg-red-900/10 text-red-400",
                                HIGH: "border-red-500/20 bg-red-500/5 text-red-400",
                                MEDIUM: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400",
                                LOW: "border-blue-500/20 bg-blue-500/5 text-blue-400"
                            }
                            const currentStatus = alert.status.toUpperCase()

                            return (
                                <motion.div
                                    key={alert.id}
                                    initial={{ opacity: 0, x: -15 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`flex items-start gap-4 p-5 rounded-2xl border backdrop-blur-md ${colorMap[alert.severity as keyof typeof colorMap] || "border-white/5 bg-neutral-900"}`}
                                >
                                    <div className="p-2 rounded-xl bg-white/5">
                                        <Icon size={20} />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-semibold text-neutral-200 text-sm uppercase tracking-tight">{alert.alert_type.replace(/_/g, ' ')}</h3>
                                            <span className="text-[10px] text-neutral-500 font-mono">{new Date(alert.created_at).toLocaleString()}</span>
                                        </div>
                                        <p className="text-xs text-neutral-400">{alert.message}</p>
                                        
                                        <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                                            <div className="flex gap-2">
                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-white/5 uppercase tracking-wider">{alert.status}</span>
                                                {alert.entity_id && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-white/5 font-mono uppercase tracking-wider">
                                                        Shipment: {alert.entity_id.slice(0, 8)}...
                                                    </span>
                                                )}
                                            </div>

                                            {/* Action triggers */}
                                            {currentStatus !== "RESOLVED" && (
                                                <div className="flex gap-2">
                                                    {currentStatus !== "ACKNOWLEDGED" && (
                                                        <button 
                                                            onClick={() => handleAcknowledge(alert.id)}
                                                            className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold text-neutral-300 transition-all flex items-center gap-1"
                                                        >
                                                            <Eye size={12} /> Acknowledge
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleSnooze(alert.id)}
                                                        className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold text-neutral-300 transition-all flex items-center gap-1"
                                                    >
                                                        <Clock size={12} /> Snooze (4h)
                                                    </button>
                                                    <button 
                                                        onClick={() => handleResolve(alert.id)}
                                                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white transition-all flex items-center gap-1"
                                                    >
                                                        <Check size={12} /> Resolve
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })
                    ) : (
                        <div className="text-center text-muted-foreground py-20 border border-dashed border-white/10 rounded-2xl">
                            <ShieldAlert className="mx-auto mb-4 opacity-20 text-neutral-500" size={48} />
                            <p className="text-xs text-neutral-500 font-mono">No active logistics alerts raised.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
