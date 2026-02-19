import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export interface ServerSettings {
    aiProvider: "ollama" | "openai" | "openrouter" | "colab";
    aiApiKey: string;
    aiModel: string;
    colabUrl: string;
    emailsPerPage: number;
    autoRefreshInterval: number;
    compactView: boolean;
    desktopNotifications: boolean;
    soundEnabled: boolean;
    persistAIChanges: boolean;
}

const DEFAULT_SETTINGS: ServerSettings = {
    aiProvider: "ollama",
    aiApiKey: "",
    aiModel: "llama3.2:latest",
    colabUrl: "",
    emailsPerPage: 20,
    autoRefreshInterval: 5,
    compactView: false,
    desktopNotifications: false,
    soundEnabled: true,
    persistAIChanges: false,
};

// In-memory cache for settings to avoid frequent sync issues during a single execution
let cachedSettings: ServerSettings | null = null;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        // Ignore errors in environments where fs might be mocked or restricted
    }
}

export function getServerSettings(): ServerSettings {
    if (cachedSettings) return cachedSettings;

    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const settings = JSON.parse(data);
            cachedSettings = { ...DEFAULT_SETTINGS, ...settings };
            return cachedSettings!;
        }
    } catch (error) {
        console.error("❌ Failed to read server settings:", error);
    }

    cachedSettings = { ...DEFAULT_SETTINGS };
    return cachedSettings;
}

export function updateServerSettings(newSettings: Partial<ServerSettings>): ServerSettings {
    try {
        // Ensure directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const current = getServerSettings();

        // Filter keys
        const filtered: Partial<ServerSettings> = {};
        Object.keys(newSettings).forEach(key => {
            if (key in DEFAULT_SETTINGS) {
                (filtered as any)[key] = (newSettings as any)[key];
            }
        });

        const updated = { ...current, ...filtered };

        // Update cache first
        cachedSettings = updated;

        // Persist to disk
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
        console.log("✅ Server settings updated");
        return updated;
    } catch (error) {
        console.error("❌ Failed to update server settings:", error);
        // Still return the updated object even if persistence fails, to keep app state consistent
        cachedSettings = { ...getServerSettings(), ...newSettings };
        return cachedSettings;
    }
}

/**
 * Clear cache (mainly for testing)
 */
export function clearSettingsCache() {
    cachedSettings = null;
}
