/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionSandbox } from '@/agent/execution-sandbox/sandbox';

describe('ExecutionSandbox', () => {
    it('should execute safe code correctly', async () => {
        const code = 'return 1 + 1;';
        const result = await ExecutionSandbox.execute(code);

        expect(result.success).toBe(true);
        expect(result.output).toBe(2);
        expect(result.violations.length).toBe(0);
    });

    it('should block unauthorized globals statically', async () => {
        const code = 'window.location.href = "http://malicious.com";';
        const result = await ExecutionSandbox.execute(code);

        expect(result.success).toBe(false);
        expect(result.violations[0].type).toBe('unauthorized_access');
        // AST validator message
        expect(result.violations[0].message).toContain('Forbidden property access');
    });

    it('should block access to document.cookie statically', async () => {
        const code = 'const c = document.cookie; return c;';
        const result = await ExecutionSandbox.execute(code);

        expect(result.success).toBe(false);
        expect(result.violations[0].type).toBe('unauthorized_access');
        // AST validator message
        expect(result.violations[0].message).toContain('Forbidden property access');
    });

    it('should block restricted properties at runtime', async () => {
        // innerHTML is not in static validation blacklist (it is a property), but caught by proxy or AST property check
        const code = 'const div = document.createElement("div"); div.innerHTML = "hacked";';
        const result = await ExecutionSandbox.execute(code);

        expect(result.success).toBe(false);
        // It's either runtime error from proxy or unauthorized access from AST
        const violation = result.violations[0];
        const isRuntime = violation.type === 'runtime_error' || violation.type === 'unauthorized_access';
        expect(isRuntime).toBe(true);
    });

    it('should trace DOM operations', async () => {
        const code = `
            const el = document.createElement('div');
            el.id = 'test-div';
            document.body.appendChild(el);
            return el.id;
        `;
        const result = await ExecutionSandbox.execute(code);

        expect(result.success).toBe(true);
        expect(result.output).toBe('test-div');
        expect(result.trace.length).toBeGreaterThan(0);

        const operations = result.trace.map(t => t.operation);
        expect(operations).toContain('write');
        expect(result.trace.find(t => t.target === 'document.body.appendChild')).toBeDefined();
    });

    it('should respect execution timeouts', async () => {
        const code = 'await new Promise(r => setTimeout(r, 2000));';
        const result = await ExecutionSandbox.execute(code, {}, {
            allowDOM: true,
            allowFetch: false,
            allowStorage: false,
            allowedGlobals: ['setTimeout'],
            maxExecutionTimeMs: 100 // Short timeout
        });

        expect(result.success).toBe(false);
        expect(result.violations[0].type).toBe('timeout');
    });

    it('should track changes via ChangeManager', async () => {
        // Import changeManager to verify state
        const { changeManager } = await import('@/agent/execution-sandbox/change-manager');
        changeManager.clear();

        const code = `
            const el = document.createElement('div');
            el.id = 'tracked-div';
            el.style.color = 'blue';
        `;

        await ExecutionSandbox.execute(code, {}, {
            allowDOM: true,
            allowFetch: false,
            allowStorage: false,
            allowedGlobals: [],
            maxExecutionTimeMs: 1000
        });

        const history = changeManager.getHistory();
        expect(history.length).toBeGreaterThan(0);

        // Find the id change
        // Note: target in sandbox proxy is full path e.g. "document.createElement().id" or similar
        // We need to inspect what the target actually is in the test environment
        const idChange = history.find(h => h.property === 'id' && h.newValue === 'tracked-div');
        expect(idChange).toBeDefined();

        // Find style change
        const styleChange = history.find(h => h.property === 'style.color' && h.newValue === 'blue');
        expect(styleChange).toBeDefined();
    });
});
