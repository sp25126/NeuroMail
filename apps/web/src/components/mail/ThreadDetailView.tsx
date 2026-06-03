"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Archive, Trash2, Reply, Forward, MoreVertical, Star, Loader2, Bot, Sparkles, X } from "lucide-react"
import { useMailStore } from "@/store/useMailStore"
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createLogger } from "@/agent/observability/logger";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SmartReplies } from "./SmartReplies";

const logger = createLogger("ThreadDetailView");

export function ThreadDetailView() {
    const { currentThread, setView, openCompose, markAsRead, setSelectedThread, currentFolder } = useMailStore();
    const [isStarred, setIsStarred] = useState(false);

    useEffect(() => {
        if (currentThread) {
            const span = logger.startSpan("ThreadDetailView.load", {
                threadId: currentThread.id,
            });

            logger.info("Thread detail opened", {
                threadId: currentThread.id,
                subject: currentThread.subject,
            });

            // Mark as read
            if (currentThread.isUnread) {
                markAsRead(currentThread.id).then(() => {
                    logger.info("Thread marked as read", { threadId: currentThread.id });
                });
            }

            span.end({ success: true });
        }
    }, [currentThread?.id]);

    if (!currentThread) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-center"
                >
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                        <Reply className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-medium">Select an email to read</p>
                    <p className="text-xs text-muted-foreground/30 mt-1">Click on a thread to view details</p>
                </motion.div>
            </div>
        );
    }

    const handleReply = () => {
        logger.info("Reply initiated", { threadId: currentThread.id });
        openCompose({
            to: currentThread.lastMessage?.from || currentThread.sender || '',
            subject: `Re: ${currentThread.subject}`,
            body: `\n\n--- Original Message ---\n${currentThread.lastMessage?.snippet || currentThread.snippet || ''}`,
            threadId: currentThread.id,
        });
        toast.success("Composing reply", { description: `To: ${currentThread.lastMessage?.from || currentThread.sender}` });
    };

    const handleForward = () => {
        logger.info("Forward initiated", { threadId: currentThread.id });
        openCompose({
            to: '',
            subject: `Fwd: ${currentThread.subject}`,
            body: `\n\n--- Forwarded Message ---\nFrom: ${currentThread.lastMessage?.from || currentThread.sender || ''}\nSubject: ${currentThread.subject}\n\n${currentThread.lastMessage?.snippet || currentThread.snippet || ''}`,
        });
        toast("Forwarding message", { icon: "↗️" });
    };

    const handleStar = () => {
        logger.info("Star toggled", {
            threadId: currentThread.id,
            newState: !isStarred,
        });
        setIsStarred(!isStarred);
        toast(isStarred ? "Removed from starred" : "Added to starred", {
            icon: isStarred ? "☆" : "⭐",
        });
    };

    const handleArchive = () => {
        toast.success("Email archived", { icon: "📦" });
        setSelectedThread(null);
    };

    const handleDelete = () => {
        toast("Email moved to trash", { icon: "🗑️" });
        setSelectedThread(null);
    };

    const handleBack = () => {
        logger.info("Back to inbox clicked");
        setSelectedThread(null);
        setView("inbox");
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]"
            >
                <div className="flex items-center gap-3">
                    <motion.div whileHover={{ x: -3 }} whileTap={{ scale: 0.9 }}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleBack}
                            className="gap-2 hover:bg-white/10"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline text-xs text-muted-foreground">
                                {currentFolder.charAt(0).toUpperCase() + currentFolder.slice(1)}
                            </span>
                        </Button>
                    </motion.div>
                    <h2 className="font-semibold text-lg truncate max-w-md">
                        {currentThread.subject || "(No subject)"}
                    </h2>
                </div>

                <div className="flex items-center gap-1">
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Button variant="ghost" size="sm" onClick={handleStar} className="hover:bg-white/10">
                            <Star
                                className={cn(
                                    "h-4 w-4 transition-all duration-200",
                                    isStarred && "fill-yellow-400 text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]"
                                )}
                            />
                        </Button>
                    </motion.div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="hover:bg-white/10">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass border-white/10">
                            <DropdownMenuItem onClick={handleArchive} className="gap-2 cursor-pointer">
                                <Archive className="h-4 w-4" />
                                Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDelete} className="text-red-400 gap-2 cursor-pointer">
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </motion.div>

            {/* Action Bar */}
            <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="flex items-center gap-2 p-4 border-b border-white/5 bg-white/[0.03]"
            >
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button
                        size="sm"
                        onClick={handleReply}
                        className="gap-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                    >
                        <Reply className="h-4 w-4" />
                        Reply
                    </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleForward}
                        className="gap-2 border-white/10 hover:bg-white/10"
                    >
                        <Forward className="h-4 w-4" />
                        Forward
                    </Button>
                </motion.div>
            </motion.div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-4">
                <AnimatePresence mode="popLayout">
                    {currentThread.messages?.map((msg: any, idx: number) => (
                        <motion.div
                            key={msg.id || idx}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: idx * 0.1 }}
                        >
                            <EmailMessage
                                from={msg.from || 'Unknown'}
                                timestamp={msg.timestamp || ''}
                                body={msg.body || ''}
                                isLast={idx === currentThread.messages.length - 1}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* AI Smart Replies */}
            {currentThread.messages?.length > 0 && (
                <SmartReplies 
                    emailId={currentThread.messages[currentThread.messages.length - 1].id}
                    onSelect={(reply) => {
                        openCompose({
                            to: currentThread.lastMessage?.from || currentThread.sender || '',
                            subject: `Re: ${currentThread.subject}`,
                            body: `${reply}\n\n--- Original Message ---\n${currentThread.lastMessage?.snippet || currentThread.snippet || ''}`,
                            threadId: currentThread.id,
                        });
                    }}
                />
            )}
        </div>
    );
}

interface EmailMessageProps {
    from: string;
    timestamp: string;
    body: string;
    isLast: boolean;
}

function EmailMessage({ from, timestamp, body, isLast }: EmailMessageProps) {
    const [isExpanded, setIsExpanded] = useState(isLast);

    // Sanitize HTML content
    const sanitizedHTML = DOMPurify.sanitize(body, {
        ALLOWED_TAGS: [
            "p", "br", "strong", "em", "u", "a", "ul", "ol", "li",
            "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
            "img", "div", "span", "table", "tr", "td", "th"
        ],
        ALLOWED_ATTR: ["href", "src", "alt", "class", "style"],
        ALLOW_DATA_ATTR: false,
    });

    return (
        <div className="border border-white/5 rounded-xl mb-4 overflow-hidden bg-white/[0.03] shadow-xl glass hover-card">
            {/* Message Header */}
            <div
                className="flex items-center justify-between p-4 bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-all duration-200"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <motion.div
                        whileHover={{ scale: 1.1 }}
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-semibold shadow-lg shadow-primary/20"
                    >
                        {from.charAt(0).toUpperCase()}
                    </motion.div>
                    <div>
                        <span className="text-sm font-semibold text-foreground">{from}</span>
                        <span className="text-[11px] text-muted-foreground">
                            {timestamp ? new Date(timestamp).toLocaleString() : ''}
                        </span>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-muted-foreground/30"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 4.5L6 7.5L9 4.5" />
                    </svg>
                </motion.div>
            </div>

            {/* Message Body */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="p-6 overflow-x-auto border-t border-white/5">
                            <div
                                className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_*]:!text-foreground"
                                dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
