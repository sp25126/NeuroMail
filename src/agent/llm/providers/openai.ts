import OpenAI from "openai";
import { BaseLLMProvider, LLMMessage, LLMStreamChunk } from "./base";
import { LLMConfig } from "../../types";

export class OpenAIProvider extends BaseLLMProvider {
    private client: OpenAI;

    constructor(config: LLMConfig) {
        super(config);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
        });
    }

    protected async _generateImpl(
        messages: LLMMessage[],
        options?: any
    ): Promise<{ content: string; tool_calls?: any[] }> {
        const span = this.logger.startSpan("openai.generate", {
            model: this.config.model,
        });

        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: messages as any,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
                tools: options?.tools,
                tool_choice: options?.tool_choice,
            });

            const message = response.choices[0].message;

            this.logger.info("OpenAI generation complete", {
                model: this.config.model,
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
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
        const span = this.logger.startSpan("openai.stream", {
            model: this.config.model,
        });

        try {
            const stream = await this.client.chat.completions.create({
                model: this.config.model,
                messages: messages as any,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
                tools: options?.tools,
                stream: true,
            });

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;

                if (delta?.content) {
                    yield {
                        type: "token",
                        content: delta.content,
                    };
                }

                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        yield {
                            type: "tool_call",
                            content: "",
                            tool_call: tc,
                        };
                    }
                }

                if (chunk.choices[0]?.finish_reason) {
                    yield {
                        type: "done",
                        content: "",
                        metadata: {
                            finishReason: chunk.choices[0].finish_reason,
                        },
                    };
                }
            }

            span.end({ success: true });
        } catch (error: any) {
            span.end({ success: false, error: error.message });
            throw error;
        }
    }

    async countTokens(messages: LLMMessage[]): Promise<number> {
        // Rough estimate
        const text = messages.map((m) => m.content).join(" ");
        return Math.ceil(text.length / 4);
    }
}
