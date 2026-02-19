/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { changeManager, DOMChange } from '@/agent/execution-sandbox/change-manager';

describe('ChangeManager', () => {
    beforeEach(() => {
        changeManager.clear();
    });

    it('should track changes', () => {
        const div = document.createElement('div');
        div.id = 'test';

        changeManager.track({
            type: 'property',
            target: '#test',
            property: 'id',
            oldValue: '',
            newValue: 'test',
            element: div
        });

        expect(changeManager.getHistory().length).toBe(1);
        expect(changeManager.getHistory()[0].target).toBe('#test');
    });

    it('should rollback property changes', () => {
        const div = document.createElement('div');
        div.id = 'initial';

        // Simulate change
        const oldId = div.id;
        div.id = 'changed';

        changeManager.track({
            type: 'property',
            target: 'div',
            property: 'id',
            oldValue: oldId,
            newValue: 'changed',
            element: div
        });

        // Verify change happened
        expect(div.id).toBe('changed');

        // Rollback
        changeManager.rollback();

        // Verify rollback
        expect(div.id).toBe('initial');
    });

    it('should rollback style changes', () => {
        const div = document.createElement('div');
        div.style.color = 'red';

        changeManager.track({
            type: 'property',
            target: 'div',
            property: 'style.color',
            oldValue: 'red',
            newValue: 'blue',
            element: div
        });

        // Manual apply of new val (simulation)
        div.style.color = 'blue';
        expect(div.style.color).toBe('blue');

        changeManager.rollback();
        expect(div.style.color).toBe('red');
    });

    it('should respect history limit', () => {
        // changeManager has limit of 100
        for (let i = 0; i < 110; i++) {
            changeManager.track({
                type: 'property',
                target: `item-${i}`,
                element: document.createElement('div')
            });
        }

        expect(changeManager.getHistory().length).toBe(100);
        expect(changeManager.getHistory()[99].target).toBe('item-109');
        expect(changeManager.getHistory()[0].target).toBe('item-10'); // 0-9 dropped
    });
});
