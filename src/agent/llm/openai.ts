import { LLMRequest, LLMResponse } from "./types";

/**
 * Call OpenAI API (chat completions).
 * User provides their own API key.
 */
export async function callOpenAI(
    apiKey: string,
    req: LLMRequest,
    model: string = "gpt-4o-mini"
): Promise<LLMResponse> {
    const start = Date.now();

    const messages: { role: string; content: string }[] = [];
    if (req.systemPrompt) {
        messages.push({ role: "system", content: req.systemPrompt });
    }
    messages.push({ role: "user", content: req.userPrompt });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: req.maxTokens || 1024,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return {
        text,
        provider: "openai",
        model,
        durationMs: Date.now() - start,
    };
}
