"use client";

import React, { useEffect, useState } from 'react';
import { 
  History, RefreshCw, User, Terminal, Calendar, 
  ChevronDown, ChevronUp, Database, Globe
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getAdminAuditLogs();
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      log.action?.toLowerCase().includes(term) ||
      log.actor_id?.toLowerCase().includes(term) ||
      log.target_type?.toLowerCase().includes(term) ||
      log.target_id?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 text-neutral-100">
      <header className="flex justify-between items-end border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <History size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Append-Only Ledger</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Audit Trail</h1>
        </div>
        <button onClick={fetchLogs} className="btn btn-sm btn-outline gap-2 text-neutral-300 border-white/10 hover:bg-white/5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center gap-4">
          <input 
            type="text" 
            placeholder="Search action, actor, or target ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input input-sm bg-neutral-800 border-white/10 text-xs w-full max-w-xs focus:outline-none focus:border-primary text-white" 
          />
          <button onClick={() => {
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(logs, null, 2))}`;
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", jsonString);
            downloadAnchor.setAttribute("download", `freight_audit_trail_${new Date().toISOString().slice(0, 10)}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
          }} className="btn btn-sm btn-outline border-white/10 text-neutral-300 hover:bg-white/5">
            Export JSON
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center opacity-50 font-mono text-xs text-neutral-400">Querying compliance ledger...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs border border-dashed border-white/5 rounded-xl">
            No matching audit logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-neutral-500">
                  <th className="font-bold py-3 text-left">Timestamp</th>
                  <th className="font-bold py-3 text-left">Actor</th>
                  <th className="font-bold py-3 text-left">Action</th>
                  <th className="font-bold py-3 text-left">Target Type</th>
                  <th className="font-bold py-3 text-left">Target ID</th>
                  <th className="font-bold py-3 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map(log => {
                  const isExpanded = expandedId === log.id;
                  
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="py-4 text-neutral-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-4">
                          <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                            log.actor_type === 'system' 
                              ? 'bg-neutral-950 border border-white/5 text-neutral-400' 
                              : 'bg-primary/10 border border-primary/20 text-primary-300'
                          }`}>
                            {log.actor_id}
                          </span>
                        </td>
                        <td className="py-4 font-mono font-bold text-neutral-200">
                          {log.action}
                        </td>
                        <td className="py-4 text-neutral-400">{log.target_type}</td>
                        <td className="py-4 font-mono text-neutral-400">{log.target_id}</td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            className="btn btn-xs btn-ghost text-neutral-400 hover:text-neutral-200 gap-1.5"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            Details
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-neutral-950/40 p-4 border-t border-b border-white/5">
                            <div className="space-y-3">
                              <div className="flex gap-6 text-[10px] text-neutral-400">
                                <div className="flex items-center gap-1">
                                  <Globe size={12} />
                                  <span>IP Address: {log.ip_address || 'Internal/Local'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Terminal size={12} />
                                  <span>User Agent: {log.user_agent || 'System process'}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-neutral-500 uppercase">Context Metadata Payload</span>
                                <pre className="p-3 rounded-lg bg-neutral-950 border border-white/5 text-[10px] font-mono text-neutral-300 overflow-x-auto">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
