"use client";

import { useState, useEffect } from "react";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("TypingAnimation");

export function useTypingAnimation(
    text: string,
    speed: number = 30,
    enabled: boolean = true
) {
    const [displayedText, setDisplayedText] = useState("");
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setDisplayedText(text);
            setIsComplete(true);
            return;
        }

        logger.info("Starting typing animation", {
            textLength: text.length,
            speed,
        });

        let currentIndex = 0;
        setDisplayedText("");
        setIsComplete(false);

        const interval = setInterval(() => {
            if (currentIndex <= text.length) {
                setDisplayedText(text.slice(0, currentIndex));
                currentIndex++;
            } else {
                clearInterval(interval);
                setIsComplete(true);
                logger.info("Typing animation complete");
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, enabled]);

    return { displayedText, isComplete };
}
