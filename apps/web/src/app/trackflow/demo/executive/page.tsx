"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { 
    LayoutDashboard, Activity, Bell, FileText, 
    Ship, MapPin, AlertTriangle, Download, 
    Sparkles, Clock, TrendingUp, BarChart3, Users
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { FreightHeroStrip } from "@/components/freight/FreightKPIs"
import { AlertCard } from "@/components/freight/AlertCards"
import { TrustBanner, FreshnessIndicator } from "@/components/freight/TrustSignals"
import { Button } from "@/components/ui/button"
import { MODULE_IDENTITY } from "@/config/module-identity"

export default function ExecutiveDemoPage() {
    const [summary, setSummary] = useState<any>(null)
    const [alerts, setAlerts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const loadData = async () => {
        setIsLoading(true)
        try {
            ApiClient.setAuth("demo-tenant", "exec-user")
            const [sumData, alertData] = await Promise.all([
                ApiClient.getFreightDashboardSummary(),
                ApiClient.getFreightDashboardAlerts()
            ])
            setSummary(sumData)
            setAlerts(alertData.filter((a: any) => ["critical", "high"].includes(a.severity.toLowerCase())))
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
        <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 space-y-8">
            <header className="flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 text-primary mb-1">
                        <Sparkles size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Executive Insights</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Logistics ROI & Risk Dashboard</h1>
                </div>
                <div className="flex gap-4 items-center">
                    <FreshnessIndicator label="Last Global Sync" timestamp={new Date()} />
                    <TrustBanner status="healthy" />
                </div>
            </header>

            <FreightHeroStrip metrics={summary} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Delayed & At-Risk Section */}
                <div className="md:col-span-2 space-y-6">
                    <section className="space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <AlertTriangle size={18} className="text-red-500" />
                                High-Priority Risk Exceptions
                            </h2>
                            <span className="text-[10px] font-mono opacity-50">Impact: Storage Cost / Demurrage</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {alerts.slice(0, 4).map(alert => (
                                <AlertCard key={alert.id} alert={alert} />
                            ))}
                            {alerts.length === 0 && !isLoading && (
                                <div className="col-span-2 p-12 text-center border border-dashed border-white/10 rounded-2xl opacity-50 italic">
                                    No high-priority risks detected. All shipments tracking within SLA.
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-600/5 border border-primary/20 space-y-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="text-primary" size={24} />
                            <div>
                                <h3 className="font-bold text-lg">Operational Efficiency Analysis</h3>
                                <p className="text-xs text-neutral-400">ROI generated via automated ingestion vs manual entry.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-8 pt-4">
                            <EfficiencyMetric label="Manual Hours Saved" value="142h" delta="+12%" />
                            <EfficiencyMetric label="Demurrage Avoided" value="$12,400" delta="+22%" />
                            <EfficiencyMetric label="Data Accuracy" value="99.8%" delta="+0.4%" />
                        </div>
                    </section>
                </div>

                {/* Right Sidebar: Reports & Trends */}
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <FileText size={16} className="text-emerald-400" />
                            Executive Summaries
                        </h3>
                        <div className="space-y-3">
                            <ReportActionCard title="Weekly Logistics KPI" date="June 1 - June 7" type="PDF" />
                            <ReportActionCard title="Carrier Performance Audit" date="May 2026" type="XLSX" />
                            <ReportActionCard title="Exception Compliance Trail" date="YTD" type="CSV" />
                        </div>
                        <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-xs h-9">Generate New Summary</Button>
                    </div>

                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <BarChart3 size={16} className="text-blue-400" />
                            Movement Volume (24h)
                        </h3>
                        <div className="h-40 flex items-end gap-1.5 px-2">
                            {[40, 65, 30, 85, 45, 90, 55, 70, 40, 80, 50, 95].map((h, i) => (
                                <div key={i} className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t-sm transition-all cursor-pointer group relative" style={{ height: `${h}%` }}>
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-neutral-800 text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        {Math.floor(h * 1.5)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between text-[8px] uppercase font-bold opacity-40 px-1">
                            <span>00:00</span>
                            <span>12:00</span>
                            <span>23:59</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function EfficiencyMetric({ label, value, delta }: any) {
    return (
        <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase opacity-50 block">{label}</span>
            <div className="text-2xl font-black font-mono text-neutral-100">{value}</div>
            <span className="text-[10px] text-emerald-400 font-bold">{delta}</span>
        </div>
    )
}

function ReportActionCard({ title, date, type }: any) {
    return (
        <Link href={`${MODULE_IDENTITY.routePrefix}/reports/rep-772`} className="p-3 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center group cursor-pointer hover:bg-white/10 transition-all">
            <div>
                <div className="text-xs font-bold text-neutral-200">{title}</div>
                <div className="text-[10px] opacity-50">{date}</div>
            </div>
            <div className="text-[9px] font-black px-1.5 py-0.5 rounded bg-neutral-800 border border-white/10 group-hover:border-primary/50 transition-colors">
                {type}
            </div>
        </Link>
    )
}
