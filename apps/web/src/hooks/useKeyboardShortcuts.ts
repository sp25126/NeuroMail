"use client";

import { useEffect, useState, useCallback } from "react";
import { useMailStore } from "@/store/useMailStore";
import { createLogger } from "@/agent/observability/logger";
import { toast } from "sonner";

const logger = createLogger("KeyboardShortcuts");

const folderMap: Record<string, string> = {
    "1": "inbox",
    "2": "sent",
    "3": "starred",
    "4": "drafts",
    "5": "trash",
};

export function useKeyboardShortcuts() {
    const store = useMailStore();
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);

    const toggleShortcutsModal = useCallback(() => {
        setShowShortcutsModal((prev) => !prev);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input
            const activeElement = document.activeElement;
            if (
                activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement?.hasAttribute("contenteditable")
            ) {
                return;
            }

            const { key, ctrlKey, metaKey } = e;
            const cmdOrCtrl = ctrlKey || metaKey;

            // ? - Toggle keyboard shortcuts modal
            if (key === "?") {
                e.preventDefault();
                logger.info("Keyboard shortcut: Toggle shortcuts modal");
                toggleShortcutsModal();
                return;
            }

            // C - Compose
            if (key.toLowerCase() === "c" && !cmdOrCtrl) {
                e.preventDefault();
                logger.info("Keyboard shortcut: Compose");
                store.setComposeOpen(true);
                toast("✏️ Compose", { duration: 1200 });
            }

            // R - Reply
            if (key.toLowerCase() === "r" && !cmdOrCtrl && store.currentThread) {
                e.preventDefault();
                logger.info("Keyboard shortcut: Reply");
                store.setComposeDraft({
                    to: store.currentThread.from,
                    subject: `Re: ${store.currentThread.subject}`,
                    body: "",
                });
                store.setComposeOpen(true);
                toast("↩️ Reply", { duration: 1200 });
            }

            // S - Star current thread
            if (key.toLowerCase() === "s" && !cmdOrCtrl && store.currentThread) {
                e.preventDefault();
                logger.info("Keyboard shortcut: Star");
                toast("⭐ Starred", { duration: 1200 });
            }

            // 1-5 - Quick folder navigation
            if (folderMap[key] && !cmdOrCtrl) {
                e.preventDefault();
                const folder = folderMap[key];
                logger.info(`Keyboard shortcut: folder ${folder}`);
                store.setFolder(folder);
                toast(`📁 ${folder.charAt(0).toUpperCase() + folder.slice(1)}`, { duration: 1200 });
            }

            // / - Focus search
            if (key === "/") {
                e.preventDefault();
                logger.info("Keyboard shortcut: Focus search");
                document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
            }

            // Escape - Close modals / go back
            if (key === "Escape") {
                logger.info("Keyboard shortcut: Escape");
                if (showShortcutsModal) {
                    setShowShortcutsModal(false);
                    return;
                }
                if (store.isComposeOpen) {
                    store.setComposeOpen(false);
                }
                if (store.view === "thread") {
                    store.setView("inbox");
                }
                if (store.view === "settings") {
                    store.setView("inbox");
                }
            }

            // Cmd/Ctrl + K - Open assistant
            if (key.toLowerCase() === "k" && cmdOrCtrl) {
                e.preventDefault();
                logger.info("Keyboard shortcut: Open assistant");
                document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Ask Copilot"]')?.focus();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [store, showShortcutsModal, toggleShortcutsModal]);

    return { showShortcutsModal, setShowShortcutsModal };
}
