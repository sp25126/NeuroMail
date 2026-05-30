import { beforeAll, afterAll, afterEach } from "vitest";
import { runMigrations } from "@/lib/db/migrate";
import { initDb, db } from "@/lib/db";
import { runMigrations as runMigrationsWeb } from "../apps/web/src/lib/db/migrate";
import { initDb as initDbWeb, db as dbWeb } from "../apps/web/src/lib/db";

// Setup test database
const TEST_DB_PATH = ":memory:";

beforeAll(async () => {
    // Initialize the singleton DB instance with in-memory path for root db
    const database = initDb(TEST_DB_PATH);
    await runMigrations(database);

    // Initialize the singleton DB instance with in-memory path for apps/web db
    const databaseWeb = initDbWeb(TEST_DB_PATH);
    await runMigrationsWeb(databaseWeb);
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

    try {
        await dbWeb.execute("DELETE FROM freight_mailboxes");
        await dbWeb.execute("DELETE FROM freight_settings");
        await dbWeb.execute("DELETE FROM shipments");
        await dbWeb.execute("DELETE FROM shipment_identifiers");
        await dbWeb.execute("DELETE FROM raw_emails");
    } catch (error) {
        // Safe to ignore if tables not in schema
    }
});
