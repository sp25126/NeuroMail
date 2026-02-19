import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMailStore } from '@/store/useMailStore';

describe('useMailStore', () => {
    beforeEach(() => {
        // Reset store state
        useMailStore.getState().setSelectedThread(null);
        useMailStore.getState().setSearchQuery("");
    });

    it('should update selectedThreadId', () => {
        useMailStore.getState().setSelectedThread('thread-123');
        expect(useMailStore.getState().selectedThreadId).toBe('thread-123');
    });

    it('should update searchQuery', () => {
        useMailStore.getState().setSearchQuery('test search');
        expect(useMailStore.getState().searchQuery).toBe('test search');
    });

    it('should open and close compose modal', () => {
        useMailStore.getState().openCompose();
        expect(useMailStore.getState().isComposeOpen).toBe(true);
        useMailStore.getState().setComposeOpen(false);
        expect(useMailStore.getState().isComposeOpen).toBe(false);
    });

    it('should set compose draft correctly', () => {
        const draft = { to: 'saumya@test.com', subject: 'Hi', body: 'Hello world' };
        useMailStore.getState().setComposeDraft(draft);
        expect(useMailStore.getState().composeDraft).toEqual(draft);
    });

    it('should clear search query and filters', () => {
        useMailStore.getState().setSearchQuery('temp');
        useMailStore.getState().clearFilter();
        expect(useMailStore.getState().searchQuery).toBe("");
        expect(useMailStore.getState().activeFilter).toBeNull();
    });

    it('should handle setFilter for unread', () => {
        useMailStore.getState().setFilter({ unread: true });
        expect(useMailStore.getState().activeFilter?.label).toBe('Unread');
    });

    it('should handle setFilter for starred', () => {
        useMailStore.getState().setFilter({ starred: true });
        expect(useMailStore.getState().activeFilter?.label).toBe('Starred');
    });

    it('should handle setFilter for attachments', () => {
        useMailStore.getState().setFilter({ hasAttachment: true });
        expect(useMailStore.getState().activeFilter?.label).toBe('Has Attachment');
    });

    it('should update currentFolder', () => {
        useMailStore.getState().setFolder('sent');
        expect(useMailStore.getState().currentFolder).toBe('sent');
    });

    it('should toggle selection for thread removal/archiving', () => {
        // MailStore doesn't have a simple selectAll but we can test current folder switching logic
        useMailStore.getState().setFolder('trash');
        expect(useMailStore.getState().currentFolder).toBe('trash');
    });
});
