const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const DB_DIR = path.resolve(process.cwd(), "data", "agent");
const DB_PATH = path.join(DB_DIR, "agent.db");
const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

function init() {
    console.log(`🚀 Initializing database: ${DB_PATH}`);

    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Create migrations table
    db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
        )
    `);

    const applied = db.prepare("SELECT name FROM migrations").all().map(m => m.name);

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith(".sql"))
        .sort();

    for (const file of files) {
        if (applied.includes(file)) {
            console.log(`- Skipping ${file} (already applied)`);
            continue;
        }

        console.log(`- Applying ${file}...`);
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

        try {
            db.exec(sql);
            db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)").run(
                file,
                new Date().toISOString()
            );
            console.log(`  ✅ Success`);
        } catch (err) {
            console.error(`  ❌ Failed: ${err.message}`);
            process.exit(1);
        }
    }

    db.close();
    console.log("✨ Database initialization complete");
}

init();
