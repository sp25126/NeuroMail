"use client";

import { useEffect, useRef } from "react";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("AutoSave");

export function useAutoSave<T>(
    data: T,
    onSave: (data: T) => Promise<void>,
    delay: number = 2000
) {
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const prevDataRef = useRef<string>(JSON.stringify(data));

    useEffect(() => {
        const stringifiedData = JSON.stringify(data);

        // Skip if data unchanged
        if (stringifiedData === prevDataRef.current) {
            return;
        }

        prevDataRef.current = stringifiedData;

        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set new timeout
        timeoutRef.current = setTimeout(async () => {
            try {
                logger.info("Auto-saving draft");
                await onSave(data);
                logger.info("Draft saved successfully");
            } catch (error: any) {
                logger.error("Auto-save failed", { error: error.message });
            }
        }, delay);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [data, onSave, delay]);
}
