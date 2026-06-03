"use client"

import React, { useState, useEffect } from "react"
import { 
    RefreshCw, Server, Search, CheckCircle2,
    XCircle, AlertCircle, Trash2, Plug, ShieldCheck
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ProviderConnection {
    id: string
    provider_type: string
    status: string
    last_success_at: string | null
    last_failure_at: string | null
    failure_reason: string | null
}

const SUPPORTED_PROVIDERS = [
    {
        id: "terminal49",
        name: "Terminal49",
        description: "Ocean visibility and container tracking via API.",
        fields: [{ key: "api_key", label: "API Key", type: "password" }]
    },
    {
        id: "project44",
        name: "project44",
        description: "Global visibility platform (ocean, over-the-road, rail).",
        fields: [
            { key: "api_key", label: "API Key / Token", type: "password" },
            { key: "region", label: "Region (e.g., americas)", type: "text" }
        ]
    }
]

export default function TrackingProvidersPage() {
    const [connections, setConnections] = useState<ProviderConnection[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
    const [credentialsForm, setCredentialsForm] = useState<Record<string, string>>({})
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    useEffect(() => {
        loadConnections()
    }, [])

    const loadConnections = async () => {
        setIsLoading(true)
        try {
            const data = await ApiClient.getTrackingProviders()
            setConnections(data || [])
        } catch (e) {
            console.error(e)
            toast.error("Failed to load provider connections")
        } finally {
            setIsLoading(false)
        }
    }

    const handleConnect = async (providerId: string) => {
        setActionLoading(providerId)
        try {
            // Extract region if present
            const { region, ...creds } = credentialsForm
            await ApiClient.connectTrackingProvider({
                provider_type: providerId,
                credentials: creds,
                region: region
            })
            toast.success(`Successfully connected to ${providerId}`)
            setConnectingProvider(null)
            setCredentialsForm({})
            await loadConnections()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to connect provider")
        } finally {
            setActionLoading(null)
        }
    }

    const handleTest = async (providerId: string) => {
        setActionLoading(`test-${providerId}`)
        try {
            await ApiClient.testTrackingProvider(providerId)
            toast.success(`Connection to ${providerId} is healthy`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Connection test failed")
        } finally {
            setActionLoading(null)
        }
    }

    const handleSync = async (providerId: string) => {
        setActionLoading(`sync-${providerId}`)
        try {
            const res = await ApiClient.syncTrackingProvider(providerId)
            toast.success(`Synced ${res.synced_count} shipments from ${providerId}`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Sync failed")
        } finally {
            setActionLoading(null)
        }
    }

    const handleDisconnect = async (providerId: string) => {
        if (!confirm("Are you sure you want to disconnect this provider? Live tracking will stop.")) return
        setActionLoading(`disconnect-${providerId}`)
        try {
            await ApiClient.disconnectTrackingProvider(providerId)
            toast.success(`Disconnected from ${providerId}`)
            await loadConnections()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to disconnect")
        } finally {
            setActionLoading(null)
        }
    }

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <RefreshCw className="animate-spin text-primary" size={32} />
            </div>
        )
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8 pb-24">
            <header className="space-y-1">
                <div className="flex items-center gap-2 text-neutral-500 mb-1">
                    <Server size={14} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">External Integrations</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-100">Carrier Visibility Providers</h1>
                <p className="text-sm text-neutral-400">Connect tracking aggregators to enrich email-derived data with live external carrier status.</p>
            </header>

            <div className="grid gap-6">
                {SUPPORTED_PROVIDERS.map(provider => {
                    const conn = connections.find(c => c.provider_type === provider.id)
                    const isConnected = conn?.status === "connected"
                    const isConnecting = connectingProvider === provider.id

                    return (
                        <div key={provider.id} className={cn(
                            "p-6 rounded-2xl border transition-all",
                            isConnected ? "bg-primary/5 border-primary/20" : "bg-neutral-900 border-white/5"
                        )}>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center border shadow-lg",
                                        isConnected ? "bg-primary/20 border-primary/30 text-primary" : "bg-neutral-800 border-white/10 text-neutral-400"
                                    )}>
                                        <Plug size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-neutral-100">{provider.name}</h3>
                                        <p className="text-xs text-neutral-400">{provider.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isConnected ? (
                                        <div className="flex items-center gap-2">
                                            <Button 
                                                variant="outline" size="sm" 
                                                className="border-white/10 text-xs font-bold gap-2"
                                                onClick={() => handleSync(provider.id)}
                                                disabled={actionLoading !== null}
                                            >
                                                {actionLoading === `sync-${provider.id}` ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                Sync Now
                                            </Button>
                                            <Button 
                                                variant="outline" size="sm" 
                                                className="border-white/10 text-xs font-bold gap-2"
                                                onClick={() => handleTest(provider.id)}
                                                disabled={actionLoading !== null}
                                            >
                                                {actionLoading === `test-${provider.id}` ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                                Test
                                            </Button>
                                            <Button 
                                                variant="ghost" size="sm" 
                                                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs font-bold px-2"
                                                onClick={() => handleDisconnect(provider.id)}
                                                disabled={actionLoading !== null}
                                                title="Disconnect"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button 
                                            onClick={() => setConnectingProvider(isConnecting ? null : provider.id)}
                                            variant={isConnecting ? "ghost" : "default"}
                                            className={cn(
                                                "text-xs font-bold",
                                                !isConnecting && "bg-white text-black hover:bg-neutral-200"
                                            )}
                                        >
                                            {isConnecting ? "Cancel" : "Connect"}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {isConnected && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-neutral-500 font-bold uppercase tracking-wider">Status</span>
                                        {conn.status === "connected" ? (
                                            <span className="flex items-center gap-1 text-emerald-400 font-bold"><CheckCircle2 size={12} /> Active</span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-red-400 font-bold"><XCircle size={12} /> Error</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-neutral-500 font-bold uppercase tracking-wider">Last Sync</span>
                                        <span className="text-neutral-300 font-mono">
                                            {conn.last_success_at ? new Date(conn.last_success_at).toLocaleString() : 'Never'}
                                        </span>
                                    </div>
                                    {conn.failure_reason && (
                                        <div className="flex items-center gap-2 text-xs text-red-400 md:col-span-3">
                                            <AlertCircle size={14} />
                                            <span>{conn.failure_reason}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isConnecting && (
                                <div className="p-5 mt-4 rounded-xl bg-black/40 border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <h4 className="text-sm font-bold text-neutral-200">Configure Connection</h4>
                                    <div className="space-y-4">
                                        {provider.fields.map(field => (
                                            <div key={field.key} className="space-y-2">
                                                <label className="text-xs font-bold text-neutral-500 uppercase">{field.label}</label>
                                                <input 
                                                    type={field.type}
                                                    value={credentialsForm[field.key] || ""}
                                                    onChange={(e) => setCredentialsForm(prev => ({...prev, [field.key]: e.target.value}))}
                                                    className="w-full bg-neutral-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-neutral-200 focus:outline-none focus:border-primary/50"
                                                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end pt-2">
                                        <Button 
                                            onClick={() => handleConnect(provider.id)}
                                            disabled={actionLoading === provider.id}
                                            className="bg-primary hover:bg-primary/90 text-white font-bold gap-2"
                                        >
                                            {actionLoading === provider.id ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                            Save & Connect
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
