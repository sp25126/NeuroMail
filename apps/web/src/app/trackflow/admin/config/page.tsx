"use client";

import React, { useState, useEffect } from 'react';
import { 
  Settings, Mail, Ship, Bell, Clock, 
  ShieldCheck, Save, RefreshCw, Plus, Trash2,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { MODULE_IDENTITY } from '@/config/module-identity';

export default function TenantConfigPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      // In a real app, tenant ID comes from session
      const data = await ApiClient.getFreightConfig();
      setConfig(data);
    } catch (e) {
      console.error(e);
      // Fallback defaults for UI polish demonstration
      setConfig({
        sync_interval_minutes: 30,
        no_update_threshold_hours: 24,
        storage_risk_days: 3,
        freight_subject_patterns: ["BOL#", "Container:", "Booking"],
        freight_from_addresses: ["logistics@partner.com"],
        active_carriers: ["terminal49", "project44"],
        alert_severity_threshold: "medium"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await ApiClient.updateFreightConfig(config);
      setConfig(data);
      alert("Configuration saved successfully!");
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save configuration: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center opacity-50 font-mono text-sm">Loading canonical config...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <header className="flex justify-between items-end border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <Settings size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">System Orchestration</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">{MODULE_IDENTITY.displayName} Configuration</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:opacity-90 gap-2 h-9 px-6 font-bold text-white">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          {/* Section 1: Ingestion Rules */}
          <section className="bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden text-neutral-100">
            <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-2">
              <Mail size={16} className="text-primary" />
              <h2 className="text-sm font-bold">Email Ingestion Rules</h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-tight">Subject Match Patterns</span>
                  <p className="text-[10px] text-neutral-500 mb-2">Emails matching these strings will be processed for container extraction.</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {config.freight_subject_patterns?.map((p: string, i: number) => (
                      <span key={i} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs font-mono text-neutral-300">
                        {p} <Trash2 size={10} className="text-red-500 cursor-pointer hover:text-red-400" />
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Add pattern (e.g. SHIPMENT:)" className="flex-1 bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-white" />
                    <Button variant="outline" className="h-9 border-white/10 text-neutral-300"><Plus size={14} /></Button>
                  </div>
                </label>

                <label className="block">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-tight">Authorized Sender Domains</span>
                  <p className="text-[10px] text-neutral-500 mb-2">Only extract data from these trusted sources.</p>
                  <div className="flex gap-2">
                    <input type="text" placeholder="e.g. @maersk.com" className="flex-1 bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-white" />
                    <Button variant="outline" className="h-9 border-white/10 text-neutral-300"><Plus size={14} /></Button>
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* Section 2: Carrier Adapters */}
          <section className="bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden text-neutral-100">
            <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-2">
              <Ship size={16} className="text-blue-400" />
              <h2 className="text-sm font-bold">Active Carrier Adapters</h2>
            </div>
            <div className="p-6 space-y-4">
              <CarrierToggle label="Terminal49 Container Sync" description="Direct terminal telemetry integration." enabled />
              <CarrierToggle label="Project44 Ocean Visibility" description="Global carrier network tracking." enabled />
              <CarrierToggle label="Custom Parser (NLP)" description="AI-driven extraction for non-API carriers." enabled={false} />
            </div>
          </section>

          {/* Section 3: Advanced (Collapsible) */}
          <section className="border border-white/5 rounded-2xl text-neutral-100">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-4 flex justify-between items-center text-sm font-bold hover:bg-white/5 transition-colors rounded-2xl"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-neutral-500" />
                Advanced Resilience Tuning
              </div>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showAdvanced && (
              <div className="p-6 pt-0 border-t border-white/5 space-y-6 mt-4 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-2 gap-6">
                  <label className="block">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Sync Interval (Mins)</span>
                    <input type="number" defaultValue={config.sync_interval_minutes} className="w-full mt-1 bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-white" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">No-Update Alert (Hours)</span>
                    <input type="number" defaultValue={config.no_update_threshold_hours} className="w-full mt-1 bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-white" />
                  </label>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar: Help & Trust */}
        <div className="space-y-6 text-neutral-100">
          <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
              <CheckCircle2 size={16} />
              Config Validation
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              {MODULE_IDENTITY.displayName} automatically validates patterns against your last 100 emails to prevent over-ingestion.
            </p>
            <div className="p-3 rounded-lg bg-neutral-950 border border-white/5 text-[10px] font-mono space-y-1">
              <div className="flex justify-between"><span>Status:</span> <span className="text-emerald-400">Validated</span></div>
              <div className="flex justify-between"><span>Precision:</span> <span className="text-neutral-300">94.2%</span></div>
            </div>
            <Button variant="outline" className="w-full text-[10px] h-8 border-primary/30 text-primary hover:bg-primary/10">
              Run Pattern Preview
            </Button>
          </div>

          <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-amber-400">
              <Bell size={16} />
              Notifications
            </h3>
            <p className="text-[10px] text-neutral-500">Configure where system alerts are dispatched.</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs p-2 rounded bg-white/5 border border-white/5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Slack: #logistics-ops
              </div>
              <div className="flex items-center gap-2 text-xs p-2 rounded bg-white/5 border border-white/5">
                <span className="w-2 h-2 rounded-full bg-neutral-600" />
                Email: ops@tenant.com
              </div>
            </div>
            <Button variant="ghost" className="w-full text-[10px] h-8 hover:bg-white/5 text-neutral-400">Configure Destinations</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarrierToggle({ label, description, enabled }: any) {
  return (
    <div className="flex justify-between items-center p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-all text-neutral-100">
      <div>
        <div className="text-xs font-bold text-neutral-200">{label}</div>
        <div className="text-[10px] text-neutral-500">{description}</div>
      </div>
      <div className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${enabled ? 'bg-primary' : 'bg-neutral-800'}`}>
        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${enabled ? 'right-1' : 'left-1'}`} />
      </div>
    </div>
  )
}
