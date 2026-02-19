import { LLMRequest, LLMResponse } from "./types";

/**
 * Call OpenRouter API (chat completions).
 * User provides their own API key.
 */
export async function callOpenRouter(
    apiKey: string,
    req: LLMRequest,
    model: string = "google/gemini-2.0-flash-001"
): Promise<LLMResponse> {
    const start = Date.now();

    const messages: { role: string; content: string }[] = [];
    if (req.systemPrompt) {
        messages.push({ role: "system", content: req.systemPrompt });
    }
    messages.push({ role: "user", content: req.userPrompt });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3003",
            "X-Title": "Neuromail AI",
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: req.maxTokens || 1024,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return {
        text,
        provider: "openrouter",
        model,
        durationMs: Date.now() - start,
    };
}
