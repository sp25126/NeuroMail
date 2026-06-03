"use client";

import React, { useState, useEffect } from 'react';
import { 
  Key, RefreshCw, Unlink, Link as LinkIcon, AlertTriangle, 
  CheckCircle, Server, Shield, X, Eye, EyeOff
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';

export default function ProviderConnectionsPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<string | null>(null); // 'connect' or 'rotate'
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getFreightProviders();
      setProviders(data);
    } catch (e) {
      console.error("Failed to load providers:", e);
      setMessage({ type: 'error', text: 'Could not fetch provider connection health status.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConnect = (providerType: string, action: 'connect' | 'rotate') => {
    setSelectedProvider(providerType);
    setActiveModal(action);
    setCredentials({});
    setShowPassword(false);
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    
    setLoading(true);
    try {
      if (activeModal === 'connect') {
        await ApiClient.connectFreightProvider(selectedProvider, credentials);
        setMessage({ type: 'success', text: `Successfully connected ${selectedProvider}.` });
      } else {
        await ApiClient.rotateFreightProvider(selectedProvider, credentials);
        setMessage({ type: 'success', text: `Rotated credentials for ${selectedProvider}.` });
      }
      setActiveModal(null);
      await fetchProviders();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Failed to save credentials: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (providerType: string) => {
    if (!confirm(`Are you sure you want to revoke credentials and disconnect ${providerType}?`)) return;
    
    setLoading(true);
    try {
      await ApiClient.disconnectFreightProvider(providerType);
      setMessage({ type: 'success', text: `Disconnected ${providerType}.` });
      await fetchProviders();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Failed to disconnect: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (providerType: string) => {
    setTesting(prev => ({ ...prev, [providerType]: true }));
    try {
      const res = await ApiClient.testFreightProvider(providerType);
      if (res.status === 'connected') {
        setMessage({ type: 'success', text: `${providerType} connection test succeeded.` });
      } else {
        setMessage({ type: 'error', text: `${providerType} test reported authentication failure: ${res.failure_reason}` });
      }
      await fetchProviders();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Test failed for ${providerType}: ${err.message || err}` });
    } finally {
      setTesting(prev => ({ ...prev, [providerType]: false }));
    }
  };

  const defaultProviders = [
    { type: 'gmail', name: 'Gmail Workspace API', category: 'Mailbox Intake' },
    { type: 'outlook', name: 'Outlook Exchange API', category: 'Mailbox Intake' },
    { type: 'project44', name: 'Project44 Ocean API', category: 'Tracking Telemetry' },
    { type: 'terminal49', name: 'Terminal49 Container API', category: 'Tracking Telemetry' }
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex justify-between items-end border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <Shield size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Credential Vault</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Provider Connection Credentials</h1>
        </div>
        <button onClick={fetchProviders} className="btn btn-sm btn-outline gap-2 text-neutral-300 border-white/10 hover:bg-white/5">
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

      {loading && providers.length === 0 ? (
        <div className="p-12 text-center opacity-50 font-mono text-xs text-neutral-400">Querying secure credentials store...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {defaultProviders.map(def => {
            const activeConn = providers.find(p => p.provider_type === def.type);
            const status = activeConn?.status || 'disconnected';
            
            return (
              <div key={def.type} className="bg-neutral-900 border border-white/5 rounded-2xl p-6 flex flex-col justify-between space-y-6 text-neutral-100">
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{def.category}</span>
                      <h2 className="text-lg font-bold mt-1">{def.name}</h2>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      status === 'connected' ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400' :
                      status === 'failed' || status === 'revoked' ? 'bg-red-950/40 border-red-500/20 text-red-400' :
                      status === 'degraded' ? 'bg-amber-950/40 border-amber-500/20 text-amber-400' :
                      'bg-neutral-950 border-white/5 text-neutral-400'
                    }`}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                  
                  {activeConn && (
                    <div className="mt-4 p-3 rounded-xl bg-neutral-950 border border-white/5 text-[10px] font-mono space-y-1 text-neutral-400">
                      {activeConn.last_success_at && (
                        <div className="flex justify-between">
                          <span>Last Success:</span>
                          <span className="text-neutral-300">{new Date(activeConn.last_success_at).toLocaleString()}</span>
                        </div>
                      )}
                      {activeConn.last_failure_at && (
                        <div className="flex justify-between">
                          <span>Last Failure:</span>
                          <span className="text-red-400">{new Date(activeConn.last_failure_at).toLocaleString()}</span>
                        </div>
                      )}
                      {activeConn.failure_reason && (
                        <div className="text-red-400 text-left mt-1 border-t border-white/5 pt-1">
                          Reason: {activeConn.failure_reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
                  {status === 'connected' || status === 'degraded' ? (
                    <>
                      <button 
                        onClick={() => handleDisconnect(def.type)} 
                        className="btn btn-sm btn-error btn-outline gap-1.5"
                      >
                        <Unlink size={12} />
                        Disconnect
                      </button>
                      <button 
                        onClick={() => handleOpenConnect(def.type, 'rotate')} 
                        className="btn btn-sm btn-outline gap-1.5 border-white/10 text-neutral-300 hover:bg-white/5"
                      >
                        <RefreshCw size={12} />
                        Rotate
                      </button>
                      <button 
                        onClick={() => handleTest(def.type)} 
                        disabled={testing[def.type]}
                        className="btn btn-sm btn-outline gap-1.5 border-white/10 text-neutral-300 hover:bg-white/5"
                      >
                        {testing[def.type] ? <RefreshCw size={12} className="animate-spin" /> : <Server size={12} />}
                        Test
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => handleOpenConnect(def.type, 'connect')} 
                      className="btn btn-sm btn-primary gap-1.5 text-white"
                    >
                      <LinkIcon size={12} />
                      Connect Provider
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect/Rotate Modal */}
      {activeModal && selectedProvider && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full text-neutral-100 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold mb-1">
              {activeModal === 'connect' ? 'Connect' : 'Rotate Credentials for'} {selectedProvider.toUpperCase()}
            </h3>
            <p className="text-[11px] text-neutral-500 mb-6">Credentials will be encrypted with Fernet AES-256 at rest in the secret vault.</p>
            
            <form onSubmit={handleConnectSubmit} className="space-y-4">
              {selectedProvider === 'terminal49' || selectedProvider === 'project44' ? (
                <>
                  <label className="block">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Carrier API Token / Key</span>
                    <div className="relative mt-1">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        placeholder="Enter API Key" 
                        value={credentials.api_key || ''} 
                        onChange={(e) => setCredentials(prev => ({ ...prev, api_key: e.target.value }))}
                        className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary text-white pr-8"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2.5 text-neutral-500 hover:text-neutral-300"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">API Endpoint URL (Optional)</span>
                    <input 
                      type="text" 
                      placeholder={selectedProvider === 'terminal49' ? "https://api.terminal49.com" : "https://api.project44.com"} 
                      value={credentials.endpoint_url || ''} 
                      onChange={(e) => setCredentials(prev => ({ ...prev, endpoint_url: e.target.value }))}
                      className="w-full mt-1 bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary text-white"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">OAuth Client ID</span>
                    <input 
                      type="text" 
                      required
                      placeholder="Enter Client ID" 
                      value={credentials.client_id || ''} 
                      onChange={(e) => setCredentials(prev => ({ ...prev, client_id: e.target.value }))}
                      className="w-full mt-1 bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">OAuth Client Secret</span>
                    <div className="relative mt-1">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        placeholder="Enter Client Secret" 
                        value={credentials.client_secret || ''} 
                        onChange={(e) => setCredentials(prev => ({ ...prev, client_secret: e.target.value }))}
                        className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary text-white pr-8"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2.5 text-neutral-500 hover:text-neutral-300"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </label>
                </>
              )}
              
              <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setActiveModal(null)} className="btn btn-sm btn-outline border-white/10 text-neutral-400 hover:bg-white/5">
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary text-white">
                  Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
