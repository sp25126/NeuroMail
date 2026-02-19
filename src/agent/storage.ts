/**
 * Agent-layer storage helpers.
 * Thin wrappers around src/lib/user-preferences.ts for use inside the agent.
 * All functions are server-only (called from API routes only, never client).
 */

// Re-export the preferences functions the LLM layer needs.
// If src/lib/user-preferences.ts exists, re-export from there.
// If it doesn't exist yet, implement inline below.

export type UserPreferences = {
    id?: number;
    email: string;
    theme: "dark" | "light";
    llm_provider: "ollama" | "openai" | "openrouter" | "colab";
    llm_model?: string;
    llm_api_key?: string;
    colab_url?: string;
    persona: string;
};

/**
 * Gets preferences for a user by email.
 * Returns defaults if no record found.
 */
export async function getPreferenceByEmail(
    email: string
): Promise<UserPreferences> {
    try {
        // Dynamic import keeps better-sqlite3 out of the client bundle
        const { getUserLLMConfig } = await import("@/lib/user-preferences");
        const config = await getUserLLMConfig(email);
        return {
            email,
            theme: "dark", // Defaulting theme as it's not in the current LLMConfig db schema
            llm_provider: config.provider as any,
            llm_model: config.model,
            llm_api_key: config.apiKey,
            persona: "professional", // Defaulting persona
        };
    } catch {
        // Return safe defaults if DB not available
        return {
            email,
            theme: "dark",
            llm_provider: "ollama",
            persona: "professional",
        };
    }
}

/**
 * Saves or updates preferences for a user.
 */
export async function savePreferences(
    email: string,
    updates: Partial<UserPreferences>
): Promise<void> {
    try {
        const { updateUserLLMConfig } = await import("@/lib/user-preferences");
        await updateUserLLMConfig(email, {
            provider: updates.llm_provider as any,
            model: updates.llm_model,
            apiKey: updates.llm_api_key,
        });
    } catch (err) {
        console.error("[agent/storage] Failed to save preferences:", err);
    }
}
