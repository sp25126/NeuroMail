import { z } from "zod";
import { validateContainerNumber } from "../services/discovery";

/**
 * Validates that an object's tenantId matches the required tenant scope.
 */
export function validateTenantScope(object: { tenantId: string }, expectedTenantId: string): boolean {
  return object.tenantId === expectedTenantId;
}

/**
 * Validates a container identifier type. If the type is CONTAINER_NUMBER,
 * checks that it is a valid ISO 6346 code.
 */
export function validateShipmentIdentifier(type: string, value: string): { valid: boolean; normalized: string } {
  const normalized = value.trim().toUpperCase();

  if (type === "CONTAINER_NUMBER") {
    const valid = validateContainerNumber(normalized);
    return { valid, normalized };
  }

  // Non-container types must be non-empty strings of length 4 to 30
  const valid = normalized.length >= 4 && normalized.length <= 30;
  return { valid, normalized };
}

/**
 * Zod helper to safely parse JSON strings and ensure they match a schema.
 */
export function safeJsonParse<T>(jsonString: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!jsonString) return null;
  try {
    const obj = JSON.parse(jsonString);
    const parsed = schema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
