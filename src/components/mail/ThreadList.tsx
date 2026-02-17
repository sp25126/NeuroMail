"use client"

import { useState, useEffect } from "react"
import { useMailStore } from "@/store/useMailStore"
import { cn } from "@/lib/utils"
import { Menu, Archive, Trash2, Search, X, Filter } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { decode } from "html-entities"
import { motion, AnimatePresence } from "framer-motion"
import { BulkActionsBar } from "./BulkActionsBar"
import { SnoozeMenu } from "./SnoozeMenu"
import { AdvancedSearch } from "./AdvancedSearch"

export function ThreadList({ onMenuClick }: { onMenuClick?: () => void }) {
    const {
        selectedThreadId,
        setSelectedThread,
        searchQuery,
        setSearchQuery,
        activeFilter,
        clearFilter,
        emails: threads,
        isLoading,
        error,
        fetchThreads,
        currentFolder
    } = useMailStore()

    const [localSearch, setLocalSearch] = useState("")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        console.log("📱 [INBOX] Component mounted, fetching threads");
        fetchThreads()
    }, [fetchThreads]) // Initial fetch

    console.log("🎨 [INBOX] Rendering with", threads?.length || 0, "emails");


    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setSearchQuery(localSearch.trim())
    }

    const handleClearSearch = () => {
        setLocalSearch("")
        clearFilter()
    }

    const toggleThreadSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const handleSnooze = (id: string, until: Date) => {
        console.log(`Snoozing ${id} until ${until}`)
        // API call would go here
    }

    return (
        <div className="w-full glass border-r flex flex-col h-[100dvh] overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5 backdrop-blur-xl z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onMenuClick} className="lg:hidden p-2 hover:bg-white/10 rounded-full transition-colors">
                        <Menu size={20} />
                    </button>
                    <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
                        {currentFolder.charAt(0).toUpperCase() + currentFolder.slice(1)} <span className="text-primary ml-1">({threads?.length || 0})</span>
                    </h2>
                </div>
                <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                </div>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="px-3 pt-3">
                <div className="relative group">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Search emails..."
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 placeholder:text-muted-foreground/30 transition-all"
                    />
                    {(localSearch || searchQuery) && (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </form>

            {/* Advanced Search Button */}
            <div className="px-3 pt-2 flex justify-end">
                <AdvancedSearch />
            </div>

            {/* Active Filter Badge */}
            <AnimatePresence>
                {activeFilter && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-3 pt-2"
                    >
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                            <Filter size={12} className="text-primary shrink-0" />
                            <span className="text-[11px] font-semibold text-primary flex-1 truncate">{activeFilter.label}</span>
                            <button
                                onClick={clearFilter}
                                className="p-0.5 rounded hover:bg-primary/20 text-primary/60 hover:text-primary transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick Filter Controls */}
            <div className="px-3 pt-3 flex gap-2">
                <button
                    onClick={() => useMailStore.getState().setFilter({ unread: true })}
                    className={cn(
                        "flex-1 px-2 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all",
                        activeFilter?.label === 'Unread'
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                    )}
                >
                    Unread
                </button>
                <button
                    onClick={() => useMailStore.getState().setFilter({ starred: true })}
                    className={cn(
                        "flex-1 px-2 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all",
                        activeFilter?.label === 'Starred'
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                    )}
                >
                    Starred
                </button>
                <button
                    onClick={() => useMailStore.getState().setFilter({ hasAttachment: true })}
                    className={cn(
                        "flex-1 px-2 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all",
                        activeFilter?.label === 'Has Attachment'
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                    )}
                >
                    Attachments
                </button>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
                {isLoading && (
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-3">
                                <div className="flex justify-between">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-12" />
                                </div>
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                        Unable to fetch threads.
                    </div>
                )}

                {!isLoading && !error && threads?.length === 0 && (
                    <div className="p-8 text-center space-y-2">
                        <Search size={24} className="mx-auto text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground/60">No emails found</p>
                        {searchQuery && (
                            <button onClick={handleClearSearch} className="text-xs text-primary hover:underline">
                                Clear search
                            </button>
                        )}
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {threads?.map((thread: any, i: number) => {
                        const isUrgent = thread.snippet.toLowerCase().includes('urgent') || thread.sender.toLowerCase().includes('files');
                        const isSelected = selectedThreadId === thread.id;

                        return (
                            <motion.div
                                key={thread.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 30 }}
                                className={cn(
                                    "w-full text-left p-4 rounded-xl border transition-all duration-300 group relative overflow-hidden cursor-pointer",
                                    isSelected
                                        ? "bg-primary/10 border-primary/50 shadow-[0_0_20px_rgba(var(--primary)/0.1)]"
                                        : "bg-card/40 border-white/5 hover:bg-white/10 hover:border-white/20 hover:shadow-lg",
                                    selectedIds.has(thread.id) && "ring-1 ring-primary/40 bg-primary/5"
                                )}
                                onClick={() => setSelectedThread(thread.id)}
                            >
                                {/* Selection Checkbox */}
                                <div
                                    className="absolute left-2 top-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => toggleThreadSelection(thread.id, e)}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded border border-white/20 flex items-center justify-center transition-colors",
                                        selectedIds.has(thread.id) ? "bg-primary border-primary" : "bg-white/5"
                                    )}>
                                        {selectedIds.has(thread.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                    </div>
                                </div>
                                {/* Selection Indicator */}
                                {isSelected && (
                                    <motion.div
                                        layoutId="active-glow"
                                        className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none"
                                    />
                                )}

                                {/* Card Content */}
                                <div className="relative z-10 flex flex-col gap-1.5">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            {isUrgent && (
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                </span>
                                            )}
                                            <span className={cn(
                                                "font-semibold text-sm truncate max-w-[180px]",
                                                isSelected ? "text-primary" : "text-foreground group-hover:text-white"
                                            )}>
                                                {thread.sender}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-mono opacity-70">
                                            {thread.date}
                                        </span>
                                    </div>

                                    <div className={cn(
                                        "text-xs font-medium truncate pr-4 transition-colors",
                                        isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/80"
                                    )}>
                                        {decode(thread.subject)}
                                    </div>

                                    <div className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                        {decode(thread.snippet)}
                                    </div>

                                    {/* Action Shortcuts (Desktop Hover) */}
                                    <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <SnoozeMenu threadId={thread.id} onSnooze={(until) => handleSnooze(thread.id, until)} />
                                        <div className="p-1.5 rounded-md bg-background/50 backdrop-blur-md border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/20">
                                            <Archive size={14} />
                                        </div>
                                        <div className="p-1.5 rounded-md bg-background/50 backdrop-blur-md border border-white/10 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 size={14} />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </AnimatePresence>
            </div>

            {/* Compose FAB */}
            <div className="absolute bottom-6 right-6 z-50">
                <motion.button
                    onClick={() => useMailStore.getState().openCompose()}
                    whileHover={{ scale: 1.1, boxShadow: "0 0 30px hsl(217 91% 60% / 0.5)" }}
                    whileTap={{ scale: 0.95 }}
                    className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow flex items-center justify-center animate-pulse-glow"
                    title="Compose Email"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                </motion.button>
            </div>

            <BulkActionsBar
                selectedCount={selectedIds.size}
                onMarkAsRead={() => { console.log("Mark as read", selectedIds); setSelectedIds(new Set()); }}
                onMarkAsUnread={() => { console.log("Mark as unread", selectedIds); setSelectedIds(new Set()); }}
                onArchive={() => { console.log("Archive", selectedIds); setSelectedIds(new Set()); }}
                onDelete={() => { console.log("Delete", selectedIds); setSelectedIds(new Set()); }}
                onClear={() => setSelectedIds(new Set())}
            />
        </div>
    )
}

