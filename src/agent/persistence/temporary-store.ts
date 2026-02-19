import { ChangeStore } from "./types";
import { DOMChange } from "@/store/uiStore";

export class TemporaryChangeStore implements ChangeStore {
    private changes: DOMChange[] = [];
    private readonly STORAGE_KEY = 'ai_temp_changes';

    constructor() {
        if (typeof window !== 'undefined') {
            this.restoreFromStorage();

            // Auto-clear on unload to ensure true temporary nature upon new session start
            // or we can keep it for session duration (refresh) but clear on tab close.
            // sessionStorage clears on tab close automatically.
            // However, the requirement says "Temporary changes vanish on refresh" in success metrics.
            // But usually session storage survives refresh. 
            // If the goal is "vanish on refresh", we should not use sessionStorage, or clear it on load.
            // "Temporary changes vanish on refresh" -> this implies in-memory only?
            // "Restore on page load" -> inconsistent with "Vanish on refresh".
            // Let's stick to "Session Mode": Persist on refresh, clear on tab close. 
            // If user wants vanish on refresh, that's just in-memory.
            // The implementation plan said: "Store in sessionStorage (clears on tab close)"
            // AND "Restore on page load".
            // So we will stick to sessionStorage.
        }
    }

    private restoreFromStorage() {
        try {
            const stored = sessionStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.changes = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to restore temporary changes', e);
        }
    }

    save(change: DOMChange): void {
        this.changes.push(change);
        this.persist();
    }

    private persist() {
        try {
            sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.changes));
        } catch (e) {
            console.warn('Failed to save temporary changes', e);
        }
    }

    restore(): DOMChange[] {
        return this.changes;
    }

    clear(): void {
        this.changes = [];
        try {
            sessionStorage.removeItem(this.STORAGE_KEY);
        } catch (e) { }
    }

    getChanges(): DOMChange[] {
        return this.changes;
    }
}
