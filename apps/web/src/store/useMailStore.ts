import { create } from 'zustand'

interface ActiveFilter {
    label: string
    query: string
}

/**
 * Maps sidebar folder IDs to Gmail search queries.
 * This is the single source of truth for folder→query translation.
 */
const FOLDER_QUERY_MAP: Record<string, string> = {
    inbox: 'in:inbox',
    sent: 'in:sent',
    starred: 'is:starred',
    drafts: 'in:draft',
    trash: 'in:trash',
}

interface MailState {
    currentFolder: string
    selectedThreadId: string | null
    currentThread: any | null
    isComposeOpen: boolean
    composeDraft: { to: string; subject: string; body: string; threadId?: string }
    searchQuery: string
    activeFilter: ActiveFilter | null
    view: 'inbox' | 'thread' | 'compose' | 'settings' | 'dashboard' | 'alerts' | 'reports'

    // Data State
    emails: any[]
    isLoading: boolean
    error: string | null

    // Actions
    setFolder: (folder: string) => void
    setSelectedThread: (id: string | null) => Promise<void>
    setCurrentThread: (thread: any | null) => void
    setComposeOpen: (isOpen: boolean) => void
    setComposeDraft: (draft: { to: string; subject: string; body: string; threadId?: string }) => void
    setComposeData: (data: { to: string; subject: string; body: string; threadId?: string }) => void
    setSearchQuery: (query: string) => void
    setActiveFilter: (filter: ActiveFilter) => void
    clearFilter: () => void
    setView: (view: 'inbox' | 'thread' | 'compose' | 'settings' | 'dashboard' | 'alerts' | 'reports') => void
    markAsRead: (threadId: string) => Promise<void>
    openCompose: (data?: Partial<{ to: string; subject: string; body: string; threadId?: string }>) => void

    // UI State
    isMobileMenuOpen: boolean
    setMobileMenuOpen: (isOpen: boolean) => void

    // Async Actions
    fetchThreads: () => Promise<void>
    refreshThreads: () => Promise<void>
    searchEmails: (query: string) => Promise<any[]>

    // New Actions for Registry
    setCurrentView: (view: any) => void
    setFilter: (filter: any) => void
    clearFilters: () => void
    clearSearch: () => void
    sendEmail: () => Promise<void>
    starThread: (id: string) => Promise<void>
    unstarThread: (id: string) => Promise<void>
    markAsUnread: (id: string) => Promise<void>
    archiveThread: (id: string) => Promise<void>
    deleteThread: (id: string) => Promise<void>
    markAsSpam: (id: string) => Promise<void>
    syncNow: () => Promise<void>
    selectAll: () => void
    deselectAll: () => void
    setSortOrder: (order: string) => void
    updateSettings: (settings: any) => void
}

