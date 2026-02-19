import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemporaryChangeStore } from '@/agent/persistence/temporary-store';
import { PermanentChangeStore } from '@/agent/persistence/permanent-store';
import { persistenceManager } from '@/agent/persistence';
import { DOMChange } from '@/agent/execution-sandbox/change-manager';

// Mock Browser Storage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; })
    };
})();

const sessionStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; })
    };
})();

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('sessionStorage', sessionStorageMock);

describe('Persistence System', () => {
    const mockChange: DOMChange = {
        id: 'test-1',
        timestamp: 1234567890,
        type: 'property',
        target: '#btn',
        property: 'style.color',
        newValue: 'red',
        oldValue: 'blue'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.clear();
        sessionStorageMock.clear();

        const fetchMock = vi.fn((url, options) => {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
            } as any);
        });

        vi.stubGlobal('fetch', fetchMock);
        if (typeof window !== 'undefined') {
            Object.defineProperty(window, 'fetch', {
                writable: true,
                value: fetchMock
            });
        } else {
            vi.stubGlobal('window', { fetch: fetchMock });
        }

        persistenceManager.reset();
    });

    describe('TemporaryChangeStore', () => {
        it('should save to sessionStorage', () => {
            const store = new TemporaryChangeStore();
            store.save(mockChange);
            const saved = sessionStorage.getItem('ai_temp_changes');
            expect(saved).toBeDefined();
            expect(JSON.parse(saved!)[0].id).toBe('test-1');
        });

        it('should restore from sessionStorage', () => {
            sessionStorage.setItem('ai_temp_changes', JSON.stringify([mockChange]));
            const store = new TemporaryChangeStore();
            const changes = store.getChanges();
            expect(changes.length).toBe(1);
            expect(changes[0].id).toBe('test-1');
        });

        it('should clear storage', () => {
            const store = new TemporaryChangeStore();
            store.save(mockChange);
            store.clear();
            expect(sessionStorage.getItem('ai_temp_changes')).toBeNull();
        });
    });

    describe('PermanentChangeStore', () => {
        it('should save to localStorage and attempt server sync', async () => {
            const store = new PermanentChangeStore();
            store.save(mockChange);

            // Check LocalStorage immediately (synchronous)
            const saved = localStorage.getItem('ai_permanent_changes');
            expect(saved).toBeDefined();
            expect(JSON.parse(saved!)[0].id).toBe('test-1');

            // Trigger sync explicitly for testing (This is GET)
            await store.syncWithServer();

            // Wait for POST call
            await vi.waitUntil(() => {
                const calls = (global.fetch as any).mock.calls;
                return calls.some((c: any[]) => c[1]?.method === 'POST');
            }, { timeout: 1000 });

            // Check Server Sync attempt
            const calls = (global.fetch as any).mock.calls;
            const postCall = calls.find((c: any[]) => c[1]?.method === 'POST');

            expect(postCall).toBeDefined();
            expect(postCall[0]).toContain('/api/agent/ui-changes');
        });

        it('should load from localStorage on init', () => {
            localStorage.setItem('ai_permanent_changes', JSON.stringify([mockChange]));
            const store = new PermanentChangeStore();
            expect(store.getChanges().length).toBe(1);
        });
    });

    describe('PersistenceManager', () => {
        it('should switch modes correctly', () => {
            persistenceManager.setMode('temporary');
            persistenceManager.save(mockChange);
            expect(sessionStorage.getItem('ai_temp_changes')).toBeDefined();
            expect(localStorage.getItem('ai_permanent_changes')).toBeNull();

            persistenceManager.setMode('permanent');
            const change2 = { ...mockChange, id: 'test-2' };
            persistenceManager.save(change2);
            expect(localStorage.getItem('ai_permanent_changes')).toBeDefined();
        });

        it('should migrate changes when switching to permanent', () => {
            persistenceManager.setMode('temporary');
            persistenceManager.save(mockChange);

            persistenceManager.setMode('permanent');

            // Should have moved to permanent store
            const permChanges = JSON.parse(localStorage.getItem('ai_permanent_changes') || '[]');
            expect(permChanges.length).toBeGreaterThan(0);
            expect(permChanges.find((c: any) => c.id === 'test-1')).toBeDefined();

            // And cleared from temp
            expect(sessionStorage.getItem('ai_temp_changes')).toBeNull();
        });
    });
});
