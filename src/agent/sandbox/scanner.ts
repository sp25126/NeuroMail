
/**
 * DOMScanner — scans and catalogs interactive UI elements
 * for the AI to reference when building execution plans.
 * Client-side only.
 */
export interface ScannedElement {
    testId: string;
    tag: string;
    role?: string;
    label?: string;
    visible: boolean;
}

export class DOMScanner {
    /**
     * Scan the current page for all elements with data-testid attributes.
     * Returns a map of testId → element metadata.
     */
    scan(): ScannedElement[] {
        if (typeof document === "undefined") return [];

        const elements = Array.from(
            document.querySelectorAll("[data-testid]")
        );

        return elements.map((el) => ({
            testId: el.getAttribute("data-testid") || "",
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || undefined,
            label:
                el.getAttribute("aria-label") ||
                (el as HTMLElement).innerText?.slice(0, 50) ||
                undefined,
            visible: (el as HTMLElement).offsetParent !== null,
        }));
    }

    /**
     * Find a specific element by testId.
     */
    findByTestId(testId: string): ScannedElement | undefined {
        return this.scan().find((el) => el.testId === testId);
    }

    /**
     * Get a summary string for injection into AI context.
     */
    getSummary(): string {
        const elements = this.scan().filter((el) => el.visible);
        if (elements.length === 0) return "No interactive elements found.";
        return elements
            .map((el) => `[${el.testId}] <${el.tag}> ${el.label || ""}`)
            .join("\n");
    }
}

export const domScanner = new DOMScanner();
