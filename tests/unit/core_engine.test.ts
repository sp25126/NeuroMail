import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMProviderFactory } from '@/agent/llm/factory';
import { ColabProvider } from '@/agent/llm/providers/colab';
import { OllamaProvider } from '@/agent/llm/providers/ollama';
import { OpenRouterProvider } from '@/agent/llm/providers/openrouter';
import { OpenAIProvider } from '@/agent/llm/providers/openai';
import { getServerSettings, updateServerSettings } from '@/lib/server-settings';

// Mock server settings
vi.mock('@/lib/server-settings', () => ({
    getServerSettings: vi.fn(),
    updateServerSettings: vi.fn(),
}));

describe('LLMProviderFactory', () => {
    it('should create an OllamaProvider', () => {
        const config = { provider: 'ollama' as const, model: 'llama3', temperature: 0.7, streamingEnabled: false };
        const provider = LLMProviderFactory.create(config);
        expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should create a ColabProvider', () => {
        const config = { provider: 'colab' as const, model: 'llama3', baseUrl: 'http://test-colab.ngrok.io', temperature: 0.7, streamingEnabled: false };
        const provider = LLMProviderFactory.create(config);
        expect(provider).toBeInstanceOf(ColabProvider);
    });

    it('should create an OpenRouterProvider', () => {
        const config = { provider: 'openrouter' as const, model: 'gpt-4', apiKey: 'test-key', temperature: 0.7, streamingEnabled: false };
        const provider = LLMProviderFactory.create(config);
        expect(provider).toBeInstanceOf(OpenRouterProvider);
    });

    it('should create an OpenAIProvider', () => {
        const config = { provider: 'openai' as const, model: 'gpt-4', apiKey: 'test-key', temperature: 0.7, streamingEnabled: false };
        const provider = LLMProviderFactory.create(config);
        expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should get default config from server settings', () => {
        const mockSettings = {
            aiProvider: 'colab',
            aiModel: 'llama3.2',
            aiApiKey: 'test-api-key',
            colabUrl: 'http://ngrok.test'
        };
        (getServerSettings as any).mockReturnValue(mockSettings);

        const config = LLMProviderFactory.getDefaultConfig();
        expect(config.provider).toBe('colab');
        expect(config.model).toBe('llama3.2');
        expect(config.apiKey).toBe('test-api-key');
        expect(config.baseUrl).toBe('http://ngrok.test');
    });
});

describe('ColabProvider Context Window', () => {
    it('should include num_ctx: 8192 in the request options', async () => {
        const config = { provider: 'colab' as const, model: 'llama3', baseUrl: 'http://test-colab.ngrok.io', temperature: 0.7, streamingEnabled: false };
        const provider = new ColabProvider(config);

        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ message: { content: 'hello' } })
        } as any);

        await (provider as any)._generateImpl([{ role: 'user', content: 'hi' }]);

        const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(callBody.options.num_ctx).toBe(8192);

        fetchSpy.mockRestore();
    });
});

describe('OllamaProvider Options', () => {
    it('should default num_ctx to 4096 for local performance', async () => {
        const config = { provider: 'ollama' as const, model: 'llama3', temperature: 0.7, streamingEnabled: false };
        const provider = new OllamaProvider(config);

        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ message: { content: 'hello' } })
        } as any);

        await (provider as any)._generateImpl([{ role: 'user', content: 'hi' }]);

        const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(callBody.options.num_ctx).toBe(4096);

        fetchSpy.mockRestore();
    });
});
