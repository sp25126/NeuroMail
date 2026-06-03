import React from "react"
import { motion } from "framer-motion"
import { AlertTriangle, ExternalLink, ArrowRight, Info, HelpCircle } from "lucide-react"

interface AlertCardProps {
  alert: any
  onAction?: (alert: any) => void
}

export function AlertCard({ alert, onAction }: AlertCardProps) {
  const severityColors = {
    critical: "border-red-500/30 bg-red-500/5 text-red-400",
    high: "border-orange-500/30 bg-orange-500/5 text-orange-400",
    medium: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400",
    low: "border-blue-500/30 bg-blue-500/5 text-blue-400",
  }

  const severity = (alert.severity || "medium").toLowerCase() as keyof typeof severityColors

  return (
    <div className={`p-5 rounded-2xl border ${severityColors[severity]} space-y-4 shadow-xl backdrop-blur-md`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${severityColors[severity].replace('border-', 'bg-').replace('/30', '/10')}`}>
            <AlertTriangle size={14} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">{severity} Severity</span>
        </div>
        <span className="text-[10px] opacity-40 font-mono">{new Date(alert.created_at).toLocaleDateString()}</span>
      </div>
      
      <div>
        <h4 className="text-sm font-black text-neutral-100 tracking-tight">{alert.title || alert.alert_type?.replace(/_/g, ' ')}</h4>
        <p className="text-xs mt-1.5 opacity-80 leading-relaxed text-neutral-300">{alert.description || alert.message}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 py-3 border-y border-white/5">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] font-bold text-neutral-500 uppercase tracking-tighter">
            <HelpCircle size={10} /> Root Cause
          </div>
          <div className="text-[10px] font-medium text-neutral-400">Carrier ETA mismatch detected via Terminal49 sync.</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] font-bold text-neutral-500 uppercase tracking-tighter">
            <Info size={10} /> Business Impact
          </div>
          <div className="text-[10px] font-medium text-red-400/80">Potential $450/day demurrage penalty starting tomorrow.</div>
        </div>
      </div>

      <div className="pt-1 flex justify-between items-center">
        <div className="text-[9px] font-bold text-neutral-500 uppercase">
          Suggested: <span className="text-neutral-200">Contact drayage partner</span>
        </div>
        <button 
          onClick={() => onAction?.(alert)}
          className="flex items-center gap-1.5 text-[10px] font-black text-primary hover:opacity-80 transition-opacity uppercase tracking-wider"
        >
          Resolve <ArrowRight size={12} />
        </button>
      </div>
    </div>
  )
}
