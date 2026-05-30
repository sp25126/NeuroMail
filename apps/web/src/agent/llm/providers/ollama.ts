import { BaseLLMProvider, LLMMessage, LLMStreamChunk } from "./base";
import { LLMConfig } from "../../types";

export class OllamaProvider extends BaseLLMProvider {
    private baseUrl: string;

    constructor(config: LLMConfig) {
        super(config);
        this.baseUrl = config.baseUrl || "http://localhost:11434";
    }

    protected async _generateImpl(
        messages: LLMMessage[],
        options?: any
    ): Promise<{ content: string; tool_calls?: any[] }> {
        const span = this.logger.startSpan("ollama.generate", {
            model: this.config.model,
        });

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: this.convertMessages(messages),
                    stream: false,
                    options: {
                        temperature: options?.temperature ?? this.config.temperature,
                        num_predict: options?.maxTokens ?? this.config.maxTokens,
                    },
                    tools: options?.tools ? this.convertTools(options.tools) : undefined,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ollama API error: ${response.status} - ${error}`);
            }

            const data = await response.json();

            this.logger.info("Ollama generation complete", {
                model: this.config.model,
                promptTokens: data.prompt_eval_count || 0,
                completionTokens: data.eval_count || 0,
            });

            span.end({ success: true });

            return {
                content: data.message.content,
                tool_calls: data.message.tool_calls,
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
        const span = this.logger.startSpan("ollama.stream", {
            model: this.config.model,
        });

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: this.convertMessages(messages),
                    stream: true,
                    options: {
                        temperature: options?.temperature ?? this.config.temperature,
                        num_predict: options?.maxTokens ?? this.config.maxTokens,
                    },
                    tools: options?.tools ? this.convertTools(options.tools) : undefined,
                }),
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error("Ollama API response body is null");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const data = JSON.parse(line);

                        if (data.message?.content) {
                            yield {
                                type: "token",
                                content: data.message.content,
                            };
                        }

                        if (data.message?.tool_calls) {
                            for (const tc of data.message.tool_calls) {
                                yield {
                                    type: "tool_call",
                                    content: "",
                                    tool_call: tc,
                                };
                            }
                        }

                        if (data.done) {
                            yield {
                                type: "done",
                                content: "",
                                metadata: {
                                    promptTokens: data.prompt_eval_count || 0,
                                    completionTokens: data.eval_count || 0,
                                    totalDurationMs: data.total_duration / 1_000_000 || 0,
                                },
                            };
                        }
                    } catch (parseError) {
                        this.logger.warn("Failed to parse stream line", { line });
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
        // Rough estimate: 1 token ≈ 4 characters
        const text = messages.map((m) => m.content).join(" ");
        return Math.ceil(text.length / 4);
    }

    private convertMessages(messages: LLMMessage[]): any[] {
        return messages.map((m) => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
        }));
    }

    private convertTools(tools: any[]): any[] {
        return tools.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: "object",
                    properties: tool.parameters.reduce((acc: any, param: any) => {
                        acc[param.name] = {
                            type: param.type,
                            description: param.description,
                            enum: param.enum,
                        };
                        return acc;
                    }, {}),
                    required: tool.parameters
                        .filter((p: any) => p.required)
                        .map((p: any) => p.name),
                },
            },
        }));
    }
}
