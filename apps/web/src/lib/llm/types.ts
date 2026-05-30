export type LLMProvider = "ollama" | "openai" | "openrouter";

export interface LLMConfig {
    provider: LLMProvider;
    model: string;
    apiKey?: string; // needed for cloud only
}

export interface LLMRequest {
    systemPrompt?: string;
    userPrompt: string;
    /** Max tokens to generate */
    maxTokens?: number;
}

export interface LLMResponse {
    text: string;
    provider: LLMProvider;
    model: string;
    /** Duration in ms */
    durationMs: number;
}

/** Default models per provider */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
    ollama: "gemma2:2b",
    openai: "gpt-4o-mini",
    openrouter: "google/gemini-2.0-flash-001",
};

/** Provider display names */
export const PROVIDER_LABELS: Record<LLMProvider, string> = {
    ollama: "Local Ollama",
    openai: "OpenAI",
    openrouter: "OpenRouter",
};
