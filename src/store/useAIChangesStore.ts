import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PersistentChange {
    id: string;
    type: 'style' | 'dom' | 'script';
    selector?: string; // For style/dom changes
    value: string; // The CSS value or HTML content or Script code
    timestamp: number;
    description?: string; // Auto-generated description of what this change does
}

interface AIChangesState {
    isEnabled: boolean; // Global toggle for applying preserved changes
    changes: PersistentChange[];

    // Actions
    addChange: (change: Omit<PersistentChange, 'id' | 'timestamp'>) => void;
    removeChange: (id: string) => void;
    clearChanges: () => void;
    toggleEnabled: () => void;
    updateChange: (id: string, updates: Partial<PersistentChange>) => void;
}

export const useAIChangesStore = create<AIChangesState>()(
    persist(
        (set) => ({
            isEnabled: true, // Default to true, but user can disable "Permanent AI Changes" feature
            changes: [],

            addChange: (change) => set((state) => ({
                changes: [
                    ...state.changes,
                    {
                        ...change,
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                    }
                ]
            })),

            removeChange: (id) => set((state) => ({
                changes: state.changes.filter((c) => c.id !== id)
            })),

            clearChanges: () => set({ changes: [] }),

            toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),

            updateChange: (id, updates) => set((state) => ({
                changes: state.changes.map((c) =>
                    c.id === id ? { ...c, ...updates } : c
                )
            })),
        }),
        {
            name: 'ai-persistent-changes', // name of the item in the storage (must be unique)
            version: 1,
        }
    )
);
