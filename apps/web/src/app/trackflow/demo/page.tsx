"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Sparkles, Ship, ArrowRight, CheckCircle2, 
    Zap, Shield, Globe, Clock, Layout, 
    Bot, BarChart3, AlertTriangle, Share2, 
    Code, Play, Terminal, Database, Loader2,
    Check, X, Settings, RefreshCw
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { DemoReadiness } from "@/components/freight/DemoReadiness"
import { TrustBanner, FreshnessIndicator } from "@/components/freight/TrustSignals"
import { MODULE_IDENTITY } from "@/config/module-identity"
import Link from "next/link"

interface SummaryMetrics {
    total_shipments: number
    shipments_arrived: number
    at_risk: number
    alerts_unresolved: number
}

export default function FreightDemoWalkthrough() {
    const [activeSection, setActiveSection] = useState(0)
    const [tenantId, setTenantId] = useState("demo-tenant")
    const [metrics, setMetrics] = useState<SummaryMetrics | null>(null)
    const [shipments, setShipments] = useState<any[]>([])
    const [alerts, setAlerts] = useState<any[]>([])
    const [reports, setReports] = useState<any[]>([])
    const [quarantine, setQuarantine] = useState<any[]>([])
    const [readiness, setReadiness] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [copied, setCopied] = useState(false)
    const [selectedShipmentDetail, setSelectedShipmentDetail] = useState<any>(null)

    const fetchData = async () => {
        setIsLoading(true)
        try {
            ApiClient.setAuth(tenantId, "demo-admin")
            const [sumData, shipData, alertData, reportData, qData, readyData] = await Promise.all([
                ApiClient.getFreightDashboardSummary().catch(() => null),
                ApiClient.getFreightDashboardShipments().catch(() => []),
                ApiClient.getFreightDashboardAlerts().catch(() => []),
                ApiClient.getFreightDashboardReports().catch(() => []),
                ApiClient.getFreightDashboardQuarantine().catch(() => []),
                ApiClient.getFreightDemoReadiness().catch(() => null)
            ])

            setMetrics(sumData)
            setShipments(shipData)
            setAlerts(alertData)
            setReports(reportData)
            setQuarantine(qData)
            setReadiness(readyData)

            if (shipData.length > 0) {
                const detail = await ApiClient.getFreightDashboardShipmentDetail(shipData[0].id).catch(() => null)
                setSelectedShipmentDetail(detail)
            }
        } catch (err) {
            console.error("Fetch failed", err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [tenantId])

    const handleCopy = () => {
        navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const sections = [
        {
            title: "Phase 1: Ingestion Engine",
            icon: Zap,
            color: "text-amber-400",
            description: `The "brain" that listens to your inbox. It uses LLM extraction to turn messy carrier emails into structured data without any manual data entry.`,
            features: ["Auto-mapping of BOL/Container numbers", "Semantic parsing of delivery dates", "Sender whitelisting & validation"],
            data: { label: "Ingested Emails", value: metrics?.total_shipments || 0, trend: "+12% this week" }
        },
        {
            title: "Phase 2: Global Visibility",
            icon: Globe,
            color: "text-blue-400",
            description: "Once ingested, shipments are tracked in real-time via carrier APIs. No more checking 10 different carrier portals manually.",
            features: ["Multi-carrier sync (Maersk, MSC, etc.)", "Terminal telemetry integration", "Historical milestone logging"],
            data: { label: "Live Shipments", value: shipments.length, trend: "98% tracking accuracy" }
        },
        {
            title: "Phase 3: Risk Intelligence",
            icon: AlertTriangle,
            color: "text-red-400",
            description: "Autonomous rules evaluate every shipment. If a container is stuck at port or missing a milestone, an alert is raised before costs accrue.",
            features: ["Demurrage risk detection", "No-update timeout alerts", "Rule-based escalation logic"],
            data: { label: "Active Alerts", value: alerts.filter(a => a.status === 'OPEN').length, trend: "4 critical items" }
        },
        {
            title: "Phase 4: Operations Copilot",
            icon: Bot,
            color: "text-purple-400",
            description: "An AI interface that understands your logistics ledger. Ask questions, generate reports, and draft carrier emails in natural language.",
            features: ["Grounded AI query engine", "Automated report scheduling", "Carrier update drafting"],
            data: { label: "Copilot Actions", value: "24", trend: "Last 24h" }
        },
        {
            title: "Safety Valve: Quarantine",
            icon: Shield,
            color: "text-emerald-400",
            description: `The operational safety valve where malformed or ambiguous ${MODULE_IDENTITY.shortName} notification emails are quarantined for manual operator mapping.`,
            features: ["Manual override tools", "Pattern learning loops", "No data loss guarantee"],
            data: { label: "Pending Review", value: quarantine.length, trend: "System learning..." }
        }
    ]

    const handleSelectShipment = async (shipmentId: string) => {
        try {
            const detail = await ApiClient.getFreightDashboardShipmentDetail(shipmentId)
            setSelectedShipmentDetail(detail)
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent_50%)] pointer-events-none" />
            <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none" />

            {/* Top Showcase Bar */}
            <header className="border-b border-white/5 bg-neutral-900/60 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 z-20">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white shadow-lg">
                        <Sparkles size={16} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-none tracking-tight">{MODULE_IDENTITY.displayName}</h1>
                        <span className="text-[10px] text-primary font-mono uppercase tracking-widest">Client Showcase Portal</span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <nav className="hidden md:flex gap-4">
                        <Link href={`${MODULE_IDENTITY.routePrefix}/demo/executive`} className="text-[10px] font-bold uppercase text-neutral-400 hover:text-white transition-colors">Executive view</Link>
                        <Link href={`${MODULE_IDENTITY.routePrefix}/demo/operator`} className="text-[10px] font-bold uppercase text-neutral-400 hover:text-white transition-colors">Operator view</Link>
                        <Link href={`${MODULE_IDENTITY.routePrefix}/admin/config`} className="text-[10px] font-bold uppercase text-neutral-400 hover:text-white transition-colors">Config</Link>
                    </nav>

                    <div className="h-6 w-[1px] bg-white/10 hidden md:block" />

                    <div className="flex items-center gap-3">
                        <button onClick={handleCopy} className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition-colors">
                            {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Share2 size={14} />}
                        </button>
                        <label className="text-[10px] text-neutral-400 font-mono uppercase">Tenant:</label>
                        <input 
                            type="text" 
                            value={tenantId}
                            onChange={(e) => setTenantId(e.target.value)}
                            className="bg-neutral-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-primary/50 font-mono w-32"
                        />
                        <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-500">
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
                {/* Left Column: Flow & Story */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="space-y-2">
                        <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Modern Operations</h2>
                        <p className="text-3xl font-black leading-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-neutral-500">
                            The Autonomous {MODULE_IDENTITY.entitySingular} Ledger.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {sections.map((s, i) => (
                            <motion.div
                                key={i}
                                onClick={() => setActiveSection(i)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                    activeSection === i 
                                    ? 'bg-white/5 border-white/10 shadow-xl' 
                                    : 'border-transparent opacity-40 hover:opacity-100 hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg bg-neutral-900 ${s.color}`}>
                                        <s.icon size={20} />
                                    </div>
                                    <span className="font-bold text-sm">{s.title}</span>
                                    {activeSection === i && <motion.div layoutId="active-dot" className="w-1.5 h-1.5 rounded-full bg-primary ml-auto" />}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="pt-8">
                        <DemoReadiness readiness={readiness} />
                    </div>
                </div>

                {/* Center Column: Live Data Explorer */}
                <div className="lg:col-span-8 space-y-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeSection}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-8"
                        >
                            {/* Section Detail */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold">{sections[activeSection].title}</h3>
                                    <p className="text-sm text-neutral-400 leading-relaxed">
                                        {sections[activeSection].description}
                                    </p>
                                    <ul className="space-y-2">
                                        {sections[activeSection].features.map((f, i) => (
                                            <li key={i} className="flex items-center gap-2 text-xs text-neutral-300">
                                                <CheckCircle2 size={12} className="text-emerald-500" />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-neutral-900 border border-white/5 rounded-3xl p-8 flex flex-col items-center justify-center space-y-2 shadow-2xl relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{sections[activeSection].data.label}</span>
                                    <span className="text-5xl font-black font-mono text-white">{sections[activeSection].data.value}</span>
                                    <span className="text-[10px] text-emerald-400 font-bold">{sections[activeSection].data.trend}</span>
                                </div>
                            </div>

                            {/* Section Specific Visualizer */}
                            <div className="bg-neutral-900/50 border border-white/5 rounded-3xl overflow-hidden min-h-[500px]">
                                {activeSection === 0 && (
                                    <div className="p-8 space-y-6">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-sm font-bold flex items-center gap-2">
                                                <Terminal size={14} className="text-primary" />
                                                LLM Extraction Stream
                                            </h4>
                                            <span className="text-[10px] font-mono text-neutral-600">Model: GPT-4o-logistics</span>
                                        </div>
                                        <div className="space-y-4">
                                            <ExtractionCodeBlock 
                                                input="Subject: ARRIVAL NOTICE: MAERSK HALIFAX / CONTAINER MRKU1234567"
                                                output={{
                                                    shipment_ref: "MRKU1234567",
                                                    carrier: "MAERSK",
                                                    vessel: "MAERSK HALIFAX",
                                                    event_type: "ARRIVAL_NOTICE",
                                                    confidence: 0.99
                                                }}
                                            />
                                            <div className="flex items-center justify-center py-4">
                                                <div className="h-px bg-white/5 flex-1" />
                                                <span className="px-4 text-[10px] font-mono text-neutral-700 uppercase">Live Pipeline Audit</span>
                                                <div className="h-px bg-white/5 flex-1" />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {quarantine.slice(0, 2).map((q, i) => (
                                                    <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                                                        <div className="flex justify-between">
                                                            <span className="text-[10px] font-mono text-neutral-500">{q.provider_message_id.slice(0, 12)}</span>
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase">Needs Review</span>
                                                        </div>
                                                        <p className="text-[10px] text-neutral-400 line-clamp-2 italic">"{q.fail_reason}"</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeSection === 1 && (
                                    <div className="flex flex-col h-full">
                                        <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                                            <div className="flex gap-2">
                                                <button className="px-3 py-1 rounded bg-primary text-[10px] font-bold">List View</button>
                                                <button className="px-3 py-1 rounded hover:bg-white/5 text-[10px] font-bold text-neutral-500">Map Mode</button>
                                            </div>
                                            <FreshnessIndicator timestamp={new Date()} label="Milestone Refresh" />
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-white/5 text-neutral-500">
                                                        <th className="p-4 font-bold uppercase tracking-widest">Reference</th>
                                                        <th className="p-4 font-bold uppercase tracking-widest">Carrier</th>
                                                        <th className="p-4 font-bold uppercase tracking-widest">Status</th>
                                                        <th className="p-4 font-bold uppercase tracking-widest">Location</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {shipments.slice(0, 8).map((s, i) => (
                                                        <tr key={i} onClick={() => handleSelectShipment(s.id)} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                                                            <td className="p-4 font-mono font-bold text-primary">{s.primary_reference}</td>
                                                            <td className="p-4">{s.carrier}</td>
                                                            <td className="p-4">
                                                                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase font-bold">{s.last_known_status}</span>
                                                            </td>
                                                            <td className="p-4 text-neutral-400">{s.destination_port || 'Unknown'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {activeSection === 2 && (
                                    <div className="p-8 space-y-6">
                                        <h4 className="text-sm font-bold">Unresolved Exception Queue</h4>
                                        <div className="space-y-4">
                                            {alerts.map((a, i) => (
                                                <div key={i} className="flex items-start gap-4 p-5 rounded-2xl border border-red-500/20 bg-red-500/5">
                                                    <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
                                                        <AlertTriangle size={18} />
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex justify-between">
                                                            <h5 className="font-bold text-xs uppercase tracking-tight">{a.alert_type.replace(/_/g, ' ')}</h5>
                                                            <span className="text-[10px] font-mono opacity-50">{new Date(a.created_at).toLocaleTimeString()}</span>
                                                        </div>
                                                        <p className="text-[11px] text-red-200/80 leading-relaxed">{a.message}</p>
                                                        <div className="pt-2 flex gap-2">
                                                            <button className="px-2 py-1 rounded bg-red-500 text-white text-[9px] font-bold">ACKNOWLEDGE</button>
                                                            <button className="px-2 py-1 rounded bg-white/5 text-neutral-400 text-[9px] font-bold">VIEW {MODULE_IDENTITY.entitySingular.toUpperCase()}</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {alerts.length === 0 && (
                                                <div className="text-center py-20 opacity-30 italic">No active risk triggers.</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeSection === 3 && (
                                    <div className="p-8 space-y-6 h-full flex flex-col">
                                        <div className="flex-1 flex flex-col md:flex-row gap-8">
                                            <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 flex flex-col">
                                                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Bot size={16} className="text-purple-400" />
                                                        <span className="text-xs font-bold">{MODULE_IDENTITY.copilotName}</span>
                                                    </div>
                                                    <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase">Grounded</div>
                                                </div>
                                                <div className="flex-1 p-4 text-[11px] font-mono space-y-4">
                                                    <div className="text-neutral-500">Query: Show all {MODULE_IDENTITY.entityPlural.toLowerCase()} arriving in Long Beach this week with status 'Stuck'.</div>
                                                    <div className="text-purple-300 bg-purple-500/10 p-3 rounded-lg border border-purple-500/20 leading-relaxed">
                                                        Based on your ledger, 2 {MODULE_IDENTITY.entityPlural.toLowerCase()} matching your criteria were found. BOL-4491 is currently delayed by 3 days. Would you like me to draft an update to the carrier?
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="w-full md:w-64 space-y-4">
                                                <h4 className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Active Schedules</h4>
                                                {reports.map((r, i) => (
                                                    <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                                                        <BarChart3 size={14} className="text-emerald-400" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] font-bold truncate">{r.report_type}</div>
                                                            <div className="text-[9px] text-neutral-500">{r.cron_expression || 'On Demand'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeSection === 4 && (
                                    <div className="p-8 space-y-6">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-sm font-bold flex items-center gap-2">
                                                <Shield size={14} className="text-emerald-400" />
                                                {MODULE_IDENTITY.displayName} Quarantine Safety Valve
                                            </h4>
                                            <span className="text-[10px] font-mono text-neutral-600">Pending Human Review: {quarantine.length}</span>
                                        </div>
                                        <div className="space-y-3">
                                            {quarantine.map((q, i) => (
                                                <div key={i} className="p-4 rounded-xl border border-white/10 bg-neutral-900 flex justify-between items-center group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2 rounded bg-white/5 text-neutral-500">
                                                            <Clock size={14} />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-mono font-bold text-neutral-200">{q.provider_message_id.slice(0, 20)}...</div>
                                                            <div className="text-[10px] text-red-400 italic mt-0.5">{q.fail_reason}</div>
                                                        </div>
                                                    </div>
                                                    <button className="px-3 py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                                                        <Layout size={12} /> Map Reference
                                                    </button>
                                                </div>
                                            ))}
                                            {quarantine.length === 0 && (
                                                <div className="text-center py-20 border border-dashed border-white/5 rounded-2xl opacity-20">
                                                    No quarantined items found. System operating at 100% autonomy.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>

            {/* Footer Showcase Link */}
            <footer className="border-t border-white/5 bg-black/40 p-12 mt-12">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center text-neutral-500">
                            <Ship size={20} />
                        </div>
                        <div>
                            <div className="font-bold text-sm">Modernize Your Operations.</div>
                            <p className="text-xs text-neutral-500">Full autonomy from inbox to dashboard.</p>
                        </div>
                    </div>
                    <Button onClick={() => window.location.href = '/mail'} className="bg-primary hover:opacity-90 gap-2 h-11 px-8 rounded-full font-bold text-white shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] transition-all hover:scale-105">
                        Back to Primary App <ArrowRight size={16} />
                    </Button>
                </div>
            </footer>
        </div>
    )
}

function ExtractionCodeBlock({ input, output }: any) {
    return (
        <div className="rounded-xl overflow-hidden border border-white/5 bg-black/60 font-mono text-[10px]">
            <div className="p-3 bg-white/5 border-b border-white/5 text-neutral-400">EMAIL_INPUT</div>
            <div className="p-3 text-neutral-300">{input}</div>
            <div className="p-3 bg-white/5 border-b border-t border-white/5 text-primary">LLM_EXTRACTION_SUCCESS</div>
            <div className="p-3 text-emerald-400">
                <pre>{JSON.stringify(output, null, 2)}</pre>
            </div>
        </div>
    )
}
