import { LLMConfig } from "../types";
import { createLogger } from "../../observability/logger";

const logger = createLogger("LLMProvider");

export interface LLMMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: any[];
    name?: string;
}

export interface LLMStreamChunk {
    type: "token" | "tool_call" | "done" | "error";
    content: string;
    tool_call?: any;
    metadata?: any;
}

export abstract class BaseLLMProvider {
    protected config: LLMConfig;
    protected logger = logger;

    constructor(config: LLMConfig) {
        this.config = config;
    }

    /**
     * Generate completion with automatic retries
     */
    async generate(
        messages: LLMMessage[],
        options?: {
            tools?: any[];
            temperature?: number;
            maxTokens?: number;
            tool_choice?: any;
        }
    ): Promise<{ content: string; tool_calls?: any[] }> {
        const maxRetries = 3;
        const retryDelays = [1000, 2000, 4000]; // Exponential backoff

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this._generateImpl(messages, options);
            } catch (error: any) {
                const isLastAttempt = attempt === maxRetries - 1;

                if (isLastAttempt) {
                    this.logger.error("LLM generation failed after retries", {
                        provider: this.config.provider,
                        model: this.config.model,
                        attempt,
                        error: error.message,
                    });
                    throw error;
                }

                // Check if error is retryable
                if (this.isRetryableError(error)) {
                    const delay = retryDelays[attempt];
                    this.logger.warn("Retrying LLM call", {
                        provider: this.config.provider,
                        attempt,
                        delayMs: delay,
                        error: error.message,
                    });
                    await this.sleep(delay);
                    continue;
                }

                // Non-retryable error
                throw error;
            }
        }

        throw new Error("Unexpected retry loop exit");
    }

    /**
     * Stream completion with automatic reconnection
     */
    async *generateStream(
        messages: LLMMessage[],
        options?: {
            tools?: any[];
            temperature?: number;
            maxTokens?: number;
        }
    ): AsyncGenerator<LLMStreamChunk> {
        const maxRetries = 2;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                yield* this._generateStreamImpl(messages, options);
                return; // Success
            } catch (error: any) {
                const isLastAttempt = attempt === maxRetries - 1;

                if (isLastAttempt) {
                    this.logger.error("LLM streaming failed after retries", {
                        provider: this.config.provider,
                        attempt,
                        error: error.message,
                    });
                    yield {
                        type: "error",
                        content: `Streaming failed: ${error.message}`,
                    };
                    return;
                }

                if (this.isRetryableError(error)) {
                    this.logger.warn("Retrying stream", { attempt });
                    await this.sleep(1000 * (attempt + 1));
                    continue;
                }

                throw error;
            }
        }
    }

    /**
     * Count tokens (provider-specific)
     */
    abstract countTokens(messages: LLMMessage[]): Promise<number>;

    /**
     * Implementation-specific generation
     */
    protected abstract _generateImpl(
        messages: LLMMessage[],
        options?: any
    ): Promise<{ content: string; tool_calls?: any[] }>;

    /**
     * Implementation-specific streaming
     */
    protected abstract _generateStreamImpl(
        messages: LLMMessage[],
        options?: any
    ): AsyncGenerator<LLMStreamChunk>;

    /**
     * Check if error is retryable
     */
    protected isRetryableError(error: any): boolean {
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        const retryableMessages = [
            "timeout",
            "rate limit",
            "overloaded",
            "connection",
        ];

        if (error.status && retryableStatuses.includes(error.status)) {
            return true;
        }

        if (error.message) {
            const msg = error.message.toLowerCase();
            return retryableMessages.some((m) => msg.includes(m));
        }

        return false;
    }

    protected sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
