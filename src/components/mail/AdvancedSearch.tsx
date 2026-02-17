"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Filter, X, Calendar, Paperclip, Mail } from "lucide-react"
import { useMailStore } from "@/store/useMailStore"
import { toast } from "sonner"

interface SearchFilters {
    from: string
    to: string
    subject: string
    hasAttachment: boolean
    isUnread: boolean
    dateFrom: string
    dateTo: string
}

const defaultFilters: SearchFilters = {
    from: "",
    to: "",
    subject: "",
    hasAttachment: false,
    isUnread: false,
    dateFrom: "",
    dateTo: "",
}

export function AdvancedSearch() {
    const [isOpen, setIsOpen] = useState(false)
    const [filters, setFilters] = useState<SearchFilters>(defaultFilters)
    const { searchEmails } = useMailStore()

    const buildGmailQuery = () => {
        const parts: string[] = []
        if (filters.from) parts.push(`from:${filters.from}`)
        if (filters.to) parts.push(`to:${filters.to}`)
        if (filters.subject) parts.push(`subject:${filters.subject}`)
        if (filters.hasAttachment) parts.push("has:attachment")
        if (filters.isUnread) parts.push("is:unread")
        if (filters.dateFrom) parts.push(`after:${filters.dateFrom}`)
        if (filters.dateTo) parts.push(`before:${filters.dateTo}`)
        return parts.join(" ")
    }

    const handleSearch = async () => {
        const query = buildGmailQuery()
        if (!query) {
            toast.error("Add at least one filter")
            return
        }
        console.log("🔍 Advanced search:", query)
        setIsOpen(false)
        toast.promise(searchEmails(query), {
            loading: "Searching...",
            success: "Search complete",
            error: "Search failed",
        })
    }

    const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
        if (typeof value === "boolean") return value
        return value !== ""
    }).length

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 border border-white/5 transition-all relative"
            >
                <Filter size={13} />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">
                        {activeFilterCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="relative z-10 glass border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-5 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Search className="h-5 w-5 text-primary" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">Advanced Search</h2>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5 text-muted-foreground" />
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="p-5 space-y-4">
                                {/* From / To */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">From</label>
                                        <input
                                            type="text"
                                            value={filters.from}
                                            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                                            placeholder="sender@example.com"
                                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary/30 text-foreground placeholder:text-muted-foreground/40 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">To</label>
                                        <input
                                            type="text"
                                            value={filters.to}
                                            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                                            placeholder="recipient@example.com"
                                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary/30 text-foreground placeholder:text-muted-foreground/40 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Subject */}
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Subject</label>
                                    <input
                                        type="text"
                                        value={filters.subject}
                                        onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                                        placeholder="Email subject keywords"
                                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-primary/50                                        placeholder:text-muted-foreground outline-none transition-all"
                                    />
                                </div>

                                {/* Date Range */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                            <Calendar size={11} className="inline mr-1" />After
                                        </label>
                                        <input
                                            type="date"
                                            value={filters.dateFrom}
                                            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-primary/50 text-foreground outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                            <Calendar size={11} className="inline mr-1" />Before
                                        </label>
                                        <input
                                            type="date"
                                            value={filters.dateTo}
                                            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-primary/50 text-foreground outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Toggle Filters */}
                                <div className="flex gap-3">
                                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.06] transition-colors flex-1">
                                        <input
                                            type="checkbox"
                                            checked={filters.hasAttachment}
                                            onChange={(e) => setFilters({ ...filters, hasAttachment: e.target.checked })}
                                            className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
                                        />
                                        <Paperclip size={13} className="text-muted-foreground" />
                                        <span className="text-xs text-foreground">Has attachment</span>
                                    </label>
                                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.06] transition-colors flex-1">
                                        <input
                                            type="checkbox"
                                            checked={filters.isUnread}
                                            onChange={(e) => setFilters({ ...filters, isUnread: e.target.checked })}
                                            className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
                                        />
                                        <Mail size={13} className="text-muted-foreground" />
                                        <span className="text-xs text-foreground">Unread only</span>
                                    </label>
                                </div>

                                {/* Query Preview */}
                                {buildGmailQuery() && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/10"
                                    >
                                        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Query Preview</span>
                                        <p className="text-xs text-primary font-mono mt-1">{buildGmailQuery()}</p>
                                    </motion.div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between p-5 border-t border-white/5">
                                <button
                                    onClick={() => setFilters(defaultFilters)}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Reset filters
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSearch}
                                        className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-all flex items-center gap-1.5"
                                    >
                                        <Search size={13} />
                                        Search
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    )
}
