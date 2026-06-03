"use client";

import React, { useEffect, useState } from 'react';
import { 
  Activity, RefreshCw, Server, Database, Layers, 
  CheckCircle, AlertTriangle, AlertCircle, Clock
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';

export default function AdminHealthPage() {
  const [health, setHealth] = useState<any>(null);
  const [dependencies, setDependencies] = useState<any>(null);
  const [jobs, setJobs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchHealthData();
  }, []);

  const fetchHealthData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [healthData, depData, jobsData] = await Promise.all([
        ApiClient.getFreightAdminHealth(),
        ApiClient.getHealthDependencies(),
        ApiClient.getAdminJobs()
      ]);
      setHealth(healthData);
      setDependencies(depData);
      setJobs(jobsData);
    } catch (e: any) {
      console.error(e);
      setMessage('Subsystems unreachable. Check API orchestrator connectivity.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'ok' || s === 'healthy' || s === 'online') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ONLINE
        </span>
      );
    }
    if (s === 'degraded' || s === 'warning') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          DEGRADED
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        OFFLINE
      </span>
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 text-neutral-100">
      <header className="flex justify-between items-end border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <Activity size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Operations telemetry</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">System Health Monitor</h1>
        </div>
        <button onClick={fetchHealthData} className="btn btn-sm btn-outline gap-2 text-neutral-300 border-white/10 hover:bg-white/5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refetch
        </button>
      </header>

      {message && (
        <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-300 text-xs font-semibold">
          <AlertCircle size={16} />
          <span>{message}</span>
        </div>
      )}

      {loading && !health ? (
        <div className="p-12 text-center opacity-50 font-mono text-xs text-neutral-400">Connecting to telemetry diagnostics...</div>
      ) : (
        <>
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-neutral-900 border border-white/5 p-6 rounded-2xl space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Ingestion Queue</span>
              <div className="text-3xl font-extrabold text-neutral-100">{jobs?.ingestion_queue_depth ?? 0}</div>
              <p className="text-[10px] text-neutral-400">Raw emails pending extraction parser</p>
            </div>
            
            <div className="bg-neutral-900 border border-white/5 p-6 rounded-2xl space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Tracking Sync Queue</span>
              <div className="text-3xl font-extrabold text-neutral-100">{jobs?.tracking_sync_queue_depth ?? 0}</div>
              <p className="text-[10px] text-neutral-400">Active containers scheduled for API check</p>
            </div>

            <div className="bg-neutral-900 border border-white/5 p-6 rounded-2xl space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">System Telemetry</span>
              <div className="text-3xl font-extrabold flex items-center gap-2">
                {health?.status === 'healthy' ? (
                  <span className="text-emerald-400 text-2xl font-bold flex items-center gap-1.5">
                    <CheckCircle className="text-emerald-500" size={24} />
                    HEALTHY
                  </span>
                ) : (
                  <span className="text-red-400 text-2xl font-bold flex items-center gap-1.5">
                    <AlertTriangle className="text-red-500" size={24} />
                    DEGRADED
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400">Orchestrator heartbeat monitor</p>
            </div>
          </div>

          {/* Subsystems Status Table */}
          <div className="bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-2">
              <Server size={14} className="text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Native Subsystems Telemetry</h2>
            </div>
            <div className="p-6">
              <table className="table w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-neutral-500 text-left">
                    <th className="font-bold pb-3">Subsystem Name</th>
                    <th className="font-bold pb-3">Connection Type</th>
                    <th className="font-bold pb-3 text-right">Health Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="py-4 font-bold flex items-center gap-2">
                      <Database size={14} className="text-primary" />
                      PostgreSQL Database
                    </td>
                    <td className="py-4 text-neutral-400">SQLAlchemy ORM (Pool: 5-20)</td>
                    <td className="py-4 text-right">
                      {getStatusBadge(dependencies?.dependencies?.database || 'online')}
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="py-4 font-bold flex items-center gap-2">
                      <Layers size={14} className="text-amber-400" />
                      Redis Server
                    </td>
                    <td className="py-4 text-neutral-400">Celery Tasks Broker / Lock Store</td>
                    <td className="py-4 text-right">
                      {getStatusBadge(dependencies?.dependencies?.redis || 'online')}
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="py-4 font-bold flex items-center gap-2">
                      <Activity size={14} className="text-blue-400" />
                      Object Storage
                    </td>
                    <td className="py-4 text-neutral-400">Reports PDF/XLSX Storage Drive</td>
                    <td className="py-4 text-right">
                      {getStatusBadge(dependencies?.dependencies?.storage || 'online')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
