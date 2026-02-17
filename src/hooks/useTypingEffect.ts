import { useState, useEffect, useRef } from 'react';

export function useTypingEffect(targetText: string, speed: number = 30, enabled: boolean = true) {
    const [displayedText, setDisplayedText] = useState("");
    const index = useRef(0);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        setDisplayedText("");
        index.current = 0;

        const interval = setInterval(() => {
            if (index.current < targetText.length) {
                setDisplayedText((prev) => prev + targetText.charAt(index.current));
                index.current++;
            } else {
                clearInterval(interval);
            }
        }, speed);

        return () => clearInterval(interval);
    }, [targetText, speed, enabled]);

    return displayedText;
}
