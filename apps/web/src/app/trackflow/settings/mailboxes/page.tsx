"use client"

import React, { useState, useEffect } from "react"
import { 
    Mail, ShieldCheck, AlertCircle, RefreshCw, 
    CheckCircle2, XCircle, ExternalLink, Trash2,
    Shield, Globe, Lock, ShieldAlert
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { MODULE_IDENTITY } from "@/config/module-identity"

export default function MailboxSettingsPage() {
    const [connections, setConnections] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isTestingGmail, setIsTestingGmail] = useState(false)
    const [isTestingOutlook, setIsTestingOutlook] = useState(false)
    const [gmailValidation, setGmailValidation] = useState<any>(null)
    const [outlookValidation, setOutlookValidation] = useState<any>(null)

    useEffect(() => {
        loadConnections()
    }, [])

    const loadConnections = async () => {
        setIsLoading(true)
        try {
            const data = await ApiClient.getMailboxConnections()
            setConnections(data)
        } catch (e) {
            console.error(e)
            toast.error("Failed to load mailbox connections")
        } finally {
            setIsLoading(false)
        }
    }

    const handleConnectGmail = async () => {
        try {
            const { authorization_url } = await ApiClient.getGmailAuthUrl()
            window.location.href = authorization_url
        } catch (e) {
            console.error(e)
            toast.error("Failed to initiate Gmail OAuth")
        }
    }

    const handleDisconnectGmail = async () => {
        if (!confirm("Are you sure you want to disconnect your Gmail account? Ingestion will stop.")) return
        try {
            await ApiClient.disconnectGmail()
            toast.success("Gmail disconnected")
            loadConnections()
            setGmailValidation(null)
        } catch (e) {
            console.error(e)
            toast.error("Failed to disconnect Gmail")
        }
    }

    const handleTestGmailConnection = async () => {
        setIsTestingGmail(true)
        try {
            const result = await ApiClient.testGmailConnection()
            setGmailValidation(result)
            if (result.ok) {
                toast.success("Gmail connection is healthy")
            } else {
                toast.error("Gmail connection has issues")
            }
            loadConnections()
        } catch (e) {
            console.error(e)
            toast.error("Failed to test connection")
        } finally {
            setIsTestingGmail(false)
        }
    }

    const handleConnectOutlook = async () => {
        try {
            const { authorization_url } = await ApiClient.getOutlookAuthUrl()
            window.location.href = authorization_url
        } catch (e) {
            console.error(e)
            toast.error("Failed to initiate Outlook OAuth")
        }
    }

    const handleDisconnectOutlook = async () => {
        if (!confirm("Are you sure you want to disconnect your Outlook account? Ingestion will stop.")) return
        try {
            await ApiClient.disconnectOutlook()
            toast.success("Outlook disconnected")
            loadConnections()
            setOutlookValidation(null)
        } catch (e) {
            console.error(e)
            toast.error("Failed to disconnect Outlook")
        }
    }

    const handleTestOutlookConnection = async () => {
        setIsTestingOutlook(true)
        try {
            const result = await ApiClient.testOutlookConnection()
            setOutlookValidation(result)
            if (result.ok) {
                toast.success("Outlook connection is healthy")
            } else {
                toast.error("Outlook connection has issues")
            }
            loadConnections()
        } catch (e) {
            console.error(e)
            toast.error("Failed to test connection")
        } finally {
            setIsTestingOutlook(false)
        }
    }

    const gmailConn = connections.find(c => c.provider === "gmail" && c.status !== "disconnected")
    const outlookConn = connections.find(c => c.provider === "outlook" && c.status !== "disconnected")

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <header className="space-y-1">
                <div className="flex items-center gap-2 text-neutral-500 mb-1">
                    <ShieldCheck size={14} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Connectivity & Security</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-100">Mailbox Connections</h1>
                <p className="text-sm text-neutral-400">Manage the email accounts {MODULE_IDENTITY.displayName} monitors for shipment intelligence.</p>
            </header>

            <div className="grid gap-6">
                {/* Gmail Connection Card */}
                <div className={`bg-neutral-900 border rounded-2xl overflow-hidden transition-all ${
                    gmailConn?.status === 'connected' ? 'border-primary/20 bg-primary/5' : 'border-white/5'
                }`}>
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-neutral-100">
                                    <Mail size={24} />
                                </div>
                                <div>
                                    <h2 className="font-bold text-lg flex items-center gap-2">
                                        Google Gmail
                                        {gmailConn && (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                                gmailConn.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                gmailConn.status === 'degraded' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                'bg-red-500/10 text-red-400 border border-red-500/20'
                                            }`}>
                                                {gmailConn.status}
                                            </span>
                                        )}
                                    </h2>
                                    <p className="text-xs text-neutral-500">Official Gmail API Integration (OAuth 2.0)</p>
                                </div>
                            </div>
                            {!gmailConn ? (
                                <Button onClick={handleConnectGmail} className="bg-white text-black hover:bg-neutral-200 gap-2 h-10 px-6 font-bold">
                                    Connect Gmail Account
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button 
                                        variant="outline" 
                                        onClick={handleTestGmailConnection} 
                                        disabled={isTestingGmail}
                                        className="border-white/10 h-10 gap-2 text-xs font-bold"
                                    >
                                        {isTestingGmail ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                        Test Health
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        onClick={handleDisconnectGmail}
                                        className="border-red-500/20 text-red-400 hover:bg-red-500/10 h-10 px-4"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {gmailConn ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Connected Email</span>
                                        <div className="text-sm font-mono text-neutral-200">{gmailConn.email_address}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Granted Access</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {gmailConn.scopes?.map((s: string) => (
                                                <span key={s} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono">
                                                    {s.split('/').pop()}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {gmailValidation && (
                                    <div className={`p-4 rounded-xl border ${
                                        gmailValidation.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                                    }`}>
                                        <div className="flex items-center gap-3 mb-3">
                                            {gmailValidation.ok ? (
                                                <CheckCircle2 size={18} className="text-emerald-400" />
                                            ) : (
                                                <XCircle size={18} className="text-red-400" />
                                            )}
                                            <span className="text-sm font-bold">
                                                {gmailValidation.ok ? 'Sync Validation Succeeded' : 'Sync Validation Failed'}
                                            </span>
                                            <span className="ml-auto text-[10px] font-mono text-neutral-500">Checked {new Date(gmailValidation.checked_at).toLocaleTimeString()}</span>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {gmailValidation.matching_messages_found > 0 && (
                                                <div className="flex items-center gap-2 text-xs text-neutral-300 bg-black/20 p-2 rounded-lg">
                                                    <Globe size={12} className="text-primary" />
                                                    Found <strong>{gmailValidation.matching_messages_found}</strong> matching shipments in your inbox from the last 30 days.
                                                </div>
                                            )}
                                            {gmailValidation.warnings.map((w: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/5 p-2 rounded-lg border border-amber-400/10">
                                                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                                                    {w}
                                                </div>
                                            ))}
                                            {gmailValidation.errors.map((e: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-400/5 p-2 rounded-lg border border-red-400/10">
                                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                                    {e}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500">
                                    <Lock size={32} />
                                </div>
                                <div className="max-w-xs space-y-1">
                                    <h3 className="font-bold text-neutral-300">No Mailbox Linked</h3>
                                    <p className="text-xs text-neutral-500">Connect a mailbox to allow {MODULE_IDENTITY.displayName} to autonomously ingest shipment data from your inbox.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Outlook Connection Card */}
                <div className={`bg-neutral-900 border rounded-2xl overflow-hidden transition-all ${
                    outlookConn?.status === 'connected' ? 'border-primary/20 bg-primary/5' : 'border-white/5'
                }`}>
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-neutral-100">
                                    <Globe size={24} />
                                </div>
                                <div>
                                    <h2 className="font-bold text-lg flex items-center gap-2">
                                        Microsoft Outlook
                                        {outlookConn && (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                                outlookConn.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                outlookConn.status === 'degraded' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                'bg-red-500/10 text-red-400 border border-red-500/20'
                                            }`}>
                                                {outlookConn.status}
                                            </span>
                                        )}
                                    </h2>
                                    <p className="text-xs text-neutral-500">Azure AD OAuth 2.0 Integration</p>
                                </div>
                            </div>
                            {!outlookConn ? (
                                <Button onClick={handleConnectOutlook} className="bg-white text-black hover:bg-neutral-200 gap-2 h-10 px-6 font-bold">
                                    Connect Outlook Account
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button 
                                        variant="outline" 
                                        onClick={handleTestOutlookConnection} 
                                        disabled={isTestingOutlook}
                                        className="border-white/10 h-10 gap-2 text-xs font-bold"
                                    >
                                        {isTestingOutlook ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                        Test Health
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        onClick={handleDisconnectOutlook}
                                        className="border-red-500/20 text-red-400 hover:bg-red-500/10 h-10 px-4"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {outlookConn ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Connected Email</span>
                                        <div className="text-sm font-mono text-neutral-200">{outlookConn.email_address}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Granted Access</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {outlookConn.scopes?.map((s: string) => (
                                                <span key={s} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {outlookValidation && (
                                    <div className={`p-4 rounded-xl border ${
                                        outlookValidation.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                                    }`}>
                                        <div className="flex items-center gap-3 mb-3">
                                            {outlookValidation.ok ? (
                                                <CheckCircle2 size={18} className="text-emerald-400" />
                                            ) : (
                                                <XCircle size={18} className="text-red-400" />
                                            )}
                                            <span className="text-sm font-bold">
                                                {outlookValidation.ok ? 'Sync Validation Succeeded' : 'Sync Validation Failed'}
                                            </span>
                                            <span className="ml-auto text-[10px] font-mono text-neutral-500">Checked {new Date(outlookValidation.checked_at).toLocaleTimeString()}</span>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {outlookValidation.matching_messages_found > 0 && (
                                                <div className="flex items-center gap-2 text-xs text-neutral-300 bg-black/20 p-2 rounded-lg">
                                                    <Globe size={12} className="text-primary" />
                                                    Found <strong>{outlookValidation.matching_messages_found}</strong> matching shipments in your inbox from the last 30 days.
                                                </div>
                                            )}
                                            {outlookValidation.warnings.map((w: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/5 p-2 rounded-lg border border-amber-400/10">
                                                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                                                    {w}
                                                </div>
                                            ))}
                                            {outlookValidation.errors.map((e: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-400/5 p-2 rounded-lg border border-red-400/10">
                                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                                    {e}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500">
                                    <Lock size={32} />
                                </div>
                                <div className="max-w-xs space-y-1">
                                    <h3 className="font-bold text-neutral-300">No Mailbox Linked</h3>
                                    <p className="text-xs text-neutral-500">Connect a mailbox to allow {MODULE_IDENTITY.displayName} to autonomously ingest shipment data from your inbox.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <section className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex items-start gap-4">
                <Shield size={24} className="text-primary shrink-0" />
                <div className="space-y-1">
                    <h3 className="text-sm font-bold text-neutral-100">Security & Privacy Posture</h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                        {MODULE_IDENTITY.displayName} uses the restricted <code>gmail.readonly</code> scope. We only process emails matching your specific subject patterns. 
                        Tokens are encrypted at rest using AES-256 (Fernet) with tenant-specific key derivation.
                    </p>
                    <div className="pt-2">
                        <a href="#" className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline">
                            View Data Processing Agreement <ExternalLink size={10} />
                        </a>
                    </div>
                </div>
            </section>
        </div>
    )
}
