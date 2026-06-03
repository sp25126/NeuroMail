"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Activity, BarChart3, Wifi, Cpu, Globe, Shield, Zap, 
    Database, Clock, AlertTriangle, Fingerprint, Ship, 
    MapPin, Calendar, ExternalLink, RefreshCw, Filter, Search,
    ChevronRight, Download, CheckCircle2, AlertOctagon, Mail, Settings, Loader2
} from "lucide-react"
import { ApiClient, DashboardMetrics, AuditLog } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { MODULE_IDENTITY } from "@/config/module-identity"

export function DashboardView() {
    const [activeTab, setActiveTab] = useState<"system" | "freight">("freight")
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Freight States
    const [freightSummary, setFreightSummary] = useState<any | null>(null)
    const [shipments, setShipments] = useState<any[]>([])
    const [selectedShipment, setSelectedShipment] = useState<any | null>(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("")

    const fetchSystemData = async () => {
        try {
            const [metricsData, logsData] = await Promise.all([
                ApiClient.getDashboardMetrics(),
                ApiClient.getAuditLogs()
            ])
            setMetrics(metricsData)
            setLogs(logsData.slice(0, 5))
        } catch (error) {
            console.error("Failed to fetch system dashboard data:", error)
        }
    }

    const fetchFreightData = async () => {
        try {
            const [summaryData, shipmentsData] = await Promise.all([
                ApiClient.getFreightDashboardSummary(),
                ApiClient.getFreightDashboardShipments()
            ])
            setFreightSummary(summaryData)
            setShipments(shipmentsData)
            
            // Auto-select first shipment details if nothing selected
            if (shipmentsData.length > 0 && !selectedShipment) {
                const detail = await ApiClient.getFreightDashboardShipmentDetail(shipmentsData[0].id)
                setSelectedShipment(detail)
            }
        } catch (error) {
            console.error("Failed to fetch freight dashboard data:", error)
        }
    }

    const loadAll = async () => {
        setIsLoading(true)
        await Promise.all([fetchSystemData(), fetchFreightData()])
        setIsLoading(false)
    }

    useEffect(() => {
        loadAll()
        const interval = setInterval(() => {
            fetchSystemData()
            fetchFreightData()
        }, 30000)
        return () => clearInterval(interval)
    }, [])

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            await ApiClient.request("/freight/sync", { method: "POST" })
            await fetchFreightData()
            if (selectedShipment) {
                const detail = await ApiClient.getFreightDashboardShipmentDetail(selectedShipment.shipment.id)
                setSelectedShipment(detail)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setIsSyncing(false)
        }
    }

    const handleSelectShipment = async (id: string) => {
        try {
            const detail = await ApiClient.getFreightDashboardShipmentDetail(id)
            setSelectedShipment(detail)
        } catch (e) {
            console.error(e)
        }
    }

    const filteredShipments = shipments.filter(s => {
        const matchesSearch = s.primary_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.carrier && s.carrier.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (s.origin_port && s.origin_port.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (s.destination_port && s.destination_port.toLowerCase().includes(searchQuery.toLowerCase()))
        const matchesStatus = statusFilter ? s.last_known_status === statusFilter : true
        return matchesSearch && matchesStatus
    })

    return (
        <div className="flex-1 h-screen overflow-y-auto p-8 relative scrollbar-hide bg-neutral-950 text-neutral-100">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="max-w-5xl mx-auto space-y-8 relative z-10">
                {/* Header Tab Switcher */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-400 to-purple-600">
                            {MODULE_IDENTITY.displayName} — {MODULE_IDENTITY.features.overview}
                        </h1>

                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Operations Control Server // Active
                        </p>
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex rounded-xl bg-neutral-900/80 p-1 border border-white/5">
                        <button
                            onClick={() => setActiveTab("freight")}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                activeTab === "freight" 
                                    ? "bg-primary text-white shadow-lg" 
                                    : "text-muted-foreground hover:text-white"
                            )}
                        >
                            <Ship size={14} /> {MODULE_IDENTITY.displayName} Operations
                        </button>
                        <button
                            onClick={() => setActiveTab("system")}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                activeTab === "system" 
                                    ? "bg-primary text-white shadow-lg" 
                                    : "text-muted-foreground hover:text-white"
                            )}
                        >
                            <Cpu size={14} /> System Node Status
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="animate-spin text-primary" size={48} />
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {/* FREIGHT MODE */}
                        {activeTab === "freight" && (
                            <motion.div
                                key="freight"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                className="space-y-8"
                            >
                                {/* Freight KPIs */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <FreightStatCard
                                        title="Active Shipments"
                                        value={freightSummary?.total_shipments || 0}
                                        delta={freightSummary?.total_shipments_delta || 0}
                                        icon={Ship}
                                    />
                                    <FreightStatCard
                                        title="Arrived Containers"
                                        value={freightSummary?.shipments_arrived || 0}
                                        delta={freightSummary?.shipments_arrived_delta || 0}
                                        icon={CheckCircle2}
                                        status="arrived"
                                    />
                                    <FreightStatCard
                                        title="Delayed Shipments"
                                        value={freightSummary?.shipments_delayed || 0}
                                        delta={freightSummary?.shipments_delayed_delta || 0}
                                        icon={AlertTriangle}
                                        status="delayed"
                                    />
                                    <FreightStatCard
                                        title="Active Alerts"
                                        value={
                                            (freightSummary?.alerts_open_by_severity?.critical || 0) +
                                            (freightSummary?.alerts_open_by_severity?.high || 0)
                                        }
                                        delta={freightSummary?.alerts_open_delta || 0}
                                        icon={AlertOctagon}
                                        status="alert"
                                    />
                                </div>

                                {/* Shipments Console Split Layout */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Shipments List Table (Left 2 Columns) */}
                                    <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/5 bg-neutral-900/20 backdrop-blur-md flex flex-col justify-between space-y-4">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                            <h3 className="text-lg font-bold text-neutral-200 flex items-center gap-2">
                                                <Activity size={18} className="text-primary" />
                                                Logistics Sync Desk
                                            </h3>
                                            <div className="flex gap-2 w-full md:w-auto">
                                                <div className="relative flex-1 md:w-48">
                                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search ref, carrier..."
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-primary/50"
                                                    />
                                                </div>
                                                <select
                                                    value={statusFilter}
                                                    onChange={(e) => setStatusFilter(e.target.value)}
                                                    className="bg-neutral-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-neutral-300 focus:outline-none"
                                                >
                                                    <option value="">Statuses</option>
                                                    <option value="BOOKED">Booked</option>
                                                    <option value="IN_TRANSIT">In Transit</option>
                                                    <option value="ARRIVED">Arrived</option>
                                                    <option value="DELIVERED">Delivered</option>
                                                </select>
                                                <button 
                                                    onClick={handleSync}
                                                    disabled={isSyncing}
                                                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
                                                    title="Force tracking engine sync"
                                                >
                                                    <RefreshCw size={14} className={cn("text-neutral-300", isSyncing && "animate-spin")} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto w-full">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-white/5 text-neutral-400 font-mono">
                                                        <th className="py-3 px-2">Reference</th>
                                                        <th className="py-3 px-2">Carrier</th>
                                                        <th className="py-3 px-2">Route</th>
                                                        <th className="py-3 px-2">Status</th>
                                                        <th className="py-3 px-2">ETA</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredShipments.map((s) => (
                                                        <tr 
                                                            key={s.id} 
                                                            onClick={() => handleSelectShipment(s.id)}
                                                            className={cn(
                                                                "border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors",
                                                                selectedShipment?.shipment?.id === s.id && "bg-primary/10 border-primary/20"
                                                            )}
                                                        >
                                                            <td className="py-3 px-2 font-mono font-semibold text-neutral-200">{s.primary_reference}</td>
                                                            <td className="py-3 px-2">{s.carrier || "Unknown"}</td>
                                                            <td className="py-3 px-2">
                                                                <span className="truncate max-w-[120px] block">
                                                                    {s.origin_port} &rarr; {s.destination_port}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-2">
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                    s.last_known_status === "ARRIVED" && "bg-emerald-500/10 text-emerald-400",
                                                                    s.last_known_status === "IN_TRANSIT" && "bg-blue-500/10 text-blue-400",
                                                                    s.last_known_status === "BOOKED" && "bg-neutral-800 text-neutral-400"
                                                                )}>
                                                                    {s.last_known_status}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-2 font-mono">{s.eta ? new Date(s.eta).toLocaleDateString() : "Pending"}</td>
                                                        </tr>
                                                    ))}
                                                    {filteredShipments.length === 0 && (
                                                        <tr>
                                                            <td colSpan={5} className="text-center py-12 text-neutral-500 italic">
                                                                No shipments recorded in canonical PostgreSQL state.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Shipment Detail Panel (Right 1 Column) */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-neutral-900/20 backdrop-blur-md space-y-6">
                                        {selectedShipment ? (
                                            <>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-mono text-primary font-bold uppercase tracking-wider">Milestone Inspection</span>
                                                    <h3 className="text-lg font-bold text-neutral-200 font-mono leading-none">{selectedShipment.shipment.primary_reference}</h3>
                                                    <span className="text-[10px] text-neutral-500 font-mono block">ID: {selectedShipment.shipment.id.slice(0, 8)}...</span>
                                                </div>

                                                <div className="border-t border-b border-white/5 py-4 space-y-3 text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-neutral-400">Carrier:</span>
                                                        <span className="text-neutral-200 font-semibold">{selectedShipment.shipment.carrier}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-neutral-400">Origin Port:</span>
                                                        <span className="text-neutral-200 font-semibold">{selectedShipment.shipment.origin_port}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-neutral-400">Destination:</span>
                                                        <span className="text-neutral-200 font-semibold">{selectedShipment.shipment.destination_port}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-neutral-400">ETA:</span>
                                                        <span className="text-neutral-200 font-semibold font-mono">
                                                            {selectedShipment.shipment.eta ? new Date(selectedShipment.shipment.eta).toLocaleDateString() : "Pending"}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Snapshot Detail */}
                                                <div className="space-y-2">
                                                    <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest font-bold">Latest Snapshot</h4>
                                                    {selectedShipment.snapshots[0] ? (
                                                        <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2 text-[10px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-neutral-400">Provider:</span>
                                                                <span className="font-bold text-neutral-200">{selectedShipment.snapshots[0].carrier_adapter}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-neutral-400">Status:</span>
                                                                <span className="font-bold text-primary">{selectedShipment.snapshots[0].carrier_status}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-neutral-400">Synced At:</span>
                                                                <span className="font-mono text-neutral-500">{new Date(selectedShipment.snapshots[0].synced_at).toLocaleTimeString()}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-neutral-500 italic">No carrier tracking fetched.</div>
                                                    )}
                                                </div>

                                                {/* Field Provenance */}
                                                <div className="space-y-3">
                                                    <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest font-bold">Extraction Provenance</h4>
                                                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                                        {selectedShipment.provenances && selectedShipment.provenances.length > 0 ? (
                                                            selectedShipment.provenances.map((p: any) => (
                                                                <div key={p.id} className="p-2 rounded bg-white/5 border border-white/5 flex justify-between items-center text-[10px]">
                                                                    <div className="space-y-0.5">
                                                                        <div className="text-neutral-400 uppercase font-mono text-[8px]">{p.field_name.replace(/_/g, ' ')}</div>
                                                                        <div className="text-neutral-200 font-bold truncate max-w-[100px]">{p.field_value}</div>
                                                                    </div>
                                                                    <div className="text-right space-y-1">
                                                                        <div className="flex items-center gap-1 justify-end">
                                                                            <span className={cn(
                                                                                "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                                                                                p.extraction_method === 'deterministic' ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"
                                                                            )}>
                                                                                {p.extraction_method}
                                                                            </span>
                                                                            {p.extraction_model && (
                                                                                <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[8px] font-mono uppercase">
                                                                                    {p.extraction_model.split('/').pop()}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-neutral-500 font-mono text-[8px]">Conf: {(p.confidence * 100).toFixed(0)}%</div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="text-xs text-neutral-500 italic">No extraction data available.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Milestone History */}
                                                <div className="space-y-3">
                                                    <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest font-bold">Milestones</h4>
                                                    <div className="space-y-3 relative pl-3 before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-[2px] before:bg-white/5">
                                                        {selectedShipment.events.slice(0, 3).map((e: any) => (
                                                            <div key={e.id} className="relative">
                                                                <div className="absolute -left-[15px] top-1.5 w-1.5 h-1.5 rounded-full bg-primary border-2 border-neutral-950" />
                                                                <div className="text-[10px]">
                                                                    <div className="flex justify-between text-neutral-300">
                                                                        <span className="font-semibold">{e.event_type.replace(/_/g, ' ')}</span>
                                                                        <span className="text-neutral-500 font-mono">{new Date(e.created_at).toLocaleDateString()}</span>
                                                                    </div>
                                                                    {e.payload?.description && (
                                                                        <span className="text-neutral-500 italic block mt-0.5">{e.payload.description}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {selectedShipment.events.length === 0 && (
                                                            <span className="text-xs text-neutral-500 italic">No milestone updates recorded.</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center py-24 text-neutral-500 italic text-xs">
                                                Select a shipment to inspect its tracking milestones.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* SYSTEM STATUS MODE */}
                        {activeTab === "system" && (
                            <motion.div
                                key="system"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                className="space-y-8"
                            >
                                {/* System Stats */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <StatCard
                                        title="Ingested Emails"
                                        value={metrics?.email_count?.toLocaleString() || "..."}
                                        trend="Live"
                                        icon={Activity}
                                        graph={<ActivityWaveGraph color="var(--primary)" />}
                                    />
                                    <StatCard
                                        title="Active Alerts"
                                        value={metrics?.unresolved_alerts_count?.toLocaleString() || "..."}
                                        trend="Critical"
                                        icon={AlertTriangle}
                                        graph={<AlertSeverityGraph />}
                                    />
                                    <StatCard
                                        title="Tracked Entities"
                                        value={metrics?.entities_count?.toLocaleString() || "..."}
                                        trend="Operational"
                                        icon={Fingerprint}
                                        graph={<ResourceUsageBar />}
                                    />
                                    <StatCard
                                        title="System Events"
                                        value={metrics?.event_count?.toLocaleString() || "..."}
                                        trend="Synced"
                                        icon={Zap}
                                        graph={<ActivityWaveGraph color="#3b82f6" />}
                                    />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Audit Logs */}
                                    <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/5 bg-neutral-900/20 backdrop-blur-md flex flex-col space-y-4">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <Clock size={16} className="text-primary" />
                                            Neural Activity Log
                                        </h3>
                                        <div className="space-y-4">
                                            {logs.map((log) => (
                                                <div key={log.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                        {log.object_type.slice(0, 2)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium">{log.action.replace(/_/g, ' ')}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {new Date(log.created_at).toLocaleTimeString()} // {log.performed_by}
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] font-mono text-emerald-400">SUCCESS</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Global Nodes */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-neutral-900/20 backdrop-blur-md flex flex-col justify-between">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <Globe size={16} className="text-blue-400" />
                                            Global Node Status
                                        </h3>
                                        <div className="flex-1 flex items-center justify-center py-6">
                                            <div className="w-40 h-40 rounded-full border border-white/10 relative animate-[spin_10s_linear_infinite] flex items-center justify-center">
                                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]" />
                                                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_10px_#06b6d4]" />
                                                <div className="text-xl font-bold font-mono">100%</div>
                                            </div>
                                        </div>
                                        <div className="text-center text-xs text-muted-foreground">
                                            All system modules functioning normally.
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>
        </div>
    )
}

function StatCard({ title, value, trend, icon: Icon, graph }: any) {
    return (
        <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-neutral-900/20 backdrop-blur-md relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                    <div className="text-muted-foreground text-sm font-medium mb-1">{title}</div>
                    <div className="text-3xl font-bold font-mono">{value}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 text-primary">
                    <Icon size={20} />
                </div>
            </div>
            <div className="relative z-10 h-16 mb-2">
                {graph}
            </div>
            <div className="relative z-10 text-[10px] text-emerald-400 font-medium font-mono">
                {trend} <span className="text-muted-foreground">vs last week</span>
            </div>
        </div>
    )
}

function FreightStatCard({ title, value, delta, icon: Icon, status = "primary" }: any) {
    const isUp = delta >= 0
    const colorClasses = {
        primary: "text-primary border-primary/20 bg-primary/5",
        arrived: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
        delayed: "text-red-400 border-red-500/20 bg-red-500/5",
        alert: "text-amber-400 border-amber-500/20 bg-amber-500/5"
    }
    return (
        <div className={cn(
            "glass-panel p-6 rounded-2xl border backdrop-blur-md relative group overflow-hidden",
            colorClasses[status as keyof typeof colorClasses]
        )}>
            <div className="flex justify-between items-start">
                <div>
                    <span className="text-neutral-400 text-xs font-semibold">{title}</span>
                    <h3 className="text-3xl font-bold font-mono mt-2 text-neutral-200">{value}</h3>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                    <Icon size={20} />
                </div>
            </div>
            <div className="flex justify-between items-center text-[10px] mt-4">
                <span className="text-neutral-500">Live operational data</span>
                <span className={cn(
                    "font-mono font-bold",
                    isUp ? "text-emerald-400" : "text-red-400"
                )}>
                    {isUp ? "+" : ""}{delta} today
                </span>
            </div>
        </div>
    )
}

/* Visualization Components */
function ActivityWaveGraph({ color }: { color: string }) {
    return (
        <div className="w-full h-full flex items-end gap-1">
            {[40, 60, 45, 70, 50, 80, 65, 90, 70, 50, 60, 80].map((h, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: i * 0.02, duration: 0.6 }}
                    className="flex-1 rounded-t-sm"
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    )
}

function AlertSeverityGraph() {
    return (
        <div className="w-full h-full flex items-end justify-between px-2">
            {[30, 50, 40, 70, 90, 60].map((h, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: i * 0.02, duration: 0.6 }}
                    className="w-3 bg-gradient-to-t from-blue-500/50 to-blue-400 rounded-t-md"
                />
            ))}
        </div>
    )
}

function ResourceUsageBar() {
    return (
        <div className="w-full h-full flex items-center justify-start gap-3">
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "45%" }}
                    transition={{ duration: 1.2, ease: "circOut" }}
                    className="h-full bg-purple-500 shadow-[0_0_10px_#a855f7]"
                />
            </div>
        </div>
    )
}
