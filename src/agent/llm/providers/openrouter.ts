import { BaseLLMProvider, LLMMessage, LLMStreamChunk } from "./base";
import { LLMConfig } from "../types";

export class OpenRouterProvider extends BaseLLMProvider {
    constructor(config: LLMConfig) {
        super(config);
    }

    protected async _generateImpl(
        messages: LLMMessage[],
        options?: any
    ): Promise<{ content: string; tool_calls?: any[] }> {
        const span = this.logger.startSpan("openrouter.generate", {
            model: this.config.model,
        });

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.config.apiKey}`,
                    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                    "X-Title": "AI Mail Copilot",
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages,
                    temperature: options?.temperature ?? this.config.temperature,
                    max_tokens: options?.maxTokens ?? this.config.maxTokens,
                    tools: options?.tools,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenRouter error: ${response.status} - ${error}`);
            }

            const data = await response.json();
            const message = data.choices[0].message;

            this.logger.info("OpenRouter generation complete", {
                model: this.config.model,
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
            });

            span.end({ success: true });

            return {
                content: message.content || "",
                tool_calls: message.tool_calls,
            };
        } catch (error: any) {
            span.end({ success: false, error: error.message });
            throw error;
        }
    }

    protected async *_generateStreamImpl(
        messages: LLMMessage[],
        options?: any
    ): AsyncGenerator<LLMStreamChunk> {
        const span = this.logger.startSpan("openrouter.stream", {
            model: this.config.model,
        });

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.config.apiKey}`,
                    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                    "X-Title": "AI Mail Copilot",
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages,
                    temperature: options?.temperature ?? this.config.temperature,
                    max_tokens: options?.maxTokens ?? this.config.maxTokens,
                    stream: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenRouter error: ${response.status}`);
            }

            const body = response.body;
            if (!body) {
                throw new Error("OpenRouter API response body is null");
            }

            const reader = body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith("data: ")) continue;

                    const data = line.slice(6);
                    if (data === "[DONE]") {
                        yield { type: "done", content: "" };
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices[0]?.delta;

                        if (delta?.content) {
                            yield { type: "token", content: delta.content };
                        }

                        if (delta?.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                yield { type: "tool_call", content: "", tool_call: tc };
                            }
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }

            span.end({ success: true });
        } catch (error: any) {
            span.end({ success: false, error: error.message });
            throw error;
        }
    }

    async countTokens(messages: LLMMessage[]): Promise<number> {
        const text = messages.map((m) => m.content).join(" ");
        return Math.ceil(text.length / 4);
    }
}
