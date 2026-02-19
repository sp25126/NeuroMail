"use client"

import { useMailStore } from "@/store/useMailStore"
import { useQuery } from "@tanstack/react-query"
import { Reply, Archive, Trash2, MoreVertical, Paperclip, Loader2, Bot, Sparkles, X } from "lucide-react"
import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import DOMPurify from "dompurify"

async function fetchThreadDetail(id: string) {
    const res = await fetch(`/api/mail/threads/${id}`)
    if (!res.ok) throw new Error("Failed to fetch thread detail")
    return res.json()
}

/**
 * Sanitize HTML email content for safe inline rendering.
 * Strips scripts, event handlers, and dangerous elements while preserving
 * layout, images, links, and styling that makes newsletters readable.
 */
function sanitizeEmailHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            // Structure
            "div", "span", "p", "br", "hr", "section", "article", "header", "footer", "main", "nav",
            // Text
            "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "sub", "sup",
            "blockquote", "pre", "code", "small", "mark",
            // Lists
            "ul", "ol", "li", "dl", "dt", "dd",
            // Tables (crucial for newsletter layouts)
            "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
            // Media
            "img", "picture", "source", "figure", "figcaption",
            // Links
            "a",
            // Styling
            "style", "center", "font",
        ],
        ALLOWED_ATTR: [
            "style", "class", "id", "src", "alt", "title", "href", "target", "rel",
            "width", "height", "border", "cellpadding", "cellspacing", "align", "valign",
            "bgcolor", "color", "face", "size", "colspan", "rowspan", "role", "dir",
        ],
        ALLOW_DATA_ATTR: false,
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "textarea", "select", "button"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    })
}

/** Styled container CSS for HTML emails — scoped to prevent style leakage */
const EMAIL_CONTAINER_STYLES = `
    .email-html-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #1a1a1a;
        word-wrap: break-word;
        overflow-wrap: break-word;
        background: white;
        padding: 24px;
        border-radius: 12px;
    }
    .email-html-container img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
    }
    .email-html-container a {
        color: #2563eb;
        text-decoration: underline;
    }
    .email-html-container a:hover {
        color: #1d4ed8;
    }
    .email-html-container table {
        max-width: 100%;
        border-collapse: collapse;
    }
    .email-html-container blockquote {
        border-left: 3px solid #e5e7eb;
        margin: 8px 0;
        padding: 4px 16px;
        color: #6b7280;
    }
    .email-html-container pre {
        background: #f3f4f6;
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        font-size: 13px;
    }
    .email-html-container h1, .email-html-container h2, .email-html-container h3 {
        margin-top: 16px;
        margin-bottom: 8px;
    }
`

function EmailHtmlRenderer({ html }: { html: string }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const sanitizedHtml = useMemo(() => sanitizeEmailHtml(html), [html])

    // Force all links to open in new tab after sanitization
    useEffect(() => {
        if (containerRef.current) {
            const links = containerRef.current.querySelectorAll("a")
            links.forEach(link => {
                link.setAttribute("target", "_blank")
                link.setAttribute("rel", "noopener noreferrer")
            })
        }
    }, [sanitizedHtml])

    return (
        <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <style>{EMAIL_CONTAINER_STYLES}</style>
            <div
                ref={containerRef}
                className="email-html-container"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
        </div>
    )
}

function EmailPlainTextRenderer({ text }: { text: string }) {
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 font-light p-6 rounded-xl bg-white/5 border border-white/5">
            {text || "No content."}
        </div>
    )
}

