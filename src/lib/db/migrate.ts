import 'server-only';
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("DatabaseMigration");

export async function runMigrations(dbPathOrInstance: string | Database.Database) {
    let db: Database.Database;
    let shouldClose = false;

    if (typeof dbPathOrInstance === "string") {
        db = new Database(dbPathOrInstance);
        shouldClose = true;
    } else {
        db = dbPathOrInstance;
    }

    // Create migrations table
    db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

    // Get applied migrations
    const appliedMigrations = db
        .prepare("SELECT name FROM migrations")
        .all()
        .map((r: any) => r.name);

    // Get migration files
    const migrationsDir = path.join(process.cwd(), "migrations");

    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

    // Apply pending migrations
    for (const file of migrationFiles) {
        if (appliedMigrations.includes(file)) {
            logger.debug(`Migration already applied: ${file}`);
            continue;
        }

        logger.info(`Applying migration: ${file}`);

        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

        try {
            db.exec(sql);
            db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)").run(
                file,
                new Date().toISOString()
            );

            logger.info(`Migration applied successfully: ${file}`);
        } catch (error: any) {
            logger.error(`Migration failed: ${file}`, { error: error.message });
            throw error;
        }
    }

    if (shouldClose) {
        db.close();
    }
    logger.info("All migrations completed");
}
