import { ChangeStore, PersistenceMode } from "./types";
import { TemporaryChangeStore } from "./temporary-store";
import { PermanentChangeStore } from "./permanent-store";
import { DOMChange } from "../execution-sandbox/change-manager";

class PersistenceManager implements ChangeStore {
    private temporaryStore: TemporaryChangeStore;
    private permanentStore: PermanentChangeStore;
    private currentMode: PersistenceMode = 'temporary';

    constructor() {
        this.temporaryStore = new TemporaryChangeStore();
        this.permanentStore = new PermanentChangeStore();
    }

    public setMode(mode: PersistenceMode) {
        console.log(`[PERSISTENCE] Switching to ${mode} mode`);
        this.currentMode = mode;
        // When switching, we might want to migrate changes?
        // For now, keep them separate.
        // If switching to permanent, maybe we should save current temp changes?
        // User requirements didn't specify, but it's a good UX.
        // Let's implement migration from temp to perm.
        if (mode === 'permanent') {
            const tempChanges = this.temporaryStore.getChanges();
            tempChanges.forEach(c => this.permanentStore.save(c));
            this.temporaryStore.clear(); // Clear temp once migrated
        }
    }

    public get activeStore(): ChangeStore {
        return this.currentMode === 'permanent' ? this.permanentStore : this.temporaryStore;
    }

    save(change: DOMChange): void {
        this.activeStore.save(change);
    }

    restore(): Promise<DOMChange[]> | DOMChange[] {
        return this.activeStore.restore();
    }

    clear(): void {
        this.activeStore.clear();
    }

    getChanges(): Promise<DOMChange[]> | DOMChange[] {
        return this.activeStore.getChanges();
    }

    /**
     * For testing purposes only
     */
    reset() {
        this.temporaryStore.clear();
        this.permanentStore.clear();
        this.currentMode = 'temporary';
    }
}

export const persistenceManager = new PersistenceManager();
