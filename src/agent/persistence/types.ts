import { DOMChange } from "../execution-sandbox/change-manager";

export type PersistenceMode = 'temporary' | 'permanent';

export interface ChangeStore {
    /**
     * Save a change to the store
     */
    save(change: DOMChange): Promise<void> | void;

    /**
     * Restore changes from the store
     */
    restore(): Promise<DOMChange[]> | DOMChange[];

    /**
     * Clear all changes from the store
     */
    clear(): Promise<void> | void;

    /**
     * Get all stored changes
     */
    getChanges(): Promise<DOMChange[]> | DOMChange[];
}
