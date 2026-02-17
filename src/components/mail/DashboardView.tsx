"use client"

import { motion } from "framer-motion"
import { Activity, BarChart3, Wifi, Cpu, Globe, Shield, Zap, Database, Clock } from "lucide-react"

export function DashboardView() {
    return (
        <div className="flex-1 h-screen overflow-y-auto p-8 relative scrollbar-hide">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="max-w-5xl mx-auto space-y-8 relative z-10">
                {/* Header Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
                >
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-400 to-purple-600">
                            Neural Command
                        </h1>
                        <p className="text-muted-foreground mt-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            System Online // v2.0.4 Beta
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <StatusBadge icon={Wifi} label="Network" status="Stable" color="text-emerald-400" />
                        <StatusBadge icon={Cpu} label="Core" status="98%" color="text-blue-400" />
                        <StatusBadge icon={Shield} label="Firewall" status="Active" color="text-purple-400" />
                    </div>
                </motion.div>

                {/* Main Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard
                        title="Email Volume"
                        value="1,248"
                        trend="+12%"
                        icon={Activity}
                        delay={0.1}
                        graph={<MockWaveGraph color="var(--primary)" />}
                    />
                    <StatCard
                        title="AI Operations"
                        value="843"
                        trend="+5%"
                        icon={Zap}
                        delay={0.2}
                        graph={<MockBarGraph />}
                    />
                    <StatCard
                        title="Storage"
                        value="45%"
                        trend="Stable"
                        icon={Database}
                        delay={0.3}
                        graph={<MockStorageRing />}
                    />
                </div>

                {/* Lower Section: Recent & World Map */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-[300px]">
                    {/* Activity Log */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Clock size={16} className="text-primary" />
                                Neural Activity Log
                            </h3>
                            <button className="text-xs text-primary/70 hover:text-primary transition-colors">View Full Log</button>
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                        AI
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium">Auto-categorized incoming thread</div>
                                        <div className="text-xs text-muted-foreground">Processed {i * 12} mins ago</div>
                                    </div>
                                    <div className="text-xs font-mono text-emerald-400">COMPLETED</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* System Visualization */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="glass-panel rounded-2xl p-6 flex flex-col relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                        <h3 className="text-lg font-semibold mb-4 relative z-10 flex items-center gap-2">
                            <Globe size={16} className="text-blue-400" />
                            Global Node Status
                        </h3>
                        <div className="flex-1 flex items-center justify-center relative z-10">
                            <div className="w-48 h-48 rounded-full border border-white/10 relative animate-[spin_10s_linear_infinite]">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]" />
                                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_10px_#06b6d4]" />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-2xl font-bold">100%</div>
                            </div>
                        </div>
                        <div className="mt-4 text-center text-xs text-muted-foreground relative z-10">
                            All systems functioning within normal parameters.
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, trend, icon: Icon, delay, graph }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            whileHover={{ scale: 1.02 }}
            className="glass-panel p-6 rounded-2xl relative overflow-hidden group"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                    <div className="text-muted-foreground text-sm font-medium mb-1">{title}</div>
                    <div className="text-3xl font-bold">{value}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 text-primary">
                    <Icon size={20} />
                </div>
            </div>
            <div className="relative z-10 h-16 mb-2">
                {graph}
            </div>
            <div className="relative z-10 text-xs text-emerald-400 font-medium">
                {trend} <span className="text-muted-foreground">vs last week</span>
            </div>
        </motion.div>
    )
}

function StatusBadge({ icon: Icon, label, status, color }: any) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm">
            <Icon size={14} className={color} />
            <div className="flex flex-col leading-none">
                <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
                <span className={`text-xs font-bold ${color}`}>{status}</span>
            </div>
        </div>
    )
}

/* Mock Graphs for Visuals */
function MockWaveGraph({ color }: { color: string }) {
    return (
        <div className="w-full h-full flex items-end gap-1">
            {[40, 60, 45, 70, 50, 80, 65, 90, 70, 50, 60, 80].map((h, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: i * 0.05, duration: 1 }}
                    className="flex-1 bg-primary/20 rounded-t-sm"
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    )
}

function MockBarGraph() {
    return (
        <div className="w-full h-full flex items-end justify-between px-2">
            {[30, 50, 40, 70, 90, 60].map((h, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.8 }}
                    className="w-3 bg-gradient-to-t from-blue-500/50 to-blue-400 rounded-t-md"
                />
            ))}
        </div>
    )
}

function MockStorageRing() {
    return (
        <div className="w-full h-full flex items-center justify-start gap-3">
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "45%" }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className="h-full bg-purple-500 shadow-[0_0_10px_#a855f7]"
                />
            </div>
        </div>
    )
}
