import { z } from "zod";

export const UIOperationSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.enum(["navigation", "filter", "compose", "view", "selection"]),
    endpoint: z.string(),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]),
    parameters: z.array(
        z.object({
            name: z.string(),
            type: z.enum(["string", "number", "boolean", "array", "object"]),
            description: z.string(),
            required: z.boolean(),
            enum: z.array(z.string()).optional(),
            validation: z.object({
                min: z.number().optional(),
                max: z.number().optional(),
                pattern: z.string().optional(),
            }).optional(),
        })
    ),
    returns: z.object({
        type: z.string(),
        description: z.string(),
    }),
    permissions: z.array(z.string()),
    rateLimit: z.object({
        maxCalls: z.number(),
        windowMs: z.number(),
    }),
    examples: z.array(
        z.object({
            input: z.record(z.string(), z.any()),
            output: z.any(),
            description: z.string(),
        })
    ),
});

export type UIOperation = z.infer<typeof UIOperationSchema>;

export const ComposedFunctionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    steps: z.array(
        z.object({
            operationId: z.string(),
            arguments: z.record(z.string(), z.any()),
            outputMapping: z.record(z.string(), z.string()).optional(), // Map output to next step
            condition: z.object({
                type: z.enum(["always", "if_success", "if_failure", "if_match"]),
                value: z.any().optional(),
            }).optional(),
        })
    ),
    parameters: z.array(
        z.object({
            name: z.string(),
            type: z.string(),
            description: z.string(),
            required: z.boolean(),
        })
    ),
    createdBy: z.enum(["ai", "user", "system"]),
    createdAt: z.string(),
    version: z.number(),
    metadata: z.object({
        usageCount: z.number(),
        successRate: z.number(),
        avgExecutionTimeMs: z.number(),
    }),
});

export type ComposedFunction = z.infer<typeof ComposedFunctionSchema>;
