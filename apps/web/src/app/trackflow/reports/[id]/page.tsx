"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { 
    FileText, Download, Printer, Share2, 
    ChevronLeft, BarChart3, AlertTriangle, 
    CheckCircle2, Ship, MapPin
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { MODULE_IDENTITY } from "@/config/module-identity"

export default function ReportDetailPage() {
    const params = useParams()
    const [report, setReport] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Mocking report fetch for demo
        setTimeout(() => {
            setReport({
                id: params.id,
                title: `${MODULE_IDENTITY.displayName} — ${MODULE_IDENTITY.features.reports}`,
                period: "June 1 - June 7, 2026",
                generated_at: new Date().toISOString(),
                author: `${MODULE_IDENTITY.displayName} Autonomous Auditor`,
                metrics: [
                    { label: "On-Time Delivery", value: "92.4%", status: "good" },
                    { label: "Avg Port Dwell Time", value: "3.2 Days", status: "warning" },
                    { label: "Carrier Response Rate", value: "98.1%", status: "good" },
                    { label: "Auto-Ingestion Rate", value: "100%", status: "good" }
                ],
                shipments: [
                    { ref: "BOL-9942", carrier: "Maersk", status: "Arrived", origin: "Shanghai", dest: "Long Beach", delay: "0d" },
                    { ref: "BOL-1022", carrier: "MSC", status: "In Transit", origin: "Ningbo", dest: "Rotterdam", delay: "+2d" },
                    { ref: "BOL-4410", carrier: "Hapag-Lloyd", status: "Booked", origin: "Hamburg", dest: "New York", delay: "0d" }
                ],
                summary: "This week saw a 14% increase in container volume from East Asian ports. While on-time performance remains high, dwell times at Long Beach have increased by 0.8 days due to labor shortages at Pier 400. Automated ingestion successfully processed 42 new booking confirmations without manual intervention."
            })
            setIsLoading(false)
        }, 800)
    }, [params.id, params.routePrefix])

    if (isLoading) return <div className="min-h-screen bg-white flex items-center justify-center font-mono text-sm text-neutral-500">Rendering Report...</div>

    return (
        <div className="min-h-screen bg-neutral-100 p-12 flex flex-col items-center">
            {/* Top Toolbar (Non-printable) */}
            <div className="w-full max-w-4xl mb-8 flex justify-between items-center print:hidden">
                <Link href={`${MODULE_IDENTITY.routePrefix}/demo/executive`} className="flex items-center gap-2 text-neutral-500 hover:text-neutral-800 transition-colors text-sm font-bold">
                    <ChevronLeft size={16} /> Back to Dashboard
                </Link>
                <div className="flex gap-2">
                    <Button variant="outline" className="bg-white border-neutral-300 h-9 gap-2 text-xs" onClick={() => window.print()}>
                        <Printer size={14} /> Print to PDF
                    </Button>
                    <Button className="bg-primary hover:opacity-90 h-9 gap-2 text-xs text-white">
                        <Download size={14} /> Export Dataset
                    </Button>
                </div>
            </div>

            {/* The Report Page (A4 Look) */}
            <div className="w-full max-w-4xl bg-white shadow-2xl rounded-sm p-16 space-y-12 text-neutral-900 border border-neutral-200 min-h-[1120px]">
                <header className="flex justify-between items-start border-b-4 border-primary pb-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary">
                            <Ship size={24} strokeWidth={3} />
                            <span className="text-xl font-black tracking-tighter uppercase">{MODULE_IDENTITY.displayName}</span>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight">{report.title}</h1>
                        <div className="text-sm font-bold text-neutral-500 uppercase tracking-widest">{report.period}</div>
                    </div>
                    <div className="text-right text-[10px] font-mono text-neutral-400 space-y-1">
                        <div>Report ID: {report.id}</div>
                        <div>Generated: {new Date(report.generated_at).toLocaleString()}</div>
                        <div>Authorized by: {report.author}</div>
                    </div>
                </header>

                <section className="grid grid-cols-4 gap-8">
                    {report.metrics.map((m: any, i: number) => (
                        <div key={i} className="space-y-1">
                            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-tight">{m.label}</div>
                            <div className="text-3xl font-black text-neutral-800">{m.value}</div>
                            <div className={`text-[10px] font-bold ${m.status === 'good' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {m.status === 'good' ? 'Within SLA' : 'Requires Review'}
                            </div>
                        </div>
                    ))}
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText size={14} /> 
                        Autonomous Narrative Summary
                    </h2>
                    <p className="text-sm leading-relaxed text-neutral-700 bg-neutral-50 p-6 border-l-4 border-neutral-200">
                        {report.summary}
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                        <BarChart3 size={14} />
                        Exception Detail Log
                    </h2>
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                                <th className="p-3 font-black">Reference</th>
                                <th className="p-3 font-black">Carrier</th>
                                <th className="p-3 font-black">Route</th>
                                <th className="p-3 font-black">Status</th>
                                <th className="p-3 font-black">Variance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.shipments.map((s: any, i: number) => (
                                <tr key={i} className="border-b border-neutral-100">
                                    <td className="p-3 font-mono font-bold">{s.ref}</td>
                                    <td className="p-3">{s.carrier}</td>
                                    <td className="p-3 text-neutral-500">{s.origin} → {s.dest}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${
                                            s.status === 'Arrived' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {s.status}
                                        </span>
                                    </td>
                                    <td className={`p-3 font-bold ${s.delay === '0d' ? 'text-neutral-400' : 'text-red-600'}`}>
                                        {s.delay}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                <footer className="pt-12 mt-12 border-t border-neutral-100 flex justify-between items-end">
                    <div className="text-[10px] text-neutral-400 max-w-xs leading-tight">
                        This report is a canonical export of {MODULE_IDENTITY.displayName}'s grounded intelligence ledger. 
                        Data integrity is verified via multi-carrier API cross-referencing.
                    </div>
                    <div className="flex gap-4 opacity-20 grayscale">
                        <CheckCircle2 size={32} />
                        <Ship size={32} />
                    </div>
                </footer>
            </div>
        </div>
    )
}
