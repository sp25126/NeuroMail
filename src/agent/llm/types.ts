export type LLMProvider = "ollama" | "openai" | "openrouter" | "colab" | "anthropic";

export interface LLMConfig {
    provider: LLMProvider;
    model: string;
    apiKey?: string; // needed for cloud only
    colabUrl?: string; // The ngrok tunnel URL for Colab Brain
    baseUrl?: string;
    temperature?: number;
    streamingEnabled?: boolean;
    maxTokens?: number;
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
    openai: "gpt-4o",
    openrouter: "anthropic/claude-3.5-sonnet",
    colab: "gemma2:2b", // Default for colab
    anthropic: "claude-3-opus-20240229",
};

/** Provider display names */
export const PROVIDER_LABELS: Record<LLMProvider, string> = {
    ollama: "Local (Ollama)",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    colab: "Colab Brain",
    anthropic: "Anthropic",
};
