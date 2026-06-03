"use client";

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, XCircle, Clock, RefreshCw, User, Mail, 
  Settings, HelpCircle, ShieldCheck, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getAdminApprovals();
      setApprovals(data);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to fetch approvals queue.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string, action: 'approved' | 'rejected') => {
    if (!confirm(`Are you sure you want to mark this request as ${action}?`)) return;
    
    setActioningId(id);
    try {
      await ApiClient.resolveApproval(id, action);
      setMessage({ type: 'success', text: `Approval request was successfully ${action}.` });
      await fetchApprovals();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Failed to resolve approval: ${err.message || err}` });
    } finally {
      setActioningId(null);
    }
  };

  const getApprovalIcon = (type: string) => {
    switch (type) {
      case 'email_send':
        return <Mail size={16} className="text-primary" />;
      case 'config_change':
        return <Settings size={16} className="text-amber-400" />;
      default:
        return <HelpCircle size={16} className="text-neutral-400" />;
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 text-neutral-100">
      <header className="flex justify-between items-end border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Security Gate</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Approvals Inbox</h1>
        </div>
        <button onClick={fetchApprovals} className="btn btn-sm btn-outline gap-2 text-neutral-300 border-white/10 hover:bg-white/5">
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
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100"><XCircle size={14} /></button>
        </div>
      )}

      {loading && approvals.length === 0 ? (
        <div className="p-12 text-center opacity-50 font-mono text-xs text-neutral-400">Loading pending requests...</div>
      ) : approvals.length === 0 ? (
        <div className="bg-neutral-900/50 p-12 border border-white/5 rounded-2xl text-center max-w-lg mx-auto space-y-4">
          <CheckCircle className="w-10 h-10 mx-auto text-emerald-400/80" />
          <h2 className="text-sm font-bold">No Pending Approvals</h2>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto leading-relaxed">
            All outbound notifications, webhook dispatches, and sensitive actions are clean and authorized.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(approval => {
            const isExpanded = expandedId === approval.id;
            const payload = approval.payload || {};
            
            return (
              <div key={approval.id} className={`bg-neutral-900 border transition-all rounded-2xl overflow-hidden ${
                approval.status === 'pending' ? 'border-amber-500/20' : 'border-white/5'
              }`}>
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : approval.id)}
                  className="p-5 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors select-none"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-xl bg-neutral-950 border border-white/5">
                      {getApprovalIcon(approval.approval_type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-neutral-200">
                          {approval.approval_type === 'email_send' ? 'Outbound Email' : approval.approval_type}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          approval.status === 'pending' ? 'bg-amber-950/40 border border-amber-500/20 text-amber-400' :
                          approval.status === 'approved' ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400' :
                          'bg-red-950/40 border border-red-500/20 text-red-400'
                        }`}>
                          {approval.status.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-neutral-400 mt-1">
                        {payload.subject || `Reference ID: ${approval.target_id}`}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-neutral-500">
                    <div className="text-[10px] text-right">
                      <div className="flex items-center gap-1 text-neutral-400">
                        <User size={10} />
                        <span>By {approval.requested_by}</span>
                      </div>
                      <div className="mt-0.5">{new Date(approval.created_at).toLocaleString()}</div>
                    </div>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-3 border-t border-white/5 bg-neutral-950/40 space-y-4 animate-in fade-in slide-in-from-top-1">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Draft Content Payload</h4>
                      <div className="p-4 rounded-xl bg-neutral-950 border border-white/5 font-mono text-[10px] text-neutral-300 whitespace-pre-wrap leading-relaxed">
                        {approval.approval_type === 'email_send' ? (
                          <>
                            <div className="border-b border-white/5 pb-2 mb-2 space-y-0.5">
                              <div><span className="text-neutral-500">Recipient:</span> {payload.recipient}</div>
                              <div><span className="text-neutral-500">Subject:</span> {payload.subject}</div>
                              <div><span className="text-neutral-500">Mode:</span> {payload.mode}</div>
                            </div>
                            <div>{payload.body}</div>
                          </>
                        ) : (
                          JSON.stringify(payload, null, 2)
                        )}
                      </div>
                    </div>

                    {approval.status === 'pending' && (
                      <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
                        <button 
                          disabled={actioningId !== null}
                          onClick={() => handleResolve(approval.id, 'rejected')} 
                          className="btn btn-sm btn-error btn-outline gap-1"
                        >
                          Reject
                        </button>
                        <button 
                          disabled={actioningId !== null}
                          onClick={() => handleResolve(approval.id, 'approved')} 
                          className="btn btn-sm btn-primary gap-1 text-white"
                        >
                          Approve & Dispatch
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
