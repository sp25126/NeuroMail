import React from "react"
import { Clock, ShieldCheck, Mail, Database, Zap } from "lucide-react"

export function FreshnessIndicator({ timestamp, label }: { timestamp?: string | Date, label: string }) {
  if (!timestamp) return null;
  
  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  let statusColor = "text-emerald-400";
  if (diffMins > 60) statusColor = "text-amber-400";
  if (diffMins > 1440) statusColor = "text-red-400";

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono opacity-80">
      <Clock size={10} className={statusColor} />
      <span>{label}:</span>
      <span className={`font-bold ${statusColor}`}>
        {diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins/60)}h ago`}
      </span>
    </div>
  )
}

export function ProvenanceChip({ source, type }: { source: string, type: "email" | "carrier" | "rule" }) {
  const icons = {
    email: <Mail size={10} />,
    carrier: <Zap size={10} />,
    rule: <ShieldCheck size={10} />
  }
  
  return (
    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-tighter opacity-70">
      {icons[type]}
      {source}
    </div>
  )
}

export function TrustBanner({ status }: { status: "healthy" | "degraded" | "down" }) {
  const configs = {
    healthy: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", label: "Systems Operational" },
    degraded: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", label: "Carrier Sync Delayed" },
    down: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", label: "Ingestion Offline" },
  }

  const config = configs[status];

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${config.bg} ${config.border} ${config.text} text-[10px] font-bold`}>
      <div className={`w-1.5 h-1.5 rounded-full ${status === 'healthy' ? 'bg-emerald-400 animate-pulse' : status === 'degraded' ? 'bg-amber-400' : 'bg-red-400'}`} />
      {config.label}
    </div>
  )
}
