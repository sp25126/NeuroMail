import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local" });

const envSchema = z.object({
    // Authentication
    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is missing"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is missing"),
    NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is missing"),
    NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),

    // Gmail API
    GMAIL_PUB_SUB_TOPIC: z.string().optional().describe("Detailed separate check for optionality"),

    // Database (Prisma)
    DATABASE_URL: z.string().min(1, "DATABASE_URL is missing"),

    // AI / LLM
    OPENROUTER_API_KEY: z.string().optional(), // Optional if using local Ollama only

    // Observability
    SENTRY_DSN: z.string().optional(),
});

function validateEnv() {
    console.log("🔍 Validating Environment Variables...");

    try {
        const env = envSchema.parse(process.env);
        console.log("✅ Environment Variables are valid.");

        // Warnings for optional but recommended variables
        if (!env.SENTRY_DSN) console.warn("⚠️  Sentry DSN is missing. Crash reporting will be disabled.");

    } catch (error: any) {
        if (error instanceof z.ZodError || (error && typeof error === 'object' && 'issues' in error)) {
            console.error("❌ Invalid Environment Variables:");
            const issues = error.issues || [];
            issues.forEach((err: any) => {
                console.error(`   - ${err.path.join(".")}: ${err.message}`);
            });
            process.exit(1);
        }
        console.error("❌ Unexpected error during validation:", error);
        process.exit(1);
    }
}

validateEnv();
