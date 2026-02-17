import { runMigrations } from "../src/lib/db/migrate";
import path from "path";

async function main() {
    const dbPath = path.resolve(process.cwd(), "data", "agent", "agent.db");
    console.log(`🚀 Starting migrations for: ${dbPath}`);

    try {
        await runMigrations(dbPath);
        console.log("✅ Database initialized successfully");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

main();
