import 'server-only';
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { runMigrations } from "./db/migrate";

const DB_DIR = path.resolve(process.cwd(), "data", "agent");
const DB_PATH = path.join(DB_DIR, "agent.db");

function ensureDir() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
}

let _db: Database.Database | null = null;

export function initDb(customPath?: string) {
    if (_db) return _db;
    const pathToCheck = customPath || DB_PATH;
    if (!customPath) ensureDir();
    _db = new Database(pathToCheck);
    _db.pragma("journal_mode = WAL");

    // Run migrations on initialization
    runMigrations(_db).catch(err => {
        console.error("Failed to run database migrations:", err);
    });

    return _db;
}

function getDb() {
    if (!_db) {
        return initDb();
    }
    return _db;
}

export const db = {
    /**
     * Query rows from the database
     */
    async query(sql: string, params: any[] = []): Promise<any[]> {
        const dbInstance = getDb();
        try {
            return dbInstance.prepare(sql).all(...params);
        } catch (error) {
            console.error("Database query failed:", { sql, params, error });
            throw error;
        }
    },

    /**
     * Query a single row from the database
     */
    async queryOne(sql: string, params: any[] = []): Promise<any | null> {
        const dbInstance = getDb();
        try {
            return dbInstance.prepare(sql).get(...params) || null;
        } catch (error) {
            console.error("Database queryOne failed:", { sql, params, error });
            throw error;
        }
    },

    /**
     * Execute a write operation (INSERT, UPDATE, DELETE)
     */
    async execute(sql: string, params: any[] = []): Promise<void> {
        const dbInstance = getDb();
        try {
            dbInstance.prepare(sql).run(...params);
        } catch (error) {
            console.error("Database execute failed:", { sql, params, error });
            throw error;
        }
    },

    /**
     * Close the database connection
     */
    close() {
        if (_db) {
            _db.close();
            _db = null;
        }
    }
};
