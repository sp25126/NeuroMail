"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { createLogger } from "@/agent/observability/logger";
import { ApiClient } from "@/lib/api-client";

const logger = createLogger("SmartReplies");

interface SmartRepliesProps {
    emailId: string;
    onSelect: (reply: string) => void;
}

export function SmartReplies({ emailId, onSelect }: SmartRepliesProps) {
    const [replies, setReplies] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchReplies = async () => {
            if (!emailId) return;
            setIsLoading(true);
            try {
                const data = await ApiClient.getQuickSuggestions(emailId);
                setReplies(data);
            } catch (error) {
                logger.error("Failed to fetch smart replies", { error });
            } finally {
                setIsLoading(false);
            }
        };
        fetchReplies();
    }, [emailId]);

    const handleSelect = (reply: string) => {
        logger.info("Smart reply selected", { reply });
        onSelect(reply);
    };

    if (isLoading) {
        return (
            <div className="border-t border-white/5 p-4 bg-muted/20 backdrop-blur-sm flex items-center gap-3">
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Synthesizing suggestions...</span>
            </div>
        );
    }

    if (replies.length === 0) return null;

    return (
        <div className="border-t border-white/5 p-4 bg-muted/20 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Neural Suggestions</span>
            </div>

            <div className="flex flex-wrap gap-2">
                {replies.map((reply) => (
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
