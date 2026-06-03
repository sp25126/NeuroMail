"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    BarChart3, FileText, Download, Play, Calendar, 
    Clock, Database, CheckCircle, Loader2, Plus, 
    Trash2, ToggleLeft, ToggleRight, AlertTriangle, Send, Mail
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MODULE_IDENTITY } from "@/config/module-identity"

interface ReportRun {
    id: string
    tenant_id: string
    report_type: string
    status: string
    parameters: any
    output_uri: string | null
    row_count: number
    error: string | null
    started_at: string
    completed_at: string | null
}

interface ReportSchedule {
    id: string
    tenant_id: string
    report_type: string
    cron_expression: string | null
    interval_minutes: number | null
    enabled: boolean
    format: string
    recipients: string[] | null
    last_run_at: string | null
    next_run_at: string | null
    created_at: string
}

export function ReportsView() {
    const [activeTab, setActiveTab] = useState<"history" | "schedules">("history")
    const [runs, setRuns] = useState<ReportRun[]>([])
    const [schedules, setSchedules] = useState<ReportSchedule[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form states for creating a schedule
    const [showForm, setShowForm] = useState(false)
    const [reportType, setReportType] = useState("shipment_status")
    const [format, setFormat] = useState("csv")
    const [cronType, setCronType] = useState("morning") // morning, hourly, weekly
    const [recipientsText, setRecipientsText] = useState("")

    const fetchAllData = async () => {
        try {
            const [runsData, schedulesData] = await Promise.all([
                ApiClient.getFreightDashboardReports(),
                ApiClient.getFreightReportSchedules()
            ])
            setRuns(runsData)
            setSchedules(schedulesData)
        } catch (error) {
            console.error("Failed to fetch reports view data:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchAllData()
    }, [])

    const handleCreateSchedule = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        
        let cron_expression = "0 8 * * *" // Daily morning default
        let interval_minutes = null

        if (cronType === "hourly") {
            cron_expression = "0 * * * *"
        } else if (cronType === "weekly") {
            cron_expression = "0 8 * * 1" // Monday morning
        }

        const recipients = recipientsText.split(",").map(email => email.trim()).filter(Boolean)

        try {
            await ApiClient.createFreightReportSchedule({
                report_type: reportType,
                cron_expression,
                interval_minutes,
                enabled: true,
                format,
                recipients
            })
            toast.success("Schedule created successfully")
            setShowForm(false)
            setRecipientsText("")
            await fetchAllData()
        } catch (err: any) {
            toast.error(`Failed to create schedule: ${err.message}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleToggleSchedule = async (sched: ReportSchedule) => {
        try {
            await ApiClient.updateFreightReportSchedule(sched.id, {
                enabled: !sched.enabled
            })
            toast.success(`Schedule ${!sched.enabled ? "enabled" : "disabled"}`)
            await fetchAllData()
        } catch (err: any) {
            toast.error(`Toggle failed: ${err.message}`)
        }
    }

    const handleDeleteSchedule = async (id: string) => {
        try {
            await ApiClient.deleteFreightReportSchedule(id)
            toast.success("Schedule deleted")
            await fetchAllData()
        } catch (err: any) {
            toast.error(`Delete failed: ${err.message}`)
        }
    }

    const handleRunOnDemand = async (type: string, fmt: string) => {
        setIsLoading(true)
        try {
            await ApiClient.request("/freight/reports/schedules", {
                method: "POST",
                body: JSON.stringify({
                    report_type: type,
                    format: fmt,
                    enabled: false
                })
            })
            toast.success("On-demand report run initiated")
            await fetchAllData()
        } catch (err: any) {
            toast.error(`Run failed: ${err.message}`)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex-1 h-screen overflow-y-auto p-8 relative scrollbar-hide bg-neutral-950 text-neutral-100">
            {/* Ambient background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="max-w-5xl mx-auto space-y-8 relative z-10">
                {/* Header view */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
                >
                    <div>
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500">
                            {MODULE_IDENTITY.displayName} — {MODULE_IDENTITY.features.reports}
                        </h1>

                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <BarChart3 size={14} className="text-emerald-400" />
                            Reports generation and automated schedule center
                        </p>
                    </div>

                    <div className="flex rounded-xl bg-neutral-900/80 p-1 border border-white/5">
                        <button
                            onClick={() => setActiveTab("history")}
                            className={cn(
                                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                activeTab === "history" ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-white"
                            )}
                        >
                            History Logs
                        </button>
                        <button
                            onClick={() => setActiveTab("schedules")}
                            className={cn(
                                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                activeTab === "schedules" ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-white"
                            )}
                        >
                            Report Schedules
                        </button>
                    </div>
                </motion.div>

                {/* Sub-Views */}
                {isLoading ? (
                    <div className="flex justify-center py-24">
                        <Loader2 className="animate-spin text-primary" size={40} />
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {/* TAB 1: HISTORY */}
                        {activeTab === "history" && (
                            <motion.div
                                key="history"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                className="space-y-6"
                            >
                                {/* Quick Manual Trigger bar */}
                                <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-neutral-900/40 flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-neutral-200">On-Demand Ledger Export</h3>
                                        <p className="text-xs text-neutral-400 mt-1">Directly generate a CSV/XLSX export from the latest database milestones.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleRunOnDemand("shipment_status", "csv")}
                                            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded-lg border border-white/5 transition-colors"
                                        >
                                            Export Shipments CSV
                                        </button>
                                        <button 
                                            onClick={() => handleRunOnDemand("kpi_summary", "xlsx")}
                                            className="px-4 py-2 bg-primary hover:opacity-90 text-xs font-bold rounded-lg transition-colors text-white"
                                        >
                                            Export KPIs XLSX
                                        </button>
                                    </div>
                                </div>

                                {/* Runs History List */}
                                <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-neutral-900/40 space-y-4">
                                    <h3 className="text-md font-bold text-neutral-200">Execution Runs Log</h3>
                                    <div className="space-y-3">
                                        {runs.map((run) => (
                                            <div key={run.id} className="flex justify-between items-center p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-xs text-neutral-200 uppercase font-mono">{run.report_type.replace(/_/g, ' ')}</div>
                                                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                                                            Rows: {run.row_count} // Created: {new Date(run.started_at).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <span className={cn(
                                                        "text-[9px] font-bold font-mono px-2 py-0.5 rounded",
                                                        run.status === "success" && "bg-emerald-500/15 text-emerald-400",
                                                        run.status === "running" && "bg-blue-500/15 text-blue-400 animate-pulse",
                                                        run.status === "failed" && "bg-red-500/15 text-red-400"
                                                    )}>
                                                        {run.status.toUpperCase()}
                                                    </span>

                                                    {run.status === "success" && run.output_uri && (
                                                        <a 
                                                            href={`http://localhost:8000${run.output_uri}`}
                                                            download
                                                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                                                            title="Download File"
                                                        >
                                                            <Download size={14} />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {runs.length === 0 && (
                                            <div className="text-center py-12 text-neutral-500 italic text-xs">
                                                No past report execution runs logged.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* TAB 2: SCHEDULES */}
                        {activeTab === "schedules" && (
                            <motion.div
                                key="schedules"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                className="space-y-6"
                            >
                                {/* Create Schedule button and form */}
                                <div className="flex justify-between items-center">
                                    <h3 className="text-md font-bold text-neutral-200">Automated Schedules</h3>
                                    <Button 
                                        onClick={() => setShowForm(!showForm)}
                                        className="h-8 text-xs bg-primary flex items-center gap-1.5"
                                    >
                                        <Plus size={14} /> Create Schedule
                                    </Button>
                                </div>

                                {showForm && (
                                    <motion.form 
                                        onSubmit={handleCreateSchedule}
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="p-6 rounded-2xl bg-neutral-900/60 border border-white/5 space-y-4 max-w-xl"
                                    >
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">New Schedule Settings</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-mono text-neutral-400">Report Type</label>
                                                <select
                                                    value={reportType}
                                                    onChange={(e) => setReportType(e.target.value)}
                                                    className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none"
                                                >
                                                    <option value="shipment_status">Shipment Status</option>
                                                    <option value="aging_no_update">Aging / No-Update</option>
                                                    <option value="arrival_pickup">Arrival / Pickup</option>
                                                    <option value="quarantine">Quarantine Ledger</option>
                                                    <option value="kpi_summary">KPI Executive Summary</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-mono text-neutral-400">Format</label>
                                                <select
                                                    value={format}
                                                    onChange={(e) => setFormat(e.target.value)}
                                                    className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none"
                                                >
                                                    <option value="csv">CSV (Flat Text)</option>
                                                    <option value="xlsx">XLSX (Formatted Excel)</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-mono text-neutral-400">Frequency</label>
                                                <select
                                                    value={cronType}
                                                    onChange={(e) => setCronType(e.target.value)}
                                                    className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none"
                                                >
                                                    <option value="morning">Daily Morning (8:00 AM)</option>
                                                    <option value="hourly">Hourly Snapshots</option>
                                                    <option value="weekly">Weekly Executive Summary (Mon 8:00 AM)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-mono text-neutral-400">Auditors (Comma Sep Email)</label>
                                                <input
                                                    type="text"
                                                    placeholder="admin@co.com, operations@co.com"
                                                    value={recipientsText}
                                                    onChange={(e) => setRecipientsText(e.target.value)}
                                                    className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-2 justify-end pt-2">
                                            <button 
                                                type="button"
                                                onClick={() => setShowForm(false)}
                                                className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-400 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <Button 
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="bg-primary text-xs h-8 text-white font-bold"
                                            >
                                                {isSubmitting ? "Creating..." : "Save Schedule"}
                                            </Button>
                                        </div>
                                    </motion.form>
                                )}

                                {/* Schedules Lists */}
                                <div className="space-y-3">
                                    {schedules.map((sched) => (
                                        <div key={sched.id} className="p-4 rounded-xl bg-neutral-900/40 border border-white/5 flex justify-between items-center gap-4">
                                            <div>
                                                <div className="flex gap-2 items-center">
                                                    <span className="text-[10px] font-mono font-bold text-primary uppercase">{sched.report_type.replace(/_/g, ' ')}</span>
                                                    <span className="text-[9px] font-mono bg-white/5 text-neutral-400 px-1.5 py-0.5 rounded font-bold uppercase">{sched.format}</span>
                                                </div>
                                                <div className="text-xs text-neutral-300 mt-1 font-mono">
                                                    Frequency: {sched.cron_expression === "0 8 * * *" && "Daily Morning"}
                                                    {sched.cron_expression === "0 * * * *" && "Hourly Snapshot"}
                                                    {sched.cron_expression === "0 8 * * 1" && "Weekly Executive"}
                                                </div>
                                                {sched.recipients && sched.recipients.length > 0 && (
                                                    <div className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1">
                                                        <Mail size={10} /> Recipients: {sched.recipients.join(", ")}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => handleToggleSchedule(sched)}
                                                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                                    title={sched.enabled ? "Disable" : "Enable"}
                                                >
                                                    {sched.enabled ? (
                                                        <ToggleRight className="text-emerald-400" size={24} />
                                                    ) : (
                                                        <ToggleLeft className="text-neutral-500" size={24} />
                                                    )}
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteSchedule(sched.id)}
                                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                                    title="Delete Schedule"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {schedules.length === 0 && (
                                        <div className="text-center py-12 border border-dashed border-white/10 rounded-xl text-neutral-500 italic text-xs">
                                            No automated report snapshot jobs scheduled.
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>
        </div>
    )
}
