import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Theme = "dark" | "light"

interface Settings {
    // Appearance
    theme: Theme
    compactView: boolean

    // AI
    aiProvider: "ollama" | "openai" | "openrouter" | "colab"
    aiApiKey: string
    aiModel: string
    colabUrl: string // ngrok tunnel URL for Colab Brain
    persistAIChanges: boolean // Added for AI controller

    // Email
    emailsPerPage: number
    autoRefreshInterval: number // minutes

    // Layout
    isSidebarOpen: boolean
    showAssistant: boolean

    // Notifications
    desktopNotifications: boolean
    soundEnabled: boolean
}

interface SettingsStore extends Settings {
    updateSettings: (settings: Partial<Settings>) => void
    resetSettings: () => void
    applyTheme: (theme: Theme) => void
    setPrimaryColor: (hex: string) => void
}

const defaultSettings: Settings = {
    theme: "dark",
    compactView: false,
    isSidebarOpen: true,
    showAssistant: true,
    aiProvider: "ollama",
    aiApiKey: "",
    aiModel: "llama3.2:latest",
    colabUrl: "https://97cd-136-111-0-182.ngrok-free.app",
    persistAIChanges: false,
    emailsPerPage: 20,
    autoRefreshInterval: 5,
    desktopNotifications: false,
    soundEnabled: true,
    // Default primary color (blue-ish)
    // primaryColor is not in Settings interface yet, need to add it above if we want persistence
}

// Helper: Hex to HSL
// format: "217 91% 60%"
const hexToHsl = (hex: string): string | null => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    } else {
        return null;
    }

    r /= 255;
    g /= 255;
    b /= 255;
    const cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin;
    let h = 0,
        s = 0,
        l = 0;

    if (delta === 0) h = 0;
    else if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    l = (cmax + cmin) / 2;
    s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return `${h} ${s}% ${l}%`;
}


export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set, get) => ({
            ...defaultSettings,

            updateSettings: (newSettings) => {
                console.log("⚙️ Updating settings:", Object.keys(newSettings))
                set((state) => ({ ...state, ...newSettings }))

                // Apply theme change immediately
                if (newSettings.theme) {
                    get().applyTheme(newSettings.theme)
                }
            },

            resetSettings: () => {
                console.log("🔄 Resetting settings to defaults")
                set(defaultSettings)
                get().applyTheme(defaultSettings.theme)
            },

            applyTheme: (theme: Theme) => {
                if (typeof document !== "undefined") {
                    const html = document.documentElement
                    html.classList.remove("light", "dark")
                    html.classList.add(theme)
                }
            },

            setPrimaryColor: (hex: string) => {
                const hsl = hexToHsl(hex);
                if (hsl && typeof document !== "undefined") {
                    console.log(`🎨 Setting Theme Color: ${hex} -> ${hsl}`);
                    document.documentElement.style.setProperty('--primary', hsl);

                    // Also set a neon accent for the 'neon' theme effect
                    // Just confusingly using --neon-blue for now or we can add a new var
                    // For now, just overriding primary is enough for the button
                }
            }
        }),
        {
            name: "neuromail-settings",
            onRehydrateStorage: () => (state) => {
                // Apply saved theme on load
                if (state?.theme) {
                    state.applyTheme(state.theme)
                }
            },
        }
    )
)
