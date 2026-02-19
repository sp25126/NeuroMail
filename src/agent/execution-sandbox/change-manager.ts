import { DOMChange, useUIStore } from "@/store/uiStore";

// Re-export for compatibility
export type { DOMChange };

/**
 * Tracks AI-executed UI operations and supports rollback.
 * Proxies all state to the global Zustand uiStore.
 */
class ChangeManager {
    private mode: "temporary" | "permanent" = "temporary";

    setMode(mode: "temporary" | "permanent") {
        this.mode = mode;
    }

    getMode() {
        return this.mode;
    }

    record(change: Omit<DOMChange, "id" | "timestamp">) {
        const entry: DOMChange = {
            ...change,
            id: `change_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
        };

        // Dispatch to store
        useUIStore.getState().addChange(entry);

        return entry.id;
    }

    rollback(changeId: string) {
        // We only support rollback of the most recent change via the store
        // This method is kept for API compatibility but redirects to the store's LIFO revert
        useUIStore.getState().revertChanges();
        return true;
    }

    rollbackAll() {
        // Loop until empty
        const store = useUIStore.getState();
        while (store.aiPendingChanges.length > 0) {
            store.revertChanges();
        }
    }

    getHistory(): DOMChange[] {
        return useUIStore.getState().aiPendingChanges;
    }

    clear() {
        useUIStore.getState().clearChanges();
    }

    // Deprecated: No-op
    subscribe(callback: () => void) {
        return () => { };
    }
}

export const changeManager = new ChangeManager();
