import { BaseLLMProvider, LLMMessage, LLMStreamChunk } from "./base";
import { LLMConfig } from "../types";

/**
 * ColabProvider - Connects to a Google Colab T4 GPU via an ngrok tunnel.
 * The Colab notebook runs Ollama + FastAPI and exposes the same /api/chat endpoint.
 */
export class ColabProvider extends BaseLLMProvider {
    private colabUrl: string;

    constructor(config: LLMConfig) {
        super(config);
        // colabUrl is passed via baseUrl field in LLMConfig
        this.colabUrl = (config.baseUrl || "").replace(/\/$/, "");
        if (!this.colabUrl) {
            throw new Error("ColabProvider requires a baseUrl (ngrok tunnel URL).");
        }
    }

    /**
     * Test if the Colab tunnel is alive
     */
    static async testConnection(url: string): Promise<{ ok: boolean; model?: string; error?: string }> {
        try {
            const cleanUrl = url.replace(/\/$/, "");
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(`${cleanUrl}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: true, model: data.model };
            }
            return { ok: false, error: `HTTP ${res.status}` };
        } catch (e: any) {
            return { ok: false, error: e.message || "Connection failed" };
        }
    }

    protected async _generateImpl(
        messages: LLMMessage[],
        options?: any
    ): Promise<{ content: string; tool_calls?: any[] }> {
        const span = this.logger.startSpan("colab.generate", { model: this.config.model });
        console.log("🔌 [COLAB] Connecting to:", this.colabUrl); // DEBUG LOG

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout (GPU is fast)

            const response = await fetch(`${this.colabUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.config.model,
                    messages: this.convertMessages(messages),
                    stream: false,
                    options: {
                        temperature: options?.temperature ?? this.config.temperature,
                        num_predict: options?.maxTokens ?? 2048,
                        num_ctx: 8192, // T4 GPU can handle larger context
                    },
                    tools: options?.tools || undefined,
                }),
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                // Fallback: if model doesn't support tools, retry without them
                if (response.status === 400 && errorText.includes("does not support tools") && options?.tools) {
                    console.warn(`⚠️ [COLAB] Model ${this.config.model} doesn't support tools. Retrying...`);
                    return this._generateImpl(messages, { ...options, tools: undefined });
                }

                // Fallback for missing models (404)
                if (response.status === 404 && this.config.model !== "llama3.2:latest") {
                    console.warn(`⚠️ [COLAB] Model ${this.config.model} not found. Falling back to llama3.2:latest...`);
                    const originalModel = this.config.model;
                    this.config.model = "llama3.2:latest"; // Use the one we know is installed
                    try {
                        // Recurse with default model
                        // We must reconstruct the request with the new model
                        // Note: options.tools might need to be checked again if llama3.2 supports it (it does)
                        const result = await this._generateImpl(messages, options);
                        this.config.model = originalModel; // Restore config for UI consistency
                        return result;
                    } catch (e) {
                        this.config.model = originalModel;
                        throw e;
                    }
                }

                throw new Error(`Colab API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            span.end({ success: true });

            return {
                content: data.message?.content || "",
                tool_calls: data.message?.tool_calls,
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
        const span = this.logger.startSpan("colab.stream", { model: this.config.model });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            const response = await fetch(`${this.colabUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.config.model,
                    messages: this.convertMessages(messages),
                    stream: true,
                    options: {
                        temperature: options?.temperature ?? this.config.temperature,
                        num_predict: options?.maxTokens ?? 2048,
                    },
                    tools: options?.tools || undefined,
                }),
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 400 && errorText.includes("does not support tools") && options?.tools) {
                    yield* this._generateStreamImpl(messages, { ...options, tools: undefined });
                    return;
                }
                throw new Error(`Colab API error: ${response.status} - ${errorText}`);
            }

            if (!response.body) throw new Error("Colab response body is null");

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
                            yield { type: "token", content: data.message.content };
                        }
                        if (data.message?.tool_calls) {
                            for (const tc of data.message.tool_calls) {
                                yield { type: "tool_call", content: "", tool_call: tc };
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
                    } catch {
                        this.logger.warn("Failed to parse Colab stream line", { line });
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

    private convertMessages(messages: LLMMessage[]): any[] {
        return messages.map((m) => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
        }));
    }
}
