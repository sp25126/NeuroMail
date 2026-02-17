import { beforeAll, afterAll, afterEach } from "vitest";
import { runMigrations } from "@/lib/db/migrate";
import { initDb, db } from "@/lib/db";

// Setup test database
const TEST_DB_PATH = ":memory:";

beforeAll(async () => {
    // Initialize the singleton DB instance with in-memory path
    const database = initDb(TEST_DB_PATH);
    await runMigrations(database);
});

afterEach(async () => {
    // Clean up test data using the shared instance
    try {
        await db.execute("DELETE FROM conversation_history");
        await db.execute("DELETE FROM tool_execution_logs");
        await db.execute("DELETE FROM macros");
    } catch (error) {
        console.error("Failed to clean up test database", error);
    }
});
