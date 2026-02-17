import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Theme = "dark" | "light"

interface Settings {
    // Appearance
    theme: Theme
    compactView: boolean

    // AI
    aiProvider: "ollama" | "openai" | "openrouter"
    aiApiKey: string
    aiModel: string

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
}

const defaultSettings: Settings = {
    theme: "dark",
    compactView: false,
    isSidebarOpen: true, // Added
    showAssistant: true, // Added
    aiProvider: "ollama",
    aiApiKey: "",
    aiModel: "gemma2:2b",
    emailsPerPage: 20,
    autoRefreshInterval: 5,
    desktopNotifications: false,
    soundEnabled: true,
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
