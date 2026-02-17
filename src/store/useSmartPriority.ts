import { create } from 'zustand'

interface SmartPriorityState {
    priorityMap: Record<string, number> // threadId -> 0-100 score
    setPriority: (threadId: string, score: number) => void
    analyzePriority: (threadId: string, snippet: string, from: string) => number
}

export const useSmartPriority = create<SmartPriorityState>((set, get) => ({
    priorityMap: {},
    setPriority: (threadId, score) =>
        set((state) => ({ priorityMap: { ...state.priorityMap, [threadId]: score } })),

    analyzePriority: (threadId, snippet, from) => {
        // Mock AI Logic (Client-side heuristic for now)
        let score = 10

        // 1. Sender importance
        if (from.includes('boss') || from.includes('hr') || from.includes('admin')) score += 40
        if (from.includes('no-reply')) score -= 10

        // 2. Keyword urgency
        const urgencyKeywords = ['urgent', 'asap', 'action required', 'due', 'deadline', 'payment']
        const lowerSnippet = snippet.toLowerCase()
        if (urgencyKeywords.some(k => lowerSnippet.includes(k))) score += 30

        // 3. Question detection
        if (lowerSnippet.includes('?')) score += 10

        return Math.min(100, Math.max(0, score))
    }
}))
