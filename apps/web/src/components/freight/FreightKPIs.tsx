import React from "react"
import { motion } from "framer-motion"
import { Ship, Clock, AlertTriangle, CheckCircle, Mail } from "lucide-react"

interface KPIProps {
  label: string
  value: number | string
  delta?: number
  icon: any
  color: "blue" | "emerald" | "amber" | "red" | "purple"
}

export function KPICard({ label, value, delta, icon: Icon, color }: KPIProps) {
  const colorMap = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  }

  return (
    <div className={`p-4 rounded-xl border ${colorMap[color]} bg-neutral-900/40 backdrop-blur-sm space-y-1`}>
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
        <Icon size={14} className="opacity-70" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono">{value}</span>
        {delta !== undefined && (
          <span className={`text-[10px] font-bold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {delta >= 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
    </div>
  )
}

export function FreightHeroStrip({ metrics }: { metrics: any }) {
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 w-full">
      <KPICard 
        label="In Transit" 
        value={metrics.total_shipments} 
        delta={metrics.total_shipments_delta}
        icon={Ship} 
        color="blue" 
      />
      <KPICard 
        label="Arrived Today" 
        value={metrics.shipments_arrived} 
        delta={metrics.shipments_arrived_delta}
        icon={CheckCircle} 
        color="emerald" 
      />
      <KPICard 
        label="At Risk" 
        value={metrics.shipments_delayed} 
        delta={metrics.shipments_delayed_delta}
        icon={AlertTriangle} 
        color="red" 
      />
      <KPICard 
        label="No Update" 
        value={metrics.shipments_no_update} 
        icon={Clock} 
        color="amber" 
      />
      <KPICard 
        label="Open Alerts" 
        value={Object.values(metrics.alerts_open_by_severity as Record<string, number>).reduce((a, b) => a + b, 0)} 
        delta={metrics.alerts_open_delta}
        icon={AlertTriangle} 
        color="amber" 
      />
      <KPICard 
        label="Quarantined" 
        value={metrics.quarantine_count} 
        icon={Mail} 
        color="purple" 
      />
    </div>
  )
}
