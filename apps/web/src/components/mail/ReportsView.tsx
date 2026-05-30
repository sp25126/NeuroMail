"use client"

import { motion } from "framer-motion"
import { BarChart3, FileText, Download, Play, Calendar, Clock, Database, CheckCircle } from "lucide-react"

export function ReportsView() {
    const reportJobs = [
        { id: "1", name: "Weekly Logistics Summary", range: "May 22 - May 29", format: "PDF", size: "2.4 MB", status: "Ready" },
        { id: "2", name: "LFD Demurrage Risks Ledger", range: "May 01 - May 29", format: "XLSX", size: "1.1 MB", status: "Ready" },
        { id: "3", name: "Port Performance Analysis Q2", range: "Apr 01 - Jun 30", format: "PDF", size: "14.8 MB", status: "Processing" },
    ]

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
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500">
                            Reports & Ledgers
                        </h1>
                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <BarChart3 size={14} className="text-emerald-400" />
                            Analytical reports generation engine
                        </p>
                    </div>
                </motion.div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="text-muted-foreground text-sm font-medium mb-1">Total Generated</div>
                        <div className="text-3xl font-bold">42</div>
                    </div>
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="text-muted-foreground text-sm font-medium mb-1">Processing</div>
                        <div className="text-3xl font-bold text-blue-400">1</div>
                    </div>
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="text-muted-foreground text-sm font-medium mb-1">Scheduled</div>
                        <div className="text-3xl font-bold text-purple-400">4</div>
                    </div>
                </div>

                {/* Actions & Job List */}
                <div className="glass-panel rounded-2xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <FileText size={16} className="text-primary" />
                            Recent Report Jobs
                        </h3>
                        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all text-xs">
                            <Play size={12} />
                            Generate New Report
                        </button>
                    </div>
                    <div className="space-y-4">
                        {reportJobs.map((job) => (
                            <div key={job.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                                        <FileText size={18} />
                                    </div>
                                    <div>
                                        <div className="font-medium">{job.name}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                            <Calendar size={12} /> {job.range}
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                            <Clock size={12} /> {job.size}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${job.status === 'Ready' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400 animate-pulse'}`}>
                                        {job.status}
                                    </span>
                                    {job.status === 'Ready' ? (
                                        <button className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors">
                                            <Download size={16} />
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
