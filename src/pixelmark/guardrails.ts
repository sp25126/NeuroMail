// Guardrail Helpers for Stability

// 1. Rate-limit repeated render retries & failure backoff
export class RetryThrottler {
  private attempts: Map<string, { count: number, lastAttempt: number }> = new Map();
  private maxAttempts: number;
  private backoffMs: number;

  constructor(maxAttempts: number = 3, backoffMs: number = 1000) {
    this.maxAttempts = maxAttempts;
    this.backoffMs = backoffMs;
  }

  canAttempt(key: string): boolean {
    const record = this.attempts.get(key);
    const now = Date.now();

    if (!record) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    if (now - record.lastAttempt > this.backoffMs * Math.pow(2, record.count)) {
      // Exponential backoff passed
      record.count += 1;
      record.lastAttempt = now;
      this.attempts.set(key, record);
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false; // Circuit open
    }

    record.count += 1;
    record.lastAttempt = now;
    return true;
  }
  
  reset(key: string) {
    this.attempts.delete(key);
  }
}

// 2. Protect against duplicate marker spam
export class DuplicateDetector {
  private recentHashes: Set<string> = new Set();
  private cleanupIntervalMs: number;

  constructor(cleanupIntervalMs: number = 5000) {
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  isDuplicate(hash: string): boolean {
    if (this.recentHashes.has(hash)) {
      return true;
    }
    this.recentHashes.add(hash);
    setTimeout(() => {
      this.recentHashes.delete(hash);
    }, this.cleanupIntervalMs);
    return false;
  }
}

// 3. Guard against infinite re-navigation loops
export class NavigationGuard {
  private history: string[] = [];
  
  recordNavigation(url: string) {
    this.history.push(url);
    if (this.history.length > 10) {
      this.history.shift();
    }
  }

  isLooping(): boolean {
    if (this.history.length < 4) return false;
    const last = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 3];
    return last === prev; // simple ABAB detection
  }
}

// 4. Safe Payload parsing
export function safeParsePayload<T>(payload: string, fallback: T): T {
  try {
    return JSON.parse(payload) as T;
  } catch (e) {
    console.warn('Malformed payload received, using fallback', e);
    return fallback;
  }
}

// 5. Asset route circuit breaker
export class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private threshold: number;

  constructor(threshold: number = 5) {
    this.threshold = threshold;
  }

  recordFailure(route: string) {
    const count = this.failures.get(route) || 0;
    this.failures.set(route, count + 1);
  }

  isOpen(route: string): boolean {
    return (this.failures.get(route) || 0) >= this.threshold;
  }
}

export const renderThrottler = new RetryThrottler(3, 2000);
export const markerSpamDetector = new DuplicateDetector(10000);
export const navGuard = new NavigationGuard();
export const assetCircuitBreaker = new CircuitBreaker(5);
