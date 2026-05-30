"use client"

import { Moon, Sun } from "lucide-react"
import { useSettingsStore } from "@/store/useSettingsStore"
import { motion } from "framer-motion"
import { toast } from "sonner"

export function ThemeToggle() {
    const { theme, updateSettings } = useSettingsStore()

    const toggleTheme = () => {
        const newTheme = theme === "dark" ? "light" : "dark"
        updateSettings({ theme: newTheme })
        toast(`Switched to ${newTheme} mode`, {
            icon: newTheme === "dark" ? "🌙" : "☀️",
            duration: 1500,
        })
    }

    return (
        <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleTheme}
            className="relative p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors overflow-hidden"
            aria-label="Toggle theme"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
            <motion.div
                initial={false}
                animate={{
                    rotate: theme === "dark" ? 0 : 180,
                    scale: theme === "dark" ? 1 : 0,
                }}
                transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
                className="absolute inset-0 flex items-center justify-center"
            >
                <Moon className="h-4 w-4 text-blue-400" />
            </motion.div>

            <motion.div
                initial={false}
                animate={{
                    rotate: theme === "light" ? 0 : -180,
                    scale: theme === "light" ? 1 : 0,
                }}
                transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
                className="flex items-center justify-center"
            >
                <Sun className="h-4 w-4 text-yellow-400" />
            </motion.div>
        </motion.button>
    )
}
