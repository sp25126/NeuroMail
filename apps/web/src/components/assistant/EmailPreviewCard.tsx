"use client";

import { Mail, Calendar, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmailPreviewCardProps {
    email: {
        id: string;
        from: string;
        subject: string;
        snippet: string;
        timestamp: string;
        isUnread: boolean;
    };
    onClick?: () => void;
}

export function EmailPreviewCard({ email, onClick }: EmailPreviewCardProps) {
    return (
        <Card
            className={cn(
                "p-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-white/5 bg-white/5 glass",
                email.isUnread && "border-primary/50 bg-primary/5 shadow-[0_0_15px_rgba(var(--primary)/0.1)]"
            )}
            onClick={onClick}
        >
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-lg shadow-primary/20">
                    {email.from.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium truncate text-foreground">{email.from}</span>
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-foreground/90 truncate">{email.subject}</span>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{email.snippet}</p>

                    <div className="flex items-center gap-1 mt-2">
                        <Calendar className="h-3 w-3 text-muted-foreground/60" />
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                            {new Date(email.timestamp).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    </div>
                </div>

                {email.isUnread && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1 animate-pulse" />
                )}
            </div>
        </Card>
    );
}
