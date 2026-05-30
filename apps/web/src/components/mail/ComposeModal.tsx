"use client"

import { useMailStore } from "@/store/useMailStore"
import { X, Send, Minus, Loader2, CheckCircle, Paperclip, Image as ImageIcon } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

export function ComposeModal() {
    const { isComposeOpen, setComposeOpen, composeDraft, setComposeDraft } = useMailStore()
    const [isMinimized, setIsMinimized] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">("idle")
    const [isConfirming, setIsConfirming] = useState(false)

    // Local form state
    const [formData, setFormData] = useState(composeDraft)

    useEffect(() => {
        setFormData(composeDraft)
        setSendStatus("idle")
        setIsConfirming(false)
    }, [composeDraft, isComposeOpen])

    if (!isComposeOpen) return null

    const handleChange = (field: keyof typeof formData, value: string) => {
        setFormData({ ...formData, [field]: value })
    }

    const handleSendClick = () => {
        if (!formData.to.trim()) {
            toast.error("Please enter a recipient email address")
            return
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formData.to)) {
            toast.error("Invalid email address format")
            return
        }

        setIsConfirming(true)
    }

    const confirmSend = async () => {
        setIsConfirming(false)
        setIsSending(true)

        try {
            const res = await fetch("/api/mail/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: formData.to,
                    subject: formData.subject,
                    body: formData.body,
                    threadId: formData.threadId,
                }),
            })

            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Failed to send email")

            console.log("✅ Email sent:", data.messageId)
            setSendStatus("success")
            toast.success("Email sent successfully!", {
                description: `To: ${formData.to}`,
            })

            setTimeout(() => {
                setComposeOpen(false)
                setComposeDraft({ to: "", subject: "", body: "" })
                setSendStatus("idle")
            }, 1200)
        } catch (err: any) {
            console.error("❌ Send failed:", err)
            toast.error("Failed to send email", { description: err.message })
            setSendStatus("error")
        } finally {
            setIsSending(false)
        }
    }

    const handleClose = () => {
        if (formData.to || formData.subject || formData.body) {
            toast("Draft discarded", { icon: "🗑️" })
        }
        setComposeOpen(false)
        setComposeDraft({ to: "", subject: "", body: "" })
        setIsConfirming(false)
    }

    return (
        <AnimatePresence>
            {isComposeOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    {/* Confirmation Overlay */}
                    <AnimatePresence>
                        {isConfirming && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="absolute z-[110] bg-background/95 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full space-y-4"
                            >
                                <h3 className="text-lg font-bold">Ready to send?</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    You are about to send this email to <span className="text-foreground font-semibold">{formData.to}</span>. Please verify the content before proceeding.
                                </p>
                                <div className="flex gap-3 justify-end pt-2">
                                    <button
                                        onClick={() => setIsConfirming(false)}
                                        className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium"
                                    >
                                        Go Back
                                    </button>
                                    <button
                                        onClick={confirmSend}
                                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                                    >
                                        Confirm & Send
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Modal */}
                    <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 40 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 40 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className={cn(
                            "relative sm:w-[520px] z-[70] flex flex-col max-h-[85vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50 transition-all duration-300",
                            isConfirming && "opacity-30 blur-[2px] scale-95 pointer-events-none"
                        )}
                        style={{ background: "linear-gradient(145deg, hsl(240 10% 6%) 0%, hsl(240 10% 4%) 100%)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-white/[0.03]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
                                <span className="font-bold text-sm text-foreground tracking-wide">
                                    {sendStatus === "success" ? "✅ Message Sent" : "New Message"}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsMinimized(!isMinimized)}
                                    className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                                >
                                    <Minus size={14} />
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Form Body */}
                        <AnimatePresence>
                            {!isMinimized && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="flex-1 flex flex-col"
                                >
                                    <div className="flex-1 flex flex-col px-5 py-4 gap-3">
                                        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                                            <label className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest w-8">To</label>
                                            <input
                                                placeholder="recipient@email.com"
                                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                                                value={formData.to}
                                                onChange={(e) => handleChange("to", e.target.value)}
                                                disabled={isSending || sendStatus === "success"}
                                            />
                                        </div>

                                        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                                            <label className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest w-8">Subj</label>
                                            <input
                                                placeholder="Subject"
                                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                                                value={formData.subject}
                                                onChange={(e) => handleChange("subject", e.target.value)}
                                                disabled={isSending || sendStatus === "success"}
                                            />
                                        </div>

                                        <textarea
                                            placeholder="Write your message..."
                                            className="flex-1 min-h-[250px] bg-transparent text-sm text-foreground/90 placeholder:text-muted-foreground/30 resize-none focus:outline-none leading-relaxed"
                                            value={formData.body}
                                            onChange={(e) => handleChange("body", e.target.value)}
                                            disabled={isSending || sendStatus === "success"}
                                        />
                                    </div>

                                    {/* Footer */}
                                    <div className="flex justify-between items-center px-5 py-3 border-t border-white/5 bg-white/[0.02]">
                                        <div className="flex gap-1">
                                            <button className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground/50 hover:text-muted-foreground transition-all" title="Attach file">
                                                <Paperclip size={16} />
                                            </button>
                                            <button className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground/50 hover:text-muted-foreground transition-all" title="Insert image">
                                                <ImageIcon size={16} />
                                            </button>
                                        </div>

                                        <motion.button
                                            onClick={handleSendClick}
                                            disabled={isSending || sendStatus === "success"}
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.97 }}
                                            className={cn(
                                                "px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200",
                                                sendStatus === "success"
                                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                    : "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40",
                                                (isSending || sendStatus === "success") && "cursor-not-allowed"
                                            )}
                                        >
                                            {isSending ? (
                                                <><Loader2 size={14} className="animate-spin" /> Sending...</>
                                            ) : sendStatus === "success" ? (
                                                <><CheckCircle size={14} /> Sent!</>
                                            ) : (
                                                <>Send <Send size={14} /></>
                                            )}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
