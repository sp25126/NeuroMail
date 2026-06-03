import React from "react"
import { CheckCircle, XCircle, AlertCircle, Sparkles } from "lucide-react"

export function DemoReadiness({ readiness }: { readiness: any }) {
  if (!readiness) return null;

  return (
    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          Demo Readiness Score
        </h3>
        <div className="text-2xl font-black font-mono text-primary">{readiness.score}%</div>
      </div>

      <div className="space-y-2">
        <ReadinessRow label="Mailbox Connection" ok={readiness.mailbox_ok} />
        <ReadinessRow label="Carrier Sync Active" ok={readiness.sync_ok} />
        <ReadinessRow label="Reports Generated" ok={readiness.report_ok} />
        <ReadinessRow label="Alert Scenarios Seeded" ok={readiness.alert_ok} />
        <ReadinessRow label="Safety (Quarantine) Ready" ok={readiness.quarantine_ok} />
      </div>

      {readiness.notes.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          <span className="text-[10px] font-bold uppercase opacity-50">Action Items:</span>
          {readiness.notes.map((note: string, i: number) => (
            <p key={i} className="text-xs text-amber-400 flex gap-2">
              <AlertCircle size={12} className="shrink-0" />
              {note}
            </p>
          ))}
        </div>
      )}

      {readiness.is_ready ? (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold text-center">
          Showcase Ready: High Confidence Data
        </div>
      ) : (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center">
          Not Ready: Missing Storytelling Data
        </div>
      )}
    </div>
  )
}

function ReadinessRow({ label, ok }: { label: string, ok: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="opacity-70">{label}</span>
      {ok ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-red-500" />}
    </div>
  )
}
