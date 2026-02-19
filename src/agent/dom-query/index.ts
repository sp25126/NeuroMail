import { PageStructure, ElementSummary, LayoutType, ElementMetadata, DOMRectSummary } from './types';

/**
 * DOMQueryEngine: Secure introspection of page structure for AI
 */
export class DOMQueryEngine {
    private static cache: PageStructure | null = null;
    private static cacheTime: number = 0;
    private static CACHE_TTL = 1000; // 1 second

    /**
     * Get a simplified snapshot of the current page structure
     */
    public static getPageStructure(): PageStructure {
        const now = Date.now();
        if (this.cache && (now - this.cacheTime < this.CACHE_TTL)) {
            return this.cache;
        }

        const interactiveElements = this.findInteractiveElements();
        const layout = this.detectLayout();

        const structure: PageStructure = {
            layout,
            sections: this.identifySections(),
            interactiveElements,
            currentView: window.location.pathname,
            timestamp: now
        };

        this.cache = structure;
        this.cacheTime = now;
        return structure;
    }

    /**
     * God Mode: Get a token-efficient DOM snapshot for the AI
     * - Filters invisible elements
     * - Generates temp IDs for targeting
     * - Truncates text
     */
    public static getDomSnapshot(): string {
        // 1. Select relevant interactive elements
        // We filter out hidden elements to save tokens
        const elements = document.querySelectorAll(
            'button, a, input, textarea, [role="button"], .interactive, [onclick]'
        );

        const snapshot = Array.from(elements)
            .filter(el => (el as HTMLElement).offsetParent !== null) // Only visible elements
            .map(el => {
                const element = el as HTMLElement;
                // Generate a temp ID if none exists so the AI can target it
                if (!element.id) element.id = "gen_" + Math.random().toString(36).substr(2, 5);

                return {
                    tag: element.tagName.toLowerCase(),
                    id: element.id,
                    text: (element.innerText || (element as HTMLInputElement).value || "").slice(0, 30).replace(/\n/g, ' '), // Truncate & clean
                    placeholder: element.getAttribute('placeholder') || "",
                    type: element.getAttribute('type') || "",
                    role: element.getAttribute('role') || ""
                };
            });

        return JSON.stringify(snapshot);
    }

    /**
     * Find specific elements by CSS selector and return metadata
     */
    public static findElements(selector: string): ElementMetadata[] {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map(el => this.getElementMetadata(el as HTMLElement));
    }

    /**
     * Search for elements by text content
     */
    public static searchByText(text: string): ElementSummary[] {
        const lowerText = text.toLowerCase();
        const elements = document.querySelectorAll('button, a, span, label, p, h1, h2, h3');

        return Array.from(elements)
            .filter(el => el.textContent?.toLowerCase().includes(lowerText))
            .map(el => this.summarizeElement(el as HTMLElement));
    }

    /**
     * Summarize an element for AI consumption
     */
    private static summarizeElement(el: HTMLElement): ElementSummary {
        const rect = el.getBoundingClientRect();
        const capabilities: string[] = [];

        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick || el.getAttribute('role') === 'button') {
            capabilities.push('click');
        }
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
            capabilities.push('type');
        }

        return {
            id: el.id || `el_${Math.random().toString(36).substr(2, 9)}`,
            type: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            text: this.sanitizeText(el.textContent || ''),
            visible: this.isElementVisible(el),
            rect: this.summarizeRect(rect),
            capabilities
        };
    }

    /**
     * Get full metadata for a specific element
     */
    private static getElementMetadata(el: HTMLElement): ElementMetadata {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        return {
            id: el.id,
            tagName: el.tagName.toLowerCase(),
            classes: Array.from(el.classList),
            attributes: this.getPublicAttributes(el),
            rect: this.summarizeRect(rect),
            computedStyles: {
                color: computed.color,
                backgroundColor: computed.backgroundColor,
                fontSize: computed.fontSize,
                visibility: computed.visibility,
                display: computed.display
            }
        };
    }

    private static findInteractiveElements(): ElementSummary[] {
        const selectors = 'button, a, input, select, textarea, [role="button"], [contenteditable="true"]';
        const elements = document.querySelectorAll(selectors);
        return Array.from(elements).map(el => this.summarizeElement(el as HTMLElement)).filter(e => e.visible);
    }

    private static identifySections(): any[] {
        const tags = ['nav', 'main', 'aside', 'header', 'footer', '.sidebar', '.thread-list', '.thread-detail'];
        const sections: any[] = [];

        tags.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                sections.push({
                    id: el.id || selector,
                    role: el.getAttribute('role') || el.tagName.toLowerCase(),
                    visible: this.isElementVisible(el as HTMLElement),
                    rect: this.summarizeRect(el.getBoundingClientRect())
                });
            }
        });

        return sections;
    }

    private static detectLayout(): LayoutType {
        const sidebar = document.querySelector('nav, .sidebar');
        const main = document.querySelector('main');
        const detail = document.querySelector('.thread-detail');

        if (sidebar && main && detail) return 'three-column';
        if (sidebar && main) return 'two-column';
        return 'single';
    }

    private static isElementVisible(el: HTMLElement): boolean {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            el.offsetWidth > 0 &&
            el.offsetHeight > 0;
    }

    private static summarizeRect(rect: DOMRect): DOMRectSummary {
        return {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    }

    private static sanitizeText(text: string): string {
        // Limit text length and remove sensitive-looking patterns
        let clean = text.trim();
        if (clean.length > 100) clean = clean.substring(0, 97) + '...';
        return clean;
    }

    private static getPublicAttributes(el: HTMLElement): Record<string, string> {
        const attrs: Record<string, string> = {};
        const publicAttrs = ['id', 'name', 'type', 'placeholder', 'role', 'aria-label', 'href', 'value'];
        publicAttrs.forEach(attr => {
            const val = el.getAttribute(attr);
            if (val) attrs[attr] = val;
        });
        return attrs;
    }
}
