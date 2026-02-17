
import "dotenv/config";
import { db, initDb } from "../src/lib/db";

async function main() {
    try {
        console.log('Testing connection to SQLite...');

        // Initialize DB
        initDb();

        // Query migrations table to verify connection
        const migrations = await db.query("SELECT * FROM migrations");
        console.log(`Connection successful. Applied migrations: ${migrations.length}`);
        console.log('Migrations:', migrations);

        // Check for other tables if they exist
        try {
            const logs = await db.query("SELECT COUNT(*) as count FROM ai_operation_logs");
            console.log(`AI Operation Logs count: ${logs[0].count}`);
        } catch (e) {
            console.log("ai_operation_logs table not found or empty");
        }

    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

main();
