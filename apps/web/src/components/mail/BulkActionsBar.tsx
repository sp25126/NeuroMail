"use client";

import { Trash2, Archive, Mail, MailOpen, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("BulkActions");

interface BulkActionsBarProps {
    selectedCount: number;
    onMarkAsRead: () => void;
    onMarkAsUnread: () => void;
    onArchive: () => void;
    onDelete: () => void;
    onClear: () => void;
}

export function BulkActionsBar({
    selectedCount,
    onMarkAsRead,
    onMarkAsUnread,
    onArchive,
    onDelete,
    onClear,
}: BulkActionsBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-xl border border-white/10 text-white px-6 py-3 rounded-2xl flex items-center gap-6 shadow-2xl z-50 animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex items-center gap-3 border-r border-white/10 pr-6">
                <span className="text-sm font-bold bg-primary px-2 py-0.5 rounded-full">{selectedCount}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Selected</span>
            </div>

            <div className="flex items-center gap-2">
                <ActionButton onClick={onMarkAsRead} icon={MailOpen} label="Read" />
                <ActionButton onClick={onMarkAsUnread} icon={Mail} label="Unread" />
                <ActionButton onClick={onArchive} icon={Archive} label="Archive" />
                <ActionButton onClick={onDelete} icon={Trash2} label="Delete" variant="destructive" />
            </div>

            <div className="border-l border-white/10 pl-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl h-8 text-xs font-bold gap-2"
                >
                    <XCircle size={14} />
                    CLEAR
                </Button>
            </div>
        </div>
    );
}

function ActionButton({ onClick, icon: Icon, label, variant = "default" }: any) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className={cn(
                "h-9 rounded-xl text-xs font-bold gap-2 transition-all duration-200",
                variant === "destructive"
                    ? "hover:bg-red-500/20 hover:text-red-400"
                    : "hover:bg-primary/20 hover:text-primary text-zinc-300"
            )}
        >
            <Icon size={14} />
            {label}
        </Button>
    );
}

import { cn } from "@/lib/utils";
