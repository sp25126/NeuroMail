"use client"

import { useState, useEffect } from "react"
import { Bot, Sparkles, X, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMailStore } from "@/store/useMailStore"

interface CopilotSidebarProps {
    isOpen: boolean
    onClose: () => void
    context?: string
    providerName?: string
}

import { AssistantPanel, Message } from "@/components/assistant/AssistantPanel"
import { v4 as uuidv4 } from "uuid"

export function CopilotSidebar({ isOpen, onClose, providerName = "Local AI" }: CopilotSidebarProps) {
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        dataAccess: true,
        proposeSkills: true,
    });

    if (!isOpen) return null;

    return (
        <div className="w-80 border-l bg-card/50 backdrop-blur-md flex flex-col h-screen shrink-0 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 font-bold text-primary">
                        <Bot size={20} />
                        AI Copilot
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-7">
                        Running on {providerName}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={cn("p-1.5 rounded-md hover:bg-muted transition-colors", showSettings && "bg-primary/10 text-primary")}
                        title="Advanced Settings"
                    >
                        <Bot size={18} />
                    </button>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md tracking-tighter">
                        <X size={18} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {showSettings ? (
                    <div className="p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 flex-1 overflow-y-auto">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Advanced Settings</div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border">
                                <span className="text-xs font-medium text-foreground">Data Retrieval (RAG)</span>
                                <input
                                    type="checkbox"
                                    checked={settings.dataAccess}
                                    onChange={(e) => setSettings({ ...settings, dataAccess: e.target.checked })}
                                    className="accent-primary"
                                />
                            </div>
                            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border">
                                <span className="text-xs font-medium text-foreground">Auto-Suggest Skills</span>
                                <input
                                    type="checkbox"
                                    checked={settings.proposeSkills}
                                    onChange={(e) => setSettings({ ...settings, proposeSkills: e.target.checked })}
                                    className="accent-primary"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => setShowSettings(false)}
                            className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors"
                        >
                            Save & Close Settings
                        </button>
                    </div>
                ) : (
                    <AssistantPanel />
                )}
            </div>
        </div>
    );
}
