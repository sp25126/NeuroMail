import { db } from "./db";
import { LLMConfig } from "@/agent/types";
import { v4 as uuidv4 } from "uuid";

export async function getUserLLMConfig(userId: string): Promise<LLMConfig> {
    const row = await db.queryOne(
        "SELECT * FROM user_preferences WHERE user_id = ?",
        [userId]
    );

    if (!row) {
        // Return default (Ollama)
        return {
            provider: "ollama",
            model: "gemma2:2b",
            baseUrl: "http://localhost:11434",
            temperature: 0.7,
            streamingEnabled: true,
        };
    }

    return {
        provider: row.llm_provider as any,
        model: row.llm_model,
        apiKey: row.llm_api_key || undefined,
        temperature: row.llm_temperature,
        streamingEnabled: true,
    };
}

export async function updateUserLLMConfig(
    userId: string,
    config: Partial<LLMConfig>
): Promise<void> {
    const existing = await db.queryOne(
        "SELECT id FROM user_preferences WHERE user_id = ?",
        [userId]
    );

    const now = new Date().toISOString();

    if (existing) {
        await db.execute(
            `UPDATE user_preferences SET 
        llm_provider = COALESCE(?, llm_provider),
        llm_model = COALESCE(?, llm_model),
        llm_api_key = COALESCE(?, llm_api_key),
        llm_temperature = COALESCE(?, llm_temperature),
        updated_at = ?
      WHERE user_id = ?`,
            [
                config.provider,
                config.model,
                config.apiKey,
                config.temperature,
                now,
                userId,
            ]
        );
    } else {
        await db.execute(
            `INSERT INTO user_preferences (id, user_id, llm_provider, llm_model, llm_api_key, llm_temperature, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uuidv4(),
                userId,
                config.provider || "ollama",
                config.model || "gemma2:2b",
                config.apiKey || null,
                config.temperature || 0.7,
                now,
                now,
            ]
        );
    }
}
