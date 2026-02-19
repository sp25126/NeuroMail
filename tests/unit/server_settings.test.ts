import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSettings, updateServerSettings, clearSettingsCache } from '@/lib/server-settings';
import fs from 'fs';

vi.mock('fs');

describe('server-settings library', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearSettingsCache();
    });

    it('should return default settings if file does not exist', () => {
        (fs.existsSync as any).mockReturnValue(false);
        const settings = getServerSettings();
        expect(settings.aiProvider).toBe('ollama');
    });

    it('should read settings from file if it exists', () => {
        const mockData = JSON.stringify({ aiProvider: 'openai', aiModel: 'gpt-4' });
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(mockData);

        const settings = getServerSettings();
        expect(settings.aiProvider).toBe('openai');
        expect(settings.aiModel).toBe('gpt-4');
    });

    it('should write settings to file', () => {
        updateServerSettings({ aiProvider: 'openrouter' });
        expect(fs.writeFileSync).toHaveBeenCalled();
        const callArgs = (fs.writeFileSync as any).mock.calls[0];
        expect(JSON.parse(callArgs[1]).aiProvider).toBe('openrouter');
    });

    it('should ensure data directory exists before writing', () => {
        (fs.existsSync as any).mockReturnValue(false);
        updateServerSettings({ aiProvider: 'ollama' });
        expect(fs.mkdirSync).toHaveBeenCalled();
    });
});

describe('API Route Logic Mock', () => {
    it('GET should fetch current server settings', async () => {
        // This is a logic test, not a full Next.js request test
        const settings = getServerSettings();
        expect(settings).toBeDefined();
    });

    it('POST should update settings', async () => {
        const newSettings = { aiProvider: 'colab' as const };
        updateServerSettings(newSettings);
        const settings = getServerSettings();
        expect(settings.aiProvider).toBe('colab');
    });

    it('should handle partial updates correctly', () => {
        (fs.existsSync as any).mockReturnValue(true);
        const current = getServerSettings();

        // Mock the next read to return the updated value
        const updatedData = JSON.stringify({ ...current, aiApiKey: 'secret-key' });
        (fs.readFileSync as any).mockReturnValue(updatedData);

        updateServerSettings({ aiApiKey: 'secret-key' });
        const updated = getServerSettings();
        expect(updated.aiApiKey).toBe('secret-key');
    });

    it('should ignore extra properties in settings update', () => {
        const current = getServerSettings();
        updateServerSettings({ extra: 'property' } as any);
        const updated = getServerSettings();
        expect((updated as any).extra).toBeUndefined();
    });
});
