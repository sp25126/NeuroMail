"use client"

import { useEffect } from "react"
import { useMailStore } from "@/store/useMailStore"
import { toast } from "sonner"

export function KeyboardShortcuts() {
    const { setSelectedThread } = useMailStore()

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (
                document.activeElement?.tagName === "INPUT" ||
                document.activeElement?.tagName === "TEXTAREA" ||
                (document.activeElement as HTMLElement)?.isContentEditable
            ) {
                return
            }

            // Command/Ctrl + K: Focus Search (Future)
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault()
                toast("Search shortcut coming soon!")
            }

            // Esc: Clear selection
            if (e.key === "Escape") {
                setSelectedThread(null)
            }

            // J/K Navigation (Vim style)
            if (e.key === "j" || e.key === "ArrowDown") {
                // Logic to select next thread would go here
            }
            if (e.key === "k" || e.key === "ArrowUp") {
                // Logic to select prev thread would go here
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [setSelectedThread])

    return null
}
