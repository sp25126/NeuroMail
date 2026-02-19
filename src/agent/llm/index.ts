import { LLMConfig, LLMProvider, LLMRequest, LLMResponse, DEFAULT_MODELS, PROVIDER_LABELS } from "./types";
import { callOllama, isOllamaAvailable } from "./ollama";
import { callOpenAI } from "./openai";
import { callOpenRouter } from "./openrouter";
import { getPreferenceByEmail } from "@/agent/storage";

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

        case "colab":
            // Colab Brain uses Ollama API format but at a custom tunnel URL
            const colabBaseUrl = config.colabUrl || process.env.NEXT_PUBLIC_COLAB_BRAIN_URL;
            if (!colabBaseUrl) throw new Error("Missing Colab Brain URL. Set it in AI Settings.");
            return callOllama(req, config.model, colabBaseUrl);

        default:
            throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
}

/**
 * Build LLMConfig from user preferences.
 * Falls back to Ollama if no provider is set.
 */
export async function getLLMConfig(userEmail: string): Promise<LLMConfig> {
    const prefs = await getPreferenceByEmail(userEmail);

    const provider: LLMProvider = prefs?.llm_provider || "ollama";
    const model = prefs?.llm_model || DEFAULT_MODELS[provider];
    const apiKey = prefs?.llm_api_key;
    const colabUrl = prefs?.colab_url;

    return { provider, model, apiKey, colabUrl };
}

/**
 * Get the current provider label for UI display
 */
export async function getProviderLabel(userEmail: string): Promise<string> {
    const config = await getLLMConfig(userEmail);
    return PROVIDER_LABELS[config.provider];
}

// Re-export types for convenience
export type { LLMProvider, LLMConfig, LLMRequest, LLMResponse } from "./types";
export { DEFAULT_MODELS, PROVIDER_LABELS } from "./types";
export { isOllamaAvailable } from "./ollama";
