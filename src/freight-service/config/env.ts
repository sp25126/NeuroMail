import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FREIGHT_DB_PATH: z.string().default("data/neuromail.db"),
  REDIS_URL: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().min(1, "OpenRouter API Key is required").optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid freight-service environment variables:", parsed.error.format());
    throw new Error("Invalid environment variables for freight-service");
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
