"use client";

import { Clock, Moon, Calendar, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("SnoozeMenu");

interface SnoozeMenuProps {
    threadId: string;
    onSnooze: (until: Date) => void;
}

export function SnoozeMenu({ threadId, onSnooze }: SnoozeMenuProps) {
    const snoozeOptions = [
        { label: "Later today (6 PM)", hours: 6, icon: Zap },
        { label: "Tomorrow morning", hours: 18, icon: Moon },
        { label: "This weekend", hours: 72, icon: Calendar },
        { label: "Next week", hours: 168, icon: Clock },
    ];

    const handleSnooze = (hours: number, label: string) => {
        // Capture "now" inside the handler to maintain purity in the render path
        const now = Date.now();
        const until = new Date(now + hours * 60 * 60 * 1000);

        logger.info("Email snoozed", {
            threadId,
            option: label,
            until: until.toISOString(),
        });

        onSnooze(until);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors">
                    <Clock className="h-4 w-4 mr-2" />
                    Snooze
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background/95 backdrop-blur-md border-white/10 w-56">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Snooze until...</div>
                {snoozeOptions.map((option) => (
                    <DropdownMenuItem
                        key={option.label}
                        onClick={() => handleSnooze(option.hours, option.label)}
                        className="flex items-center gap-2 py-2 cursor-pointer focus:bg-primary/10 focus:text-primary"
                    >
                        <option.icon className="h-4 w-4 opacity-70" />
                        <span className="text-sm">{option.label}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
