import { ChangeStore } from "./types";
import { DOMChange } from "@/store/uiStore";
// We need a way to talk to the backend DB from here.
// Since this runs in the browser/client, we'll use an API endpoint.
// We'll also use localStorage for immediate availability.

export class PermanentChangeStore implements ChangeStore {
    private changes: DOMChange[] = [];
    private readonly STORAGE_KEY = 'ai_permanent_changes';
    private readonly API_URL = '/api/agent/ui-changes';

    constructor() {
        // Load from localStorage immediately for fast UI
        if (typeof window !== 'undefined') {
            this.restoreFromLocalStorage();
            // Then sync with server in background
            this.syncWithServer().catch(console.error);
        }
    }

    private restoreFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.changes = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to restore permanent changes from localStorage', e);
        }
    }

    public async syncWithServer() {
        try {
            const response = await fetch(this.API_URL, {
                method: 'GET',
                // Add headers for session/user auth if needed
            });
            if (response.ok) {
                const serverChanges = await response.json();
                // Merge strategies could be complex, for now, server is truth if valid
                if (Array.isArray(serverChanges) && serverChanges.length > 0) {
                    this.changes = serverChanges;
                    this.updateLocalStorage();
                }
            }
        } catch (e) {
            console.warn('Failed to sync permanent changes with server', e);
        }
    }

    save(change: DOMChange): void {
        this.changes.push(change);
        this.updateLocalStorage();
        this.saveToServer(change).catch(console.error);
    }

    private updateLocalStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.changes));
        } catch (e) {
            console.error('Failed to update localStorage', e);
        }
    }

    private async saveToServer(change: DOMChange) {
        try {
            await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(change)
            });
        } catch (e) {
            console.error('Failed to save change to server', e);
        }
    }

    restore(): DOMChange[] {
        return this.changes;
    }

    clear(): void {
        this.changes = [];
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.error('Failed to clear localStorage', e);
        }
        // Also clear on server
        fetch(this.API_URL, { method: 'DELETE' }).catch(console.error);
    }

    getChanges(): DOMChange[] {
        return this.changes;
    }
}
