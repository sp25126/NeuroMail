import { LLMConfig } from "./types";
import { BaseLLMProvider } from "./providers/base";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";
import { ColabProvider } from "./providers/colab";

import { getServerSettings } from "@/lib/server-settings";

export class LLMProviderFactory {
    static create(config: LLMConfig): BaseLLMProvider {
        switch (config.provider) {
            case "ollama":
                return new OllamaProvider(config);
            case "openai":
            case "anthropic":
                return new OpenAIProvider(config);
            case "openrouter":
                return new OpenRouterProvider(config);
            case "colab":
                return new ColabProvider(config);
            default:
                throw new Error(`Unsupported LLM provider: ${config.provider}`);
        }
    }

    static getDefaultConfig(): LLMConfig {
        const settings = getServerSettings();
        return {
            provider: settings.aiProvider,
            model: settings.aiModel,
            apiKey: settings.aiApiKey || undefined,
            baseUrl: settings.aiProvider === "colab" ? settings.colabUrl : undefined,
            temperature: 0.3,
            streamingEnabled: false,
        };
    }
}