export function ThreadDetail({ onBack }: { onBack?: () => void }) {
    const { selectedThreadId } = useMailStore()
    const [isSummarizing, setIsSummarizing] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)

    const { data: thread, isLoading, error } = useQuery({
        queryKey: ["thread", selectedThreadId],
        queryFn: () => fetchThreadDetail(selectedThreadId!),
        enabled: !!selectedThreadId,
    })

    const handleSummarize = async () => {
        if (!thread) return
        setIsSummarizing(true)
        setSummary(null)
        try {
            const res = await fetch("/api/ai/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: thread.messages }),
            })
            const data = await res.json()
            if (data.summary) {
                setSummary(data.summary)
            }
        } catch (err) {
            console.error("Summarization error:", err)
        } finally {
            setIsSummarizing(false)
        }
    }

    if (!selectedThreadId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-screen italic text-sm glass-panel bg-black/20" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(var(--primary)/0.05) 0%, transparent 70%)' }}>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8, ease: "backOut" }}
                    className="p-8 rounded-full glass mb-4 relative"
                >
                    <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
                    <Bot size={48} className="text-primary relative z-10" />
                </motion.div>
                <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="tracking-widest uppercase text-xs font-bold text-primary/60"
                >
                    System Ready // Awaiting Input
                </motion.span>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center h-screen">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                    <Loader2 className="animate-spin text-primary relative z-10" size={32} />
                </div>
            </div>
        )
    }

    if (error || !thread) {
        return (
            <div className="flex-1 flex items-center justify-center text-destructive h-screen text-sm">
                Failed to load thread details.
            </div>
        )
    }

    return (
        <motion.div
            layout
            className="flex-1 flex flex-col h-[100dvh] bg-background/50 backdrop-blur-3xl overflow-hidden relative"
        >
            {/* Background Ambient Glow */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

            {/* Sticky Command Center Header */}
            <motion.header
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-background/40 backdrop-blur-xl sticky top-0 z-30 shadow-sm"
            >
                <div className="flex items-center gap-3">
                    <motion.button
                        id="thread-back"
                        onClick={onBack}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <X size={18} />
                    </motion.button>
                    <motion.button id="thread-archive" whileHover={{ scale: 1.1, rotate: 5 }} whileTap={{ scale: 0.9 }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Archive size={18} /></motion.button>
                    <motion.button id="thread-trash" whileHover={{ scale: 1.1, rotate: -5 }} whileTap={{ scale: 0.9 }} className="p-2 hover:bg-white/10 rounded-full text-destructive transition-colors"><Trash2 size={18} /></motion.button>
                </div>
                <div className="flex items-center gap-3">
                    <motion.button
                        id="thread-summarize"
                        layout
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(var(--primary)/0.3)" }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-50"
                    >
                        {isSummarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {isSummarizing ? "Synthesizing..." : "AI Summary"}
                    </motion.button>
                    <motion.button whileHover={{ rotate: 90 }} className="p-2 hover:bg-white/10 rounded-full"><MoreVertical size={18} /></motion.button>
                </div>
            </motion.header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 relative z-10">
                <AnimatePresence mode="popLayout">
                    {summary && (
                        <motion.div
                            layout
                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, height: "auto", marginBottom: 32 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/5 border border-primary/10 space-y-2 relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-primary/5 blur-xl" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider mb-2">
                                    <Bot size={14} />
                                    Neural Synthesis
                                </div>
                                <div className="text-sm text-foreground/90 leading-relaxed font-light">
                                    {summary}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {thread.messages.map((msg: any, index: number) => (
                    <motion.div
                        key={msg.id || index}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
                        className="space-y-6 pb-6 border-b border-white/5 last:border-b-0"
                    >
                        <div className="space-y-4">
                            {index === 0 && (
                                <motion.h1
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60"
                                >
                                    {msg.subject}
                                </motion.h1>
                            )}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-primary/20">
                                        {msg.from?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-sm text-foreground">{msg.from}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            {msg.to ? `To: ${msg.to}` : "To Me"} <span className="w-1 h-1 rounded-full bg-muted-foreground/50" /> Details
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs font-mono text-muted-foreground/70">{msg.date}</div>
                            </div>
                        </div>

                        {/* Render HTML (preferred) or plain text fallback */}
                        {msg.bodyHtml ? (
                            <EmailHtmlRenderer html={msg.bodyHtml} />
                        ) : (
                            <EmailPlainTextRenderer text={msg.bodyText || msg.body || ""} />
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Footer Input */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-xl z-20"
            >
                <div className="flex items-center gap-2 border border-white/10 rounded-xl px-4 py-2 focus-within:ring-1 ring-primary/50 transition-all bg-white/5 hover:bg-white/10">
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 text-muted-foreground hover:text-foreground transition-colors"><Paperclip size={18} /></motion.button>
                    <input
                        id="reply-input"
                        type="text"
                        placeholder="Type a neural reply..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 min-w-0 placeholder:text-muted-foreground/50"
                    />
                    <motion.button
                        id="reply-send"
                        whileHover={{ scale: 1.05, backgroundColor: "rgba(var(--primary)/0.9)" }}
                        whileTap={{ scale: 0.95 }}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(var(--primary)/0.4)]"
                    >
                        <Reply size={16} />
                        Send
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    )
}
