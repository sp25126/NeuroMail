import { uiRegistry } from "../ui-registry/registry";
import { ComposedFunction, UIOperation } from "../ui-registry/types";
import { createLogger } from "../observability/logger";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger("FunctionComposer");

export class FunctionComposer {
    /**
     * AI asks: "What can I do with the UI?"
     * Returns: List of all discoverable operations
     */
    async discoverCapabilities(): Promise<{
        operations: UIOperation[];
        composedFunctions: ComposedFunction[];
    }> {
        const span = logger.startSpan("discoverCapabilities");

        const operations = uiRegistry.getAllOperations();
        const composedFunctions = uiRegistry.getAllComposedFunctions();

        logger.info("Capabilities discovered", {
            operationsCount: operations.length,
            composedFunctionsCount: composedFunctions.length,
        });

        span.end({ success: true });

        return { operations, composedFunctions };
    }

    /**
     * AI creates a new function by composing operations
     */
    async composeFunction(request: {
        name: string;
        description: string;
        steps: Array<{
            operationId: string;
            arguments: Record<string, any>;
            outputMapping?: Record<string, string>;
            condition?: {
                type: "always" | "if_success" | "if_failure" | "if_match";
                value?: any;
            };
        }>;
        parameters: Array<{
            name: string;
            type: string;
            description: string;
            required: boolean;
        }>;
    }): Promise<ComposedFunction> {
        // userId should be part of the request context or parameters
        const userId = (request as any).userId;
        const span = logger.startSpan("composeFunction", {
            name: request.name,
        });

        try {
            // Validate composition
            await this.validateComposition(request);

            const composedFunction: ComposedFunction = {
                id: `composed.${request.name.toLowerCase().replace(/\s+/g, "_")}`,
                name: request.name,
                description: request.description,
                steps: request.steps,
                parameters: request.parameters,
                createdBy: "ai",
                createdAt: new Date().toISOString(),
                version: 1,
                metadata: {
                    usageCount: 0,
                    successRate: 1.0,
                    avgExecutionTimeMs: 0,
                },
            };

            // Register the new function
            await uiRegistry.registerComposedFunction(composedFunction, userId);

            logger.info("Function composed successfully", {
                id: composedFunction.id,
                stepsCount: composedFunction.steps.length,
            });

            span.end({ success: true });

            return composedFunction;
        } catch (error: any) {
            logger.error("Function composition failed", {
                error: error.message,
            });

            span.end({ success: false, error: error.message });

            throw error;
        }
    }

    /**
     * Validate that the composition is safe and valid
     */
    private async validateComposition(request: any): Promise<void> {
        // 1. Check max steps (prevent infinite loops)
        if (request.steps.length > 20) {
            throw new Error("Composed function cannot have more than 20 steps");
        }

        // 2. Validate all operations exist
        for (const step of request.steps) {
            const operation = uiRegistry.getOperation(step.operationId);
            if (!operation) {
                throw new Error(`Unknown operation: ${step.operationId}`);
            }

            // 3. Validate required parameters
            for (const param of operation.parameters) {
                if (param.required && !step.arguments[param.name]) {
                    // Check if it's mapped from previous step
                    const hasMappedValue = Object.values(step.outputMapping || {}).includes(
                        param.name
                    );
                    if (!hasMappedValue) {
                        throw new Error(
                            `Missing required parameter: ${param.name} in operation ${operation.id}`
                        );
                    }
                }
            }
        }

        // 4. Check for circular dependencies
        const operationIds = request.steps.map((s: any) => s.operationId);
        if (new Set(operationIds).size !== operationIds.length) {
            logger.warn("Duplicate operations detected in composition", {
                operations: operationIds,
            });
        }

        // 5. Validate no user data access attempts
        for (const step of request.steps) {
            const operation = uiRegistry.getOperation(step.operationId);
            if (operation?.permissions.includes("user.data.read")) {
                throw new Error(
                    `Security violation: Operation ${operation.id} attempts to access user data`
                );
            }
        }
    }

    /**
     * Generate function signature from AI's intent
     */
    async generateFunctionFromIntent(intent: string): Promise<ComposedFunction> {
        logger.info("Generating function from intent", { intent });

        // This would call an LLM to convert natural language to composition
        // For now, return a template
        throw new Error("Not implemented: Use LLM to generate composition");
    }
}

export const functionComposer = new FunctionComposer();
