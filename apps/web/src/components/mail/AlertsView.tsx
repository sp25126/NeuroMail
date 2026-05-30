"use client"

import { motion } from "framer-motion"
import { Bell, AlertTriangle, AlertCircle, CheckCircle, Search, Filter, ShieldAlert, Radio } from "lucide-react"

export function AlertsView() {
    const alerts = [
        { id: "1", title: "Port Congestion Alert - LAX", message: "Average waiting time increased by 24h for terminal T4.", type: "warning", time: "10 mins ago", status: "Active" },
        { id: "2", title: "LFD Warning - Container FSCU8873612", message: "Last Free Day is tomorrow. Demurrage charges apply after 17:00.", type: "danger", time: "1 hour ago", status: "Critical" },
        { id: "3", title: "Customs Hold Released", message: "Container NYKU7762150 has been cleared at port of Seattle.", type: "success", time: "3 hours ago", status: "Resolved" },
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
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-orange-400 to-yellow-500">
                            Neural Alerts
                        </h1>
                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <Radio size={14} className="text-red-400 animate-pulse" />
                            Monitoring 3 pipelines // 2 active alerts
                        </p>
                    </div>
                </motion.div>

                {/* Search & Filter Header */}
                <div className="flex gap-4 p-4 rounded-xl glass border border-white/5">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Filter alerts..."
                            className="w-full bg-white/5 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-sm hover:bg-white/10 transition-colors">
                        <Filter size={16} />
                        Filters
                    </button>
                </div>

                {/* Alerts List */}
                <div className="space-y-4">
                    {alerts.map((alert, index) => {
                        const Icon = alert.type === "danger" ? AlertCircle : alert.type === "warning" ? AlertTriangle : CheckCircle
                        const colorMap = {
                            danger: "border-red-500/20 bg-red-500/5 text-red-400",
                            warning: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400",
                            success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                        }
                        return (
                            <motion.div
                                key={alert.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className={`flex items-start gap-4 p-5 rounded-2xl border backdrop-blur-md ${colorMap[alert.type as keyof typeof colorMap]}`}
                            >
                                <div className="p-2 rounded-xl bg-white/5">
                                    <Icon size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-semibold text-foreground">{alert.title}</h3>
                                        <span className="text-xs text-muted-foreground">{alert.time}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                                    <div className="flex gap-2 mt-3">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 uppercase tracking-wider">{alert.status}</span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 uppercase tracking-wider">Freight System</span>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
