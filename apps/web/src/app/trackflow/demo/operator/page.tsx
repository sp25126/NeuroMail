"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Activity, Bell, Mail, Ship, MapPin, 
    ChevronRight, Loader2, Sparkles, Inbox, Clock,
    Search, Filter, ArrowUpRight, X
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { FreightHeroStrip } from "@/components/freight/FreightKPIs"
import { ProvenanceChip, FreshnessIndicator } from "@/components/freight/TrustSignals"
import { FreightCopilot } from "@/components/freight/FreightCopilot"
import { Button } from "@/components/ui/button"

export default function OperatorDemoPage() {
    const [summary, setSummary] = useState<any>(null)
    const [shipments, setShipments] = useState<any[]>([])
    const [quarantine, setQuarantine] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showCopilot, setShowCopilot] = useState(false)

    const loadData = async () => {
        setIsLoading(true)
        try {
            ApiClient.setAuth("demo-tenant", "operator-user")
            const [sumData, shipData, quarData] = await Promise.all([
                ApiClient.getFreightDashboardSummary(),
                ApiClient.getFreightDashboardShipments(),
                ApiClient.getFreightDashboardQuarantine()
            ])
            setSummary(sumData)
            setShipments(shipData)
            setQuarantine(quarData)
        } catch (err) {
            console.error(err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 space-y-6 relative overflow-hidden">
            <header className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2 text-primary mb-1">
                        <Activity size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Operational Command</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Logistics Ingestion & Tracking</h1>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="text-xs h-9 border-white/10 gap-2 text-neutral-300">
                        <Filter size={14} /> Active Filters
                    </Button>
                    <Button onClick={() => setShowCopilot(true)} className="bg-primary text-xs h-9 gap-2 text-white">
                        <Sparkles size={14} /> AI Copilot
                    </Button>
                </div>
            </header>

            <FreightHeroStrip metrics={summary} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Active shipments main table */}
                <div className="md:col-span-2 space-y-4">
                    <div className="bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden text-neutral-100">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-neutral-900/50">
                            <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                                <Ship size={16} className="text-blue-400" />
                                Active Logistics Pipeline
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={12} />
                                <input 
                                    type="text" 
                                    placeholder="Search references..." 
                                    className="bg-neutral-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[10px] w-48 focus:outline-none focus:border-primary/50 text-white"
                                />
                            </div>
                        </div>
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-neutral-900/20 text-neutral-400 border-b border-white/5">
                                    <th className="p-4">Primary Ref</th>
                                    <th className="p-4">Origin/Dest</th>
                                    <th className="p-4">Last Status</th>
                                    <th className="p-4">Provenance</th>
                                    <th className="p-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shipments.map((s) => (
                                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="p-4 font-mono font-bold text-neutral-200">{s.primary_reference}</td>
                                        <td className="p-4 opacity-70 flex items-center gap-1">
                                            {s.origin_port} <ChevronRight size={10} /> {s.destination_port}
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[9px] uppercase">
                                                {s.last_known_status?.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <ProvenanceChip source={s.status_source === 'carrier' ? 'Terminal49' : 'Email extraction'} type={s.status_source === 'carrier' ? 'carrier' : 'email'} />
                                        </td>
                                        <td className="p-4">
                                            <button className="text-primary hover:underline font-bold flex items-center gap-1">
                                                Inspect <ArrowUpRight size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Sidebar: Quarantine & Sync Status */}
                <div className="space-y-6 text-neutral-100">
                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
                        <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                            <Mail size={16} className="text-purple-400" />
                            Quarantine (Needs Mapping)
                        </h3>
                        <div className="space-y-3">
                            {quarantine.slice(0, 3).map(q => (
                                <div key={q.id} className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">Extraction Failure</span>
                                        <span className="text-[9px] opacity-40 font-mono">2h ago</span>
                                    </div>
                                    <div className="text-xs font-semibold truncate text-neutral-200">{q.subject}</div>
                                    <button className="w-full py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold transition-colors">
                                        Map Manually
                                    </button>
                                </div>
                            ))}
                            {quarantine.length === 0 && (
                                <div className="text-center py-8 text-neutral-500 italic text-xs">No items requiring manual mapping.</div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
                        <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                            <Clock size={16} className="text-amber-400" />
                            Integration Freshness
                        </h3>
                        <div className="space-y-4">
                            <FreshnessIndicator label="Email Ingestion" timestamp={new Date(Date.now() - 420000)} />
                            <FreshnessIndicator label="Terminal49 API" timestamp={new Date(Date.now() - 3600000)} />
                            <FreshnessIndicator label="Project44 Sync" timestamp={new Date(Date.now() - 7200000)} />
                        </div>
                        <Button variant="outline" className="w-full text-[10px] h-8 border-white/10 hover:bg-white/5 text-neutral-400">
                            Trigger Full Resync
                        </Button>
                    </div>
                </div>
            </div>

            {/* AI Copilot Drawer */}
            <AnimatePresence>
                {showCopilot && (
                    <motion.div 
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-[400px] z-50 bg-neutral-950 border-l border-white/10 shadow-2xl p-6"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Sparkles size={18} className="text-primary" />
                                Grounded Assistant
                            </h3>
                            <button onClick={() => setShowCopilot(false)} className="p-2 hover:bg-white/5 rounded-full text-neutral-400">
                                <X size={18} />
                            </button>
                        </div>
                        <FreightCopilot />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
