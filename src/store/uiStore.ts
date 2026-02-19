import { create } from "zustand";

export interface DOMChange {
    id: string;
    timestamp: number;
    operation: string;
    description: string;
    params: Record<string, unknown>;
    undoFn?: () => void;
    target?: string;
    property?: string;
    oldValue?: unknown;
    newValue?: unknown;
}

interface UIState {
    // Core State
    emails: any[];
    searchQuery: string;
    isSyncing: boolean;
    aiPendingChanges: DOMChange[];

    // Legacy/Other State (Preserved for compatibility if needed, but discouraged)
    composeButtonColor: string | null;
    searchCommand: { query: string; timestamp: number };

    // Actions
    setEmails: (emails: any[]) => void;
    setSearchQuery: (query: string) => void;
    setIsSyncing: (isSyncing: boolean) => void;

    // AI Change Management
    addChange: (change: DOMChange) => void;
    clearChanges: () => void;
    revertChanges: () => void;

    // Legacy Actions
    setComposeButtonColor: (color: string | null) => void;
    setSearchCommand: (command: { query: string; timestamp: number }) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    // Initial State
    emails: [],
    searchQuery: "",
    isSyncing: false,
    aiPendingChanges: [],
    composeButtonColor: null,
    searchCommand: { query: "", timestamp: 0 },

    // Actions implementation
    setEmails: (emails) => set({ emails }),

    setSearchQuery: (query) => set({
        searchQuery: query,
        // Also update legacy searchCommand for backward compat depending on what listens to it
        searchCommand: { query, timestamp: Date.now() }
    }),

    setIsSyncing: (isSyncing) => set({ isSyncing }),

    addChange: (change) => set((state) => ({
        aiPendingChanges: [change, ...state.aiPendingChanges]
    })),

    clearChanges: () => set({ aiPendingChanges: [] }),

    revertChanges: () => {
        const changes = get().aiPendingChanges;
        if (changes.length === 0) return;

        const [lastChange, ...rest] = changes;
        if (lastChange.undoFn) {
            try {
                lastChange.undoFn();
            } catch (e) {
                console.error("Failed to revert change:", e);
            }
        }
        set({ aiPendingChanges: rest });
    },

    setComposeButtonColor: (color) => set({ composeButtonColor: color }),
    setSearchCommand: (command) => set({ searchCommand: command }),
}));
