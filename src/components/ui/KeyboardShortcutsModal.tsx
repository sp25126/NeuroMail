"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, Keyboard } from "lucide-react"

interface Shortcut {
    keys: string[]
    description: string
}

const shortcuts: Shortcut[] = [
    { keys: ["C"], description: "Compose new email" },
    { keys: ["R"], description: "Reply to current thread" },
    { keys: ["/"], description: "Focus search" },
    { keys: ["Esc"], description: "Go back / Close modal" },
    { keys: ["1"], description: "Go to Inbox" },
    { keys: ["2"], description: "Go to Sent" },
    { keys: ["3"], description: "Go to Starred" },
    { keys: ["4"], description: "Go to Drafts" },
    { keys: ["5"], description: "Go to Trash" },
    { keys: ["S"], description: "Star current thread" },
    { keys: ["⌘", "K"], description: "Focus AI assistant" },
    { keys: ["?"], description: "Show this dialog" },
]

interface Props {
    isOpen: boolean
    onClose: () => void
}

export function KeyboardShortcutsModal({ isOpen, onClose }: Props) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="relative z-10 glass border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Keyboard className="h-5 w-5 text-primary" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground">Keyboard Shortcuts</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="h-5 w-5 text-muted-foreground" />
                            </button>
                        </div>

                        {/* Shortcuts List */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto scrollbar-hide">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {shortcuts.map((shortcut, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                        className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.06] transition-colors"
                                    >
                                        <span className="text-sm text-foreground/80">
                                            {shortcut.description}
                                        </span>
                                        <div className="flex gap-1">
                                            {shortcut.keys.map((key, i) => (
                                                <kbd
                                                    key={i}
                                                    className="px-2 py-1 text-[11px] font-bold text-foreground/90 bg-white/10 border border-white/10 rounded-md shadow-sm min-w-[28px] text-center"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/5 text-center text-xs text-muted-foreground/60">
                            Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-bold">?</kbd> to toggle this dialog
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
