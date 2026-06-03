export type FeatureFlag = 
  | 'heavy_render_mode'
  | 'conservative_proxy_mode'
  | 'canvas_capture'
  | 'mobile_performance_mode'
  | 'partial_render_fallback';

export interface FeatureFlagStorage {
  get(flag: FeatureFlag): boolean;
  set(flag: FeatureFlag, value: boolean): void;
  getAll(): Record<FeatureFlag, boolean>;
}

// Default flag configuration
const defaultFlags: Record<FeatureFlag, boolean> = {
  heavy_render_mode: true,
  conservative_proxy_mode: false,
  canvas_capture: true,
  mobile_performance_mode: false,
  partial_render_fallback: true,
};

// Session-aware feature flag implementation
class SessionFeatureFlagStorage implements FeatureFlagStorage {
  private memoryStore: Record<string, boolean> = {};

  constructor() {
    this.initializeFromEnv();
    this.initializeFromSession();
  }

  private initializeFromEnv() {
    if (typeof process !== 'undefined' && process.env) {
      Object.keys(defaultFlags).forEach((flagKey) => {
        const envKey = `NEXT_PUBLIC_FF_${flagKey.toUpperCase()}`;
        if (process.env[envKey] !== undefined) {
          this.memoryStore[flagKey] = process.env[envKey] === 'true';
        }
      });
    }
  }

  private initializeFromSession() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem('pixelmark_flags');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          this.memoryStore = { ...this.memoryStore, ...parsed };
        } catch (e) {
          console.warn('Failed to parse session feature flags', e);
        }
      }
    }
  }

  private persistSession() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('pixelmark_flags', JSON.stringify(this.memoryStore));
    }
  }

  get(flag: FeatureFlag): boolean {
    if (this.memoryStore[flag] !== undefined) {
      return this.memoryStore[flag];
    }
    return defaultFlags[flag];
  }

  set(flag: FeatureFlag, value: boolean): void {
    this.memoryStore[flag] = value;
    this.persistSession();
  }

  getAll(): Record<FeatureFlag, boolean> {
    const allFlags = { ...defaultFlags };
    Object.keys(defaultFlags).forEach((key) => {
      const flag = key as FeatureFlag;
      allFlags[flag] = this.get(flag);
    });
    return allFlags;
  }
}

export const featureFlags = new SessionFeatureFlagStorage();

// Utility for fallback behavior (graceful degradation)
export function withFeatureFlag<T>(
  flag: FeatureFlag,
  onEnabled: () => T,
  onDisabled: () => T
): T {
  if (featureFlags.get(flag)) {
    return onEnabled();
  }
  return onDisabled();
}
