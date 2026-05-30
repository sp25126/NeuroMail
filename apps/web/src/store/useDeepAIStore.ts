import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Persona = 'professional' | 'casual' | 'enthusiastic' | 'concise'

interface DeepAIState {
    persona: Persona
    styleProfile: string | null
    isAnalyzing: boolean

    setPersona: (p: Persona) => void
    setStyleProfile: (profile: string) => void
    setIsAnalyzing: (isAnalyzing: boolean) => void
    fetchPreferences: () => Promise<void>
}

export const useDeepAIStore = create<DeepAIState>()(
    persist(
        (set) => ({
            persona: 'professional',
            styleProfile: null,
            isAnalyzing: false,

            setPersona: (persona) => {
                set({ persona })
                fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ persona })
                }).catch(err => console.error("Failed to sync persona", err))
            },

            setStyleProfile: (styleProfile) => {
                set({ styleProfile })
                // Style profile might be too large or complex, but let's sync it if it's a string
                fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styleProfile }) // Note: Schema might need update for this if it wasn't there
                }).catch(err => console.error("Failed to sync style", err))
            },

            setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

            fetchPreferences: async () => {
                try {
                    const res = await fetch('/api/user/preferences')
                    if (res.ok) {
                        const data = await res.json()
                        set({
                            persona: data.persona as Persona || 'professional',
                            // styleProfile: data.styleProfile // if we had it in DB
                        })
                    }
                } catch (e) {
                    console.error("Failed to fetch preferences", e)
                }
            }
        }),
        {
            name: 'deep-ai-storage',
            onRehydrateStorage: () => (state) => {
                state?.fetchPreferences()
            }
        }
    )
)
