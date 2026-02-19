/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DOMQueryEngine } from '@/agent/dom-query';

describe('DOMQueryEngine', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="root">
                <nav id="sidebar" style="display: block;">
                    <button id="inbox-btn">Inbox</button>
                    <button id="sent-btn" disabled>Sent</button>
                    <a href="/settings" id="settings-link">Settings</a>
                </nav>
                <main id="main-content">
                    <h1 id="title">NeuroMail</h1>
                    <button id="compose-button">Compose</button>
                    <div id="hidden-div" style="display: none;">Invisible</div>
                </main>
            </div>
        `;

        // Mock getBoundingClientRect
        const mockRect = {
            top: 10, left: 10, width: 100, height: 50,
            bottom: 60, right: 110, x: 10, y: 10,
            toJSON: () => { }
        };
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(mockRect as any);

        // Mock offsetWidth/Height
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 100 });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 50 });

        // Mock getComputedStyle
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: any) => {
            return {
                display: el.style.display || 'block',
                visibility: 'visible',
                opacity: '1',
                color: 'rgb(0, 0, 0)',
                backgroundColor: 'transparent',
                fontSize: '16px'
            } as any;
        });
    });

    it('should extract page structure correctly', () => {
        const structure = DOMQueryEngine.getPageStructure();
        expect(structure.layout).toBe('two-column'); // sidebar + main
        expect(structure.interactiveElements.length).toBeGreaterThan(0);

        const ids = structure.interactiveElements.map(e => e.id);
        expect(ids).toContain('inbox-btn');
        expect(ids).toContain('compose-button');
        expect(ids).not.toContain('hidden-div');
    });

    it('should find specific elements by selector', () => {
        const elements = DOMQueryEngine.findElements('#compose-button');
        expect(elements.length).toBe(1);
        expect(elements[0].tagName).toBe('button');
        expect(elements[0].id).toBe('compose-button');
    });

    it('should search for elements by text', () => {
        const results = DOMQueryEngine.searchByText('Inbox');
        expect(results.length).toBe(1);
        expect(results[0].text).toBe('Inbox');
    });

    it('should identify sections based on tags', () => {
        const structure = DOMQueryEngine.getPageStructure();
        const sectionRoles = structure.sections.map(s => s.role);
        expect(sectionRoles).toContain('nav');
        expect(sectionRoles).toContain('main');
    });
});
