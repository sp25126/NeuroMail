"use client";

import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("SmartReplies");

const SMART_REPLIES = [
    "Thanks for the update!",
    "Got it, thanks!",
    "Let me check and get back to you.",
    "Sounds good!",
    "I'll take care of it.",
];

interface SmartRepliesProps {
    onSelect: (reply: string) => void;
}

export function SmartReplies({ onSelect }: SmartRepliesProps) {
    const handleSelect = (reply: string) => {
        logger.info("Smart reply selected", { reply });
        onSelect(reply);
    };

    return (
        <div className="border-t border-white/5 p-4 bg-muted/20 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Quick Replies</span>
            </div>

            <div className="flex flex-wrap gap-2">
                {SMART_REPLIES.map((reply) => (
                    <Button
                        key={reply}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelect(reply)}
                        className="text-xs bg-white/5 border-white/10 hover:bg-primary/10 hover:border-primary/30 group transition-all duration-300"
                    >
                        {reply}
                        <ArrowRight className="ml-2 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0" />
                    </Button>
                ))}
            </div>
        </div>
    );
}
