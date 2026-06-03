"use client";

import React, { useState, useEffect } from 'react';
import { 
  AlertOctagon, RefreshCw, Play, ShieldAlert, CheckCircle2, 
  Trash2, AlertTriangle, Eye, X, BellOff, RefreshCcw
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';

export default function RecoveryPage() {
  const [quarantined, setQuarantined] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Modal for previewing quarantine email body
  const [previewEmail, setPreviewEmail] = useState<any | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // In api-client: getFreightDashboardQuarantine maps to /freight/quarantine via helper (actually /freight/dashboard/quarantine or /freight/quarantine)
      // Let's call /freight/quarantine directly using request just in case
      const [quarantineData, failuresData] = await Promise.all([
        ApiClient.getFreightDashboardQuarantine(),
        ApiClient.getAdminFailures()
      ]);
      setQuarantined(quarantineData || []);
      setFailures(failuresData || []);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to retrieve recovery telemetry.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReplay = async (id: string) => {
    if (!confirm('Are you sure you want to replay this email to the parsing pipeline?')) return;
    
    setActioningId(id);
    try {
      await ApiClient.replayQuarantine(id);
      setMessage({ type: 'success', text: 'Email successfully queued for parsing.' });
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Replay failed: ${err.message || err}` });
    } finally {
      setActioningId(null);
    }
  };

  const handleForceResync = async () => {
    const tenantId = prompt('Enter Tenant ID to force a full tracking sync:');
    if (!tenantId) return;
    
    setLoading(true);
    try {
      await ApiClient.fullResyncTenant(tenantId);
      setMessage({ type: 'success', text: `Triggered full tracking sync for tenant ${tenantId}.` });
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Force sync failed: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  const handlePauseNotifications = async () => {
    const tenantId = prompt('Enter Tenant ID to pause notifications:');
    if (!tenantId) return;
    
    if (!confirm(`Are you sure you want to pause all outbound alert notifications for tenant ${tenantId}?`)) return;

    setLoading(true);
    try {
      await ApiClient.pauseNotifications(tenantId);
      setMessage({ type: 'success', text: `Paused outbound alert notifications for tenant ${tenantId}.` });
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Failed to pause notifications: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 text-neutral-100">
      <header className="flex justify-between items-end border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <ShieldAlert size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Resilience Console</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Manual Recovery & Operations</h1>
        </div>
        <button onClick={fetchData} className="btn btn-sm btn-outline gap-2 text-neutral-300 border-white/10 hover:bg-white/5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {message && (
        <div className={`p-4 rounded-xl flex justify-between items-center text-xs font-medium border ${
          message.type === 'success' 
            ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' 
            : 'bg-red-950/20 border-red-500/20 text-red-300'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {loading && quarantined.length === 0 && failures.length === 0 ? (
        <div className="p-12 text-center opacity-50 font-mono text-xs text-neutral-400">Querying dead-letter items and review queues...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left panel: Quarantine Review Queue */}
          <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-neutral-200">
                <AlertTriangle size={16} className="text-amber-500" />
                Raw Email Quarantine Queue
              </h2>
              <span className="px-2 py-0.5 rounded bg-neutral-950 text-[10px] font-mono border border-white/5 text-neutral-400">
                {quarantined.length} Items
              </span>
            </div>

            {quarantined.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 text-xs border border-dashed border-white/5 rounded-xl">
                Review queue is clear. No quarantined emails.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-neutral-500 text-left">
                      <th className="pb-3">Sender</th>
                      <th className="pb-3">Subject</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {quarantined.map(email => (
                      <tr key={email.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 font-medium text-neutral-300 max-w-[120px] truncate">{email.sender}</td>
                        <td className="py-3 text-neutral-400 max-w-[200px] truncate">{email.subject}</td>
                        <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                          <button 
                            onClick={() => setPreviewEmail(email)}
                            className="btn btn-xs btn-ghost text-neutral-400 hover:text-neutral-200"
                          >
                            <Eye size={12} />
                          </button>
                          <button 
                            disabled={actioningId === email.id}
                            onClick={() => handleReplay(email.id)}
                            className="btn btn-xs btn-primary text-white gap-1"
                          >
                            {actioningId === email.id ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}
                            Replay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right panel: Jobs Failures */}
          <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-neutral-200">
                <AlertOctagon size={16} className="text-red-500" />
                Worker Job Failures Log
              </h2>
              <span className="px-2 py-0.5 rounded bg-neutral-950 text-[10px] font-mono border border-white/5 text-neutral-400">
                {failures.length} Failures
              </span>
            </div>

            {failures.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 text-xs border border-dashed border-white/5 rounded-xl">
                No active worker job failures recorded.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-neutral-500 text-left">
                      <th className="pb-3">Job Type</th>
                      <th className="pb-3">Target Reference</th>
                      <th className="pb-3 text-left">Error Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-neutral-400">
                    {failures.map(fail => (
                      <tr key={fail.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 font-mono font-bold text-neutral-300">{fail.job_type}</td>
                        <td className="py-3 font-mono">{fail.target_id}</td>
                        <td className="py-3 text-red-400 text-left truncate max-w-[200px]" title={fail.error_message}>
                          {fail.error_message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom section: Administrative Recovery Tools */}
      <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-neutral-200 border-b border-white/5 pb-3">
          Global Administrative Resiliency Actions
        </h2>
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={handleForceResync}
            className="btn btn-sm btn-outline gap-1.5 border-white/10 text-neutral-300 hover:bg-white/5"
          >
            <RefreshCcw size={14} />
            Force Full Tenant Resync
          </button>
          <button 
            onClick={handlePauseNotifications}
            className="btn btn-sm btn-outline btn-error gap-1.5"
          >
            <BellOff size={14} />
            Pause Outbound Notifications
          </button>
        </div>
        <p className="text-[10px] text-neutral-500">
          Note: Executing any resilience override actions writes permanently to the compliance audit log.
        </p>
      </div>

      {/* Email Body Preview Modal */}
      {previewEmail && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-2xl w-full text-neutral-100 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <button onClick={() => setPreviewEmail(null)} className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300">
              <X size={18} />
            </button>
            <div className="border-b border-white/5 pb-4 mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Quarantine Detail View</span>
              <h3 className="text-base font-bold mt-1">{previewEmail.subject}</h3>
              <div className="flex gap-4 mt-2 text-[10px] text-neutral-400">
                <div>From: {previewEmail.sender}</div>
                <div>Received: {new Date(previewEmail.received_at).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 rounded-xl bg-neutral-950 border border-white/5 font-mono text-[10px] text-neutral-300 whitespace-pre-wrap leading-relaxed max-h-[50vh]">
              {previewEmail.body || 'No text body content.'}
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-white/5 mt-4">
              <button onClick={() => setPreviewEmail(null)} className="btn btn-sm btn-outline border-white/10 text-neutral-400 hover:bg-white/5">
                Close
              </button>
              <button 
                onClick={() => {
                  handleReplay(previewEmail.id);
                  setPreviewEmail(null);
                }} 
                className="btn btn-sm btn-primary text-white"
              >
                Replay to Parser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
