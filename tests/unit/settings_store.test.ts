import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettingsStore } from '@/store/useSettingsStore';

describe('useSettingsStore', () => {
    beforeEach(() => {
        useSettingsStore.getState().resetSettings();
    });

    it('should have correct default settings', () => {
        const state = useSettingsStore.getState();
        expect(state.aiProvider).toBe('ollama');
        expect(state.aiModel).toBe('llama3.2:latest');
        expect(state.persistAIChanges).toBe(false);
    });

    it('should update settings correctly', () => {
        const { updateSettings } = useSettingsStore.getState();
        updateSettings({ aiProvider: 'colab', colabUrl: 'http://test-url' });

        const state = useSettingsStore.getState();
        expect(state.aiProvider).toBe('colab');
        expect(state.colabUrl).toBe('http://test-url');
    });

    it('should reset settings to defaults', () => {
        const { updateSettings, resetSettings } = useSettingsStore.getState();
        updateSettings({ aiProvider: 'openai' });
        resetSettings();

        const state = useSettingsStore.getState();
        expect(state.aiProvider).toBe('ollama');
    });

    it('should toggle persistAIChanges', () => {
        const { updateSettings } = useSettingsStore.getState();
        updateSettings({ persistAIChanges: true });
        expect(useSettingsStore.getState().persistAIChanges).toBe(true);
    });
});
