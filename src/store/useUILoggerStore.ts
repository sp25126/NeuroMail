import { create } from 'zustand'

export interface LogEntry {
    id: string
    timestamp: string
    type: 'info' | 'success' | 'warning' | 'error' | 'tool' | 'sandbox'
    message: string
    details?: any
}

interface UILoggerState {
    logs: LogEntry[]
    addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
    clearLogs: () => void
}

export const useUILoggerStore = create<UILoggerState>((set) => ({
    logs: [],
    addLog: (entry) => set((state) => ({
        logs: [
            {
                ...entry,
                id: Math.random().toString(36).substring(7),
                timestamp: new Date().toLocaleTimeString(),
            },
            ...state.logs.slice(0, 99), // Keep last 100 logs
        ],
    })),
    clearLogs: () => set({ logs: [] }),
}))