export const useMailStore = create<MailState>((set, get) => ({
    currentFolder: 'inbox',
    selectedThreadId: null,
    currentThread: null,
    isComposeOpen: false,
    isMobileMenuOpen: false,
    setMobileMenuOpen: (isOpen) => set({ isMobileMenuOpen: isOpen }),
    composeDraft: { to: '', subject: '', body: '' },
    searchQuery: '',
    activeFilter: null,
    view: 'inbox',

    // Data State
    emails: [],
    isLoading: false,
    error: null,

    // New Registry Helpers
    setCurrentView: (view) => {
        set({ view });
        if (view === 'inbox') get().fetchThreads();
    },
    setFilter: (filter) => {
        console.log("🔎 [STORE] setFilter:", filter);
        // const currentActive = get().activeFilter || { label: '', query: '' }; // This line was unused and caused the linting error
        // Simple mapping for demo purposes
        if (filter.unread) {
            set({ activeFilter: { label: 'Unread', query: 'is:unread' } });
            get().searchEmails('is:unread');
        } else if (filter.starred) {
            set({ activeFilter: { label: 'Starred', query: 'is:starred' } });
            get().searchEmails('is:starred');
        } else if (filter.hasAttachment) {
            set({ activeFilter: { label: 'Has Attachment', query: 'has:attachment' } });
            get().searchEmails('has:attachment');
        }
    },
    clearFilters: () => {
        set({ activeFilter: null, searchQuery: '' });
        get().fetchThreads();
    },
    clearSearch: () => {
        set({ searchQuery: '', activeFilter: null });
        get().fetchThreads();
    },
    sendEmail: async () => {
        console.log("📨 [STORE] Sending email...");
        // Mock send
        set({ isComposeOpen: false, composeDraft: { to: '', subject: '', body: '' } });
    },
    starThread: async (id) => {
        console.log("⭐ [STORE] Star thread:", id);
        // Optimistic update
        const emails = get().emails.map(e => e.id === id ? { ...e, isStarred: true } : e);
        set({ emails });
    },
    unstarThread: async (id) => {
        console.log("⭐ [STORE] Unstar thread:", id);
        // Optimistic update
        const emails = get().emails.map(e => e.id === id ? { ...e, isStarred: false } : e);
        set({ emails });
    },
    markAsUnread: async (id) => {
        console.log("badger [STORE] Mark as unread:", id);
        // Optimistic update
        const emails = get().emails.map(e => e.id === id ? { ...e, isRead: false } : e);
        set({ emails });
    },
    archiveThread: async (id) => {
        console.log("📦 [STORE] Archive thread:", id);
        // Optimistic remove
        const emails = get().emails.filter(e => e.id !== id);
        set({ emails });
    },
    deleteThread: async (id) => {
        console.log("🗑️ [STORE] Delete thread:", id);
        // Optimistic remove
        const emails = get().emails.filter(e => e.id !== id);
        set({ emails });
    },
    markAsSpam: async (id) => {
        console.log("🚫 [STORE] Mark as spam:", id);
        // Optimistic remove
        const emails = get().emails.filter(e => e.id !== id);
        set({ emails });
    },
    syncNow: async () => {
        console.log("🔄 [STORE] Sync now");
        get().fetchThreads();
    },
    selectAll: () => {
        console.log("✅ [STORE] Select all");
    },
    deselectAll: () => {
        console.log("❎ [STORE] Deselect all");
    },
    setSortOrder: (order) => {
        console.log("Sorting by:", order);
        // Mock sort
        const emails = [...get().emails];
        if (order === 'date_desc') emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (order === 'date_asc') emails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        set({ emails });
    },
    updateSettings: (settings) => {
        console.log("⚙️ [STORE] Update settings:", settings);
    },

    setFolder: (folder) => {
        console.log("📁 [STORE] Switching folder to:", folder)
        const isView = ['dashboard', 'alerts', 'reports'].includes(folder)
        set({
            currentFolder: folder,
            searchQuery: '',
            activeFilter: null,
            view: isView ? folder as any : 'inbox',
            selectedThreadId: null
        })
        if (!isView) {
            get().fetchThreads()
        }
    },
    setSelectedThread: async (id) => {
        if (!id) {
            set({ selectedThreadId: null, currentThread: null, view: 'inbox' })
            return
        }
        set({ selectedThreadId: id, view: 'thread' })
        console.log("📖 [STORE] Loading thread detail:", id)
        try {
            const res = await fetch(`/api/mail/threads/${id}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            set({ currentThread: data })
            console.log("✅ [STORE] Thread loaded:", data.subject)
        } catch (err: any) {
            console.error("❌ [STORE] Thread load failed:", err)
            // Fall back to a basic thread object from the emails list
            const emails = get().emails
            const fallback = emails.find((e: any) => e.id === id)
            if (fallback) {
                set({
                    currentThread: {
                        ...fallback,
                        lastMessage: {
                            from: fallback.sender,
                            snippet: fallback.snippet,
                            timestamp: fallback.date,
                        }
                    }
                })
            }
        }
    },
    setCurrentThread: (thread) => set({ currentThread: thread }),
    setComposeOpen: (isOpen) => set({ isComposeOpen: isOpen }),
    setComposeDraft: (draft) => set({ composeDraft: draft }),
    setComposeData: (data) => set({ composeDraft: data, isComposeOpen: true }),

    setSearchQuery: (query) => {
        set({ searchQuery: query })
        if (query) {
            get().searchEmails(query)
        } else {
            get().fetchThreads()
        }
    },

    setActiveFilter: (filter) => {
        set({ activeFilter: filter, searchQuery: filter.query })
        get().searchEmails(filter.query)
    },

    clearFilter: () => {
        set({ activeFilter: null, searchQuery: '' })
        get().fetchThreads()
    },

    setView: (view) => set({ view }),

    markAsRead: async (threadId) => {
        console.log(`Marking thread ${threadId} as read`);
        // Optimistic update
        const emails = get().emails.map(e => e.id === threadId ? { ...e, isRead: true } : e);
        set({ emails });
    },

    openCompose: (data = {}) => {
        set({
            composeDraft: {
                to: data.to || '',
                subject: data.subject || '',
                body: data.body || '',
                threadId: data.threadId,
            },
            isComposeOpen: true,
        })
    },

    fetchThreads: async () => {
        set({ isLoading: true, error: null })
        try {
            const { searchQuery, currentFolder } = get()

            // Build the Gmail query
            let q: string
            if (searchQuery) {
                // User-driven search overrides folder
                q = searchQuery
            } else {
                // Use the folder→query mapping
                q = FOLDER_QUERY_MAP[currentFolder] || 'in:inbox'
            }

            console.log("🔄 [STORE] fetchThreads | folder:", currentFolder, "| query:", q)

            const res = await fetch(`/api/mail/threads?q=${encodeURIComponent(q)}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const data = await res.json()
            console.log("📦 [STORE] Received", data.threads?.length || 0, "threads")

            set({
                emails: Array.isArray(data.threads) ? data.threads : [],
                isLoading: false
            })
        } catch (error: any) {
            console.error("💥 [STORE] fetchThreads error:", error)
            set({ error: error.message, isLoading: false })
        }
    },

    refreshThreads: async () => {
        try {
            const { searchQuery, currentFolder, isLoading } = get()
            if (isLoading) return // Don't double-fetch if already loading explicitly

            // Build the Gmail query
            let q: string
            if (searchQuery) {
                q = searchQuery
            } else {
                q = FOLDER_QUERY_MAP[currentFolder] || 'in:inbox'
            }

            console.log("📡 [STORE] background refresh | folder:", currentFolder, "| query:", q)

            const res = await fetch(`/api/mail/threads?q=${encodeURIComponent(q)}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const data = await res.json()
            const newThreads = Array.isArray(data.threads) ? data.threads : []

            // Only update if there's actually a change to avoid unnecessary re-renders
            // A simple length check or comparing the first ID is usually enough for "new mail" detection
            if (newThreads.length !== get().emails.length || (newThreads[0]?.id !== get().emails[0]?.id)) {
                console.log("✨ [STORE] New mail detected, updating list")
                set({ emails: newThreads })
            }
        } catch (error: any) {
            console.error("💥 [STORE] refreshThreads error:", error)
        }
    },

    searchEmails: async (query: string) => {
        set({ isLoading: true, error: null })
        try {
            console.log("🔎 [STORE] searchEmails:", query)
            const res = await fetch(`/api/mail/threads?q=${encodeURIComponent(query)}`)
            if (!res.ok) throw new Error("Search failed")
            const data = await res.json()

            const threads = Array.isArray(data.threads) ? data.threads : [];
            set({
                emails: threads,
                isLoading: false,
                searchQuery: query
            })
            console.log("✅ [STORE] Search complete:", threads.length, "results")
            return threads;
        } catch (error: any) {
            console.error("❌ [STORE] Search failed:", error)
            set({ error: error.message, isLoading: false })
            return [];
        }
    }
}))
