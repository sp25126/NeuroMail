import fs from 'fs';
import path from 'path';
import { LLMProvider } from './llm/types';

const STORAGE_PATH = path.join(process.cwd(), 'data', 'preferences.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}

export interface UserPreference {
    id: string;
    email: string;
    persona: string;
    tone: string;
    length: string;
    // LLM provider settings
    llmProvider: LLMProvider;
    llmModel?: string;
    llmApiKey?: string; // plain text for dev; encrypt in production
    updatedAt: string;
    createdAt: string;
}

export const getPreferences = (): UserPreference[] => {
    if (!fs.existsSync(STORAGE_PATH)) return [];
    try {
        const data = fs.readFileSync(STORAGE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading storage:", e);
        return [];
    }
};

export const savePreferences = (prefs: UserPreference[]) => {
    try {
        fs.writeFileSync(STORAGE_PATH, JSON.stringify(prefs, null, 2));
    } catch (e) {
        console.error("Error writing storage:", e);
    }
};

export const getPreferenceByEmail = (email: string) => {
    return getPreferences().find(p => p.email === email);
};

export const updatePreference = (email: string, data: Partial<UserPreference>) => {
    const prefs = getPreferences();
    const index = prefs.findIndex(p => p.email === email);

    if (index === -1) {
        const newPref: UserPreference = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
            email,
            persona: 'professional',
            tone: 'default',
            length: 'medium',
            llmProvider: 'ollama',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...data
        };
        prefs.push(newPref);
        savePreferences(prefs);
        return newPref;
    } else {
        prefs[index] = {
            ...prefs[index],
            ...data,
            updatedAt: new Date().toISOString()
        };
        savePreferences(prefs);
        return prefs[index];
    }
};

/** Mask an API key for safe display: "sk-abc...xyz" */
export const maskApiKey = (key?: string): string => {
    if (!key) return "";
    if (key.length <= 8) return "****";
    return key.slice(0, 6) + "****" + key.slice(-4);
};
