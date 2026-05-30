import { LLMConfig } from "../types";
import { BaseLLMProvider } from "./providers/base";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";

export class LLMProviderFactory {
    static create(config: LLMConfig): BaseLLMProvider {
        switch (config.provider) {
            case "ollama":
                return new OllamaProvider(config);
            case "openai":
            case "anthropic": // Same API format usually if proxied, or OpenAIProvider can handle baseURL
                return new OpenAIProvider(config);
            case "openrouter":
                return new OpenRouterProvider(config);
            default:
                throw new Error(`Unsupported LLM provider: ${config.provider}`);
        }
    }
}
