"use client";

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, AlertCircle, RefreshCw, Mail, Settings, 
  Ship, ShieldCheck, Play, ArrowRight, Server, Check,
  XCircle, Globe, ShieldAlert
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { MODULE_IDENTITY } from '@/config/module-identity';

export default function OnboardingPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<any>(null);
  const [outlookStatus, setOutlookStatus] = useState<any>(null);

  useEffect(() => {
    loadOnboardingStatus();
    loadMailboxStatuses();
  }, []);

  const loadOnboardingStatus = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await ApiClient.getFreightOnboarding();
      setStatus(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Failed to query onboarding state from the API.');
    } finally {
      setLoading(false);
    }
  };

  const loadMailboxStatuses = async () => {
    try {
      const conns = await ApiClient.getMailboxConnections();
      const gmail = conns.find(c => c.provider === "gmail" && c.status !== "disconnected");
      const outlook = conns.find(c => c.provider === "outlook" && c.status !== "disconnected");
      setGmailStatus(gmail);
      setOutlookStatus(outlook);
    } catch (e) {
      console.error("Failed to load mailbox statuses", e);
    }
  };

  const handleStep = async (stepName: string) => {
    setActioning(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      let updatedStatus = null;
      if (stepName === 'mailbox') {
        const { authorization_url } = await ApiClient.getGmailAuthUrl();
        window.location.href = authorization_url;
        return; // Redirecting
      } else if (stepName === 'validate_gmail') {
        const result = await ApiClient.testGmailConnection();
        if (result.ok) {
          setSuccessMsg(`Gmail connection validated! Found ${result.matching_messages_found} matching messages.`);
          // Update onboarding step on backend
          await ApiClient.completeOnboardingStep('step_mailbox_connected');
          updatedStatus = await ApiClient.getFreightOnboarding();
        } else {
          setErrorMsg(result.errors.join(", ") || "Validation failed.");
        }
      } else if (stepName === 'outlook') {
        const { authorization_url } = await ApiClient.getOutlookAuthUrl();
        window.location.href = authorization_url;
        return; // Redirecting
      } else if (stepName === 'validate_outlook') {
        const result = await ApiClient.testOutlookConnection();
        if (result.ok) {
          setSuccessMsg(`Outlook connection validated! Found ${result.matching_messages_found} matching messages.`);
          // Update onboarding step on backend
          await ApiClient.completeOnboardingStep('step_outlook_connected');
          updatedStatus = await ApiClient.getFreightOnboarding();
        } else {
          setErrorMsg(result.errors.join(", ") || "Validation failed.");
        }
      } else if (stepName === 'patterns') {
        await ApiClient.updateFreightConfig({
          freight_subject_patterns: ["BOL#", "Container:", "Booking"],
          freight_from_addresses: ["logistics@partner.com"]
        });
        updatedStatus = await ApiClient.getFreightOnboarding();
        updatedStatus.step_patterns_configured = true;
        setSuccessMsg(`${MODULE_IDENTITY.displayName} subject patterns configured!`);
      } else if (stepName === 'carriers') {
        await ApiClient.updateFreightConfig({
          active_carriers: ["terminal49", "project44"]
        });
        updatedStatus = await ApiClient.getFreightOnboarding();
        updatedStatus.step_carriers_configured = true;
        setSuccessMsg('Active carriers configured!');
      } else if (stepName === 'ingestion') {
        updatedStatus = await ApiClient.validateIngestionOnboarding();
        setSuccessMsg('Ingestion validation succeeded! Detected raw email intake.');
      } else if (stepName === 'sync') {
        updatedStatus = await ApiClient.validateSyncOnboarding();
        setSuccessMsg('Tracking sync validation succeeded! Verified shipment sync.');
      } else if (stepName === 'complete') {
        updatedStatus = await ApiClient.completeOnboarding();
        setSuccessMsg(`${MODULE_IDENTITY.displayName} Tenant onboarding completed successfully!`);
      }
      
      if (updatedStatus) {
        setStatus(updatedStatus);
      } else {
        await loadOnboardingStatus();
      }
      await loadMailboxStatuses();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Validation failed. Ensure prior steps are completed.');
    } finally {
      setActioning(false);
    }
  };

  if (loading && !status) {
    return <div className="p-12 text-center opacity-50 font-mono text-xs text-neutral-400">Restoring onboarding session...</div>;
  }

  const stepsList = [
    { 
      key: 'mailbox', 
      label: 'Connect Gmail', 
      desc: `Authorize Google OAuth to ingest raw ${MODULE_IDENTITY.displayName} emails.`, 
      done: status?.step_mailbox_connected || (gmailStatus?.status === 'connected'),
      action: gmailStatus ? null : () => handleStep('mailbox'),
      hidden: false
    },
    { 
      key: 'validate_gmail', 
      label: 'Validate Gmail Connection', 
      desc: 'Verify Gmail mailbox access and search for matching shipment patterns.', 
      done: status?.step_mailbox_connected && successMsg?.includes('Gmail connection validated'),
      action: gmailStatus && !status?.step_mailbox_connected ? () => handleStep('validate_gmail') : null,
      hidden: !gmailStatus
    },
    { 
      key: 'outlook', 
      label: 'Connect Outlook', 
      desc: `Authorize Microsoft OAuth to ingest raw ${MODULE_IDENTITY.displayName} emails.`, 
      done: status?.step_outlook_connected || (outlookStatus?.status === 'connected'),
      action: outlookStatus ? null : () => handleStep('outlook'),
      hidden: false
    },
    { 
      key: 'validate_outlook', 
      label: 'Validate Outlook Connection', 
      desc: 'Verify Outlook mailbox access and search for matching shipment patterns.', 
      done: status?.step_outlook_connected && successMsg?.includes('Outlook connection validated'),
      action: outlookStatus && !status?.step_outlook_connected ? () => handleStep('validate_outlook') : null,
      hidden: !outlookStatus
    },
    { 
      key: 'patterns', 
      label: 'Configure Patterns', 
      desc: 'Define email subject match patterns & sender whitelist filters.', 
      done: status?.step_patterns_configured,
      action: () => handleStep('patterns'),
      hidden: false
    },
    { 
      key: 'carriers', 
      label: 'Configure Carriers', 
      desc: 'Select active adapters (Terminal49, Project44) & priorities.', 
      done: status?.step_carriers_configured,
      action: () => handleStep('carriers'),
      hidden: false
    },
    { 
      key: 'ingestion', 
      label: 'Validate Ingestion', 
      desc: 'Run ingestion checks to verify raw emails parse correctly.', 
      done: status?.step_ingestion_validated,
      action: () => handleStep('ingestion'),
      hidden: false
    },
    { 
      key: 'sync', 
      label: 'Validate Sync', 
      desc: 'Verify connection to carrier telemetry tracking services.', 
      done: status?.step_sync_validated,
      action: () => handleStep('sync'),
      hidden: false
    },
  ];

  const currentStepIndex = stepsList.findIndex(s => !s.done && !s.hidden);
  const currentStep = currentStepIndex === -1 
    ? { key: 'complete', label: 'Onboarding Complete', desc: 'All steps verified!', done: true, action: null, hidden: false } 
    : stepsList[currentStepIndex];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-neutral-900 border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-neutral-500">
            <ShieldCheck size={14} className="text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{MODULE_IDENTITY.displayName} Orchestrator</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding Setup Wizard</h1>
          <p className="text-xs text-neutral-400">Initialize tenant workspace environment step-by-step.</p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-300 text-xs">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <span className="font-bold">Verification Error</span>
              <p className="leading-relaxed opacity-95">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl flex items-start gap-3 text-emerald-300 text-xs">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <span className="font-bold">Step Complete</span>
              <p className="leading-relaxed opacity-95">{successMsg}</p>
            </div>
          </div>
        )}

        {/* Steps Progress Indicator */}
        <div className="space-y-3">
          {stepsList.filter(s => !s.hidden).map((s, idx) => (
            <div key={s.key} className={`flex justify-between items-center p-4 rounded-2xl border transition-all ${
              s.done 
                ? 'bg-neutral-950/55 border-white/5 text-neutral-400' 
                : s.key === currentStep.key
                  ? 'bg-primary/5 border-primary/20 text-neutral-100'
                  : 'bg-neutral-950/25 border-white/5 opacity-40 text-neutral-500'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  s.done 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : s.key === currentStep.key
                      ? 'bg-primary text-white' 
                      : 'bg-neutral-800 border border-white/5'
                }`}>
                  {s.done ? <Check size={10} /> : idx + 1}
                </div>
                <div>
                  <h3 className="text-xs font-bold">{s.label}</h3>
                  <p className="text-[10px] text-neutral-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
              {s.key === currentStep.key && !s.done && s.action && (
                <button 
                  onClick={s.action}
                  className="px-3 py-1 rounded bg-white text-black text-[10px] font-bold hover:bg-neutral-200 transition-colors"
                >
                  {s.key === 'mailbox' ? 'Connect' : 'Run Test'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-6 flex justify-between items-center">
          <div className="text-[10px] text-neutral-500 font-mono">
            {currentStepIndex === -1 ? 'All steps validated' : `Step ${currentStepIndex + 1} of ${stepsList.filter(s => !s.hidden).length}`}
          </div>
          <div className="flex gap-2">
            {currentStepIndex === -1 ? (
              <button 
                disabled={actioning || status?.completed_at !== null}
                onClick={() => handleStep('complete')}
                className="btn btn-sm btn-primary gap-1 text-white"
              >
                {actioning ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                Complete Onboarding
              </button>
            ) : (
              <button 
                disabled={actioning || (currentStep.action !== null)}
                onClick={() => handleStep(currentStep.key)}
                className="btn btn-sm btn-primary gap-1 text-white disabled:opacity-30"
              >
                {actioning ? <RefreshCw size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                Verify & Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
