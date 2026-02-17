/**
 * @deprecated This file is replaced by src/lib/llm/index.ts
 * Keeping as empty re-export to prevent broken imports during transition.
 * Remove once fully verified.
 */
export { PROVIDER_LABELS as PROVIDER_NAMES } from "./llm/types";

// Legacy compatibility shim — will be removed
import { PROVIDER_LABELS } from "./llm/types";
export const PROVIDER_NAME = PROVIDER_LABELS.ollama;
export const DEFAULT_MODEL = "gemma2:2b";
