import { LLMConfig, LLMProvider, LLMRequest, LLMResponse, DEFAULT_MODELS, PROVIDER_LABELS } from "./types";
import { callOllama, isOllamaAvailable } from "./ollama";
import { callOpenAI } from "./openai";
import { callOpenRouter } from "./openrouter";
import { getPreferenceByEmail } from "../storage";

/**
 * The single entry point for ALL LLM calls in the application.
 * No other code should call providers directly.
 */
export async function generateLLMResponse(
    config: LLMConfig,
    req: LLMRequest
): Promise<LLMResponse> {
    console.log(`[LLM] Calling ${PROVIDER_LABELS[config.provider]} (${config.model})...`);

    switch (config.provider) {
        case "ollama":
            return callOllama(req, config.model);

        case "openai":
            if (!config.apiKey) throw new Error("Missing OpenAI API key. Set it in AI Settings.");
            return callOpenAI(config.apiKey, req, config.model);

        case "openrouter":
            if (!config.apiKey) throw new Error("Missing OpenRouter API key. Set it in AI Settings.");
            return callOpenRouter(config.apiKey, req, config.model);

        default:
            throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
}

/**
 * Build LLMConfig from user preferences.
 * Falls back to Ollama if no provider is set.
 */
export function getLLMConfig(userEmail: string): LLMConfig {
    const prefs = getPreferenceByEmail(userEmail);

    const provider: LLMProvider = prefs?.llmProvider || "ollama";
    const model = prefs?.llmModel || DEFAULT_MODELS[provider];
    const apiKey = prefs?.llmApiKey;

    return { provider, model, apiKey };
}

/**
 * Get the current provider label for UI display
 */
export function getProviderLabel(userEmail: string): string {
    const config = getLLMConfig(userEmail);
    return PROVIDER_LABELS[config.provider];
}

// Re-export types for convenience
export type { LLMProvider, LLMConfig, LLMRequest, LLMResponse } from "./types";
export { DEFAULT_MODELS, PROVIDER_LABELS } from "./types";
export { isOllamaAvailable } from "./ollama";
