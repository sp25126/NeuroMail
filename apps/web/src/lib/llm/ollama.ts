import { LLMRequest, LLMResponse } from "./types";

const OLLAMA_BASE = "http://localhost:11434";

/**
 * Call local Ollama via its HTTP API.
 * Requires Ollama to be running on localhost:11434.
 */
export async function callOllama(
    req: LLMRequest,
    model: string = "gemma2:2b"
): Promise<LLMResponse> {
    const start = Date.now();

    const messages: { role: string; content: string }[] = [];
    if (req.systemPrompt) {
        messages.push({ role: "system", content: req.systemPrompt });
    }
    messages.push({ role: "user", content: req.userPrompt });

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
                num_predict: req.maxTokens || 1024,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const text = data.message?.content || "";

    return {
        text,
        provider: "ollama",
        model,
        durationMs: Date.now() - start,
    };
}

/**
 * Check if Ollama is running and accessible
 */
export async function isOllamaAvailable(): Promise<boolean> {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
    } catch {
        return false;
    }
}
