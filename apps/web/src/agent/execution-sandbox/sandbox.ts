import { uiRegistry } from "../ui-registry/registry";
import { createLogger } from "../observability/logger";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger("ExecutionSandbox");

export class ExecutionSandbox {
    private rateLimitCache: Map<string, number[]> = new Map();

    /**
     * Execute a UI operation with security checks
     */
    async executeOperation(request: {
        operationId: string;
        arguments: Record<string, any>;
        sessionId: string;
        userId: string;
    }): Promise<any> {
        const span = logger.startSpan("executeOperation", {
            operationId: request.operationId,
            sessionId: request.sessionId,
        });

        try {
            // 1. Get operation definition
            const operation = uiRegistry.getOperation(request.operationId);
            if (!operation) {
                throw new Error(`Unknown operation: ${request.operationId}`);
            }

            // 2. Check permissions
            await this.checkPermissions(request.userId, operation.permissions);

            // 3. Check rate limits
            await this.checkRateLimit(
                request.userId,
                request.operationId,
                operation.rateLimit
            );

            // 4. Validate arguments
            this.validateArguments(request.arguments, operation.parameters);

            // 5. Block user data access
            this.enforceUserDataFirewall(operation);

            // 6. Execute the operation via API
            const result = await this.callUIEndpoint(
                operation.endpoint,
                operation.method,
                request.arguments,
                request.sessionId
            );

            // 7. Sanitize response (remove any leaked user data)
            const sanitized = this.sanitizeResponse(result);

            // 8. Log execution
            await this.logExecution({
                operationId: request.operationId,
                userId: request.userId,
                sessionId: request.sessionId,
                arguments: request.arguments,
                result: sanitized,
                success: true,
                executionTimeMs: Date.now() - span.startTime,
            });

            span.end({ success: true });

            return sanitized;
        } catch (error: any) {
            logger.error("Operation execution failed", {
                operationId: request.operationId,
                error: error.message,
            });

            await this.logExecution({
                operationId: request.operationId,
                userId: request.userId,
                sessionId: request.sessionId,
                arguments: request.arguments,
                result: null,
                success: false,
                error: error.message,
            });

            span.end({ success: false, error: error.message });

            throw error;
        }
    }

    /**
     * Execute a composed function (sequence of operations)
     */
    async executeComposedFunction(request: {
        functionId: string;
        arguments: Record<string, any>;
        sessionId: string;
        userId: string;
    }): Promise<any> {
        const span = logger.startSpan("executeComposedFunction", {
            functionId: request.functionId,
        });

        try {
            const fn = uiRegistry.getComposedFunction(request.functionId);
            if (!fn) {
                throw new Error(`Unknown function: ${request.functionId}`);
            }

            logger.info("Executing composed function", {
                functionId: fn.id,
                stepsCount: fn.steps.length,
            });

            const results: any[] = [];
            let previousOutput: any = null;

            for (let i = 0; i < fn.steps.length; i++) {
                const step = fn.steps[i];

                // Check condition
                if (step.condition) {
                    const shouldExecute = this.evaluateCondition(
                        step.condition,
                        previousOutput
                    );
                    if (!shouldExecute) {
                        logger.info("Skipping step due to condition", {
                            step: i,
                            condition: step.condition.type,
                        });
                        continue;
                    }
                }

                // Map output from previous step to current arguments
                const stepArgs = { ...step.arguments };
                if (step.outputMapping && previousOutput) {
                    for (const [outputKey, argKey] of Object.entries(step.outputMapping)) {
                        (stepArgs as any)[argKey as string] = (previousOutput as any)[outputKey as string];
                    }
                }

                // Merge function parameters
                for (const param of fn.parameters) {
                    if (request.arguments[param.name] !== undefined) {
                        stepArgs[param.name] = request.arguments[param.name];
                    }
                }

                // Execute step
                const result = await this.executeOperation({
                    operationId: step.operationId,
                    arguments: stepArgs,
                    sessionId: request.sessionId,
                    userId: request.userId,
                });

                results.push(result);
                previousOutput = result;

                // Stop on failure
                if (!result.success && step.condition?.type !== "if_failure") {
                    logger.warn("Stopping execution due to step failure", { step: i });
                    break;
                }
            }

            // Update function metrics
            const duration = Date.now() - span.startTime;
            await this.updateFunctionMetrics(fn.id, true, duration);

            span.end({ success: true });

            return {
                functionId: fn.id,
                results,
                success: true,
            };
        } catch (error: any) {
            logger.error("Composed function execution failed", {
                error: error.message,
            });

            const duration = Date.now() - span.startTime;
            await this.updateFunctionMetrics(request.functionId, false, duration);

            span.end({ success: false, error: error.message });

            throw error;
        }
    }

    /**
     * SECURITY: Block all user data access
     */
    private enforceUserDataFirewall(operation: any) {
        const forbiddenPermissions = [
            "user.data.read",
            "user.email.read",
            "user.profile.read",
            "mail.content.read", // Can't read actual email content
        ];

        for (const forbidden of forbiddenPermissions) {
            if (operation.permissions.includes(forbidden)) {
                logger.error("USER DATA ACCESS BLOCKED", {
                    operation: operation.id,
                    permission: forbidden,
                });

                throw new Error(
                    `Security violation: Operation attempts to access user data (${forbidden})`
                );
            }
        }
    }

    /**
     * Check user permissions
     */
    private async checkPermissions(userId: string, required: string[]) {
        // In production, check against user's permission set in database
        // For now, all authenticated users have UI permissions

        const userPermissions = [
            "ui.navigate",
            "ui.filter",
            "ui.compose",
            "ui.search",
            "ui.select",
            "ui.read",
            "mail.read", // Can read metadata, not content
        ];

        for (const perm of required) {
            if (!userPermissions.includes(perm)) {
                throw new Error(`Permission denied: ${perm}`);
            }
        }
    }

    /**
     * Rate limiting
     */
    private async checkRateLimit(
        userId: string,
        operationId: string,
        limit: { maxCalls: number; windowMs: number }
    ) {
        const key = `${userId}:${operationId}`;
        const now = Date.now();

        const calls = this.rateLimitCache.get(key) || [];
        const recentCalls = calls.filter((t) => now - t < limit.windowMs);

        if (recentCalls.length >= limit.maxCalls) {
            throw new Error(
                `Rate limit exceeded: ${limit.maxCalls} calls per ${limit.windowMs}ms`
            );
        }

        recentCalls.push(now);
        this.rateLimitCache.set(key, recentCalls);
    }

    /**
     * Validate operation arguments
     */
    private validateArguments(args: Record<string, any>, parameters: any[]) {
        for (const param of parameters) {
            if (param.required && args[param.name] === undefined) {
                throw new Error(`Missing required parameter: ${param.name}`);
            }

            if (args[param.name] !== undefined) {
                // Type validation
                const value = args[param.name];
                const actualType = Array.isArray(value)
                    ? "array"
                    : typeof value;

                if (actualType !== param.type && param.type !== "object") {
                    throw new Error(
                        `Parameter ${param.name} must be of type ${param.type}, got ${actualType}`
                    );
                }

                // Enum validation
                if (param.enum && !param.enum.includes(value)) {
                    throw new Error(
                        `Parameter ${param.name} must be one of: ${param.enum.join(", ")}`
                    );
                }

                // String validation
                if (param.validation) {
                    if (param.validation.pattern) {
                        const regex = new RegExp(param.validation.pattern);
                        if (!regex.test(value)) {
                            throw new Error(
                                `Parameter ${param.name} does not match pattern ${param.validation.pattern}`
                            );
                        }
                    }

                    if (param.validation.min !== undefined && value.length < param.validation.min) {
                        throw new Error(
                            `Parameter ${param.name} must be at least ${param.validation.min} characters`
                        );
                    }

                    if (param.validation.max !== undefined && value.length > param.validation.max) {
                        throw new Error(
                            `Parameter ${param.name} must be at most ${param.validation.max} characters`
                        );
                    }
                }
            }
        }
    }

    /**
     * Call the actual UI endpoint
     */
    private async callUIEndpoint(
        endpoint: string,
        method: string,
        args: Record<string, any>,
        sessionId: string
    ): Promise<any> {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const url = `${baseUrl}${endpoint}`;

        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": sessionId,
            },
            body: method !== "GET" ? JSON.stringify(args) : undefined,
        });

        if (!response.ok) {
            throw new Error(`UI endpoint error: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Sanitize response to remove any user data
     */
    private sanitizedFieldCount = 0;
    private sanitizeResponse(response: any): any {
        // Remove sensitive fields
        const sanitized = { ...response };

        const forbiddenFields = [
            "email",
            "emailBody",
            "emailContent",
            "personalData",
            "userEmail",
            "phoneNumber",
            "address",
        ];

        for (const field of forbiddenFields) {
            if (field in sanitized) {
                delete sanitized[field];
                logger.warn("Removed forbidden field from response", { field });
            }
        }

        return sanitized;
    }

    /**
     * Evaluate condition
     */
    private evaluateCondition(condition: any, previousOutput: any): boolean {
        switch (condition.type) {
            case "always":
                return true;
            case "if_success":
                return previousOutput?.success === true;
            case "if_failure":
                return previousOutput?.success === false;
            case "if_match":
                return JSON.stringify(previousOutput).includes(condition.value);
            default:
                return true;
        }
    }

    /**
     * Log execution to database
     */
    private async logExecution(log: any) {
        try {
            await db.execute(
                `INSERT INTO ai_operation_logs (id, operation_id, user_id, session_id, arguments, result, success, error, execution_time_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    uuidv4(),
                    log.operationId,
                    log.userId,
                    log.sessionId,
                    JSON.stringify(log.arguments),
                    JSON.stringify(log.result),
                    log.success ? 1 : 0,
                    log.error || null,
                    log.executionTimeMs || 0,
                    new Date().toISOString(),
                ]
            );
        } catch (error: any) {
            logger.error("Failed to log execution", { error: error.message });
        }
    }

    /**
     * Update composed function metrics
     */
    private async updateFunctionMetrics(
        functionId: string,
        success: boolean,
        duration: number
    ) {
        const fn = uiRegistry.getComposedFunction(functionId);
        if (!fn) return;

        const newUsageCount = fn.metadata.usageCount + 1;
        const newSuccessRate =
            (fn.metadata.successRate * fn.metadata.usageCount + (success ? 1 : 0)) /
            newUsageCount;
        const newAvgTime =
            (fn.metadata.avgExecutionTimeMs * fn.metadata.usageCount + duration) /
            newUsageCount;

        fn.metadata.usageCount = newUsageCount;
        fn.metadata.successRate = newSuccessRate;
        fn.metadata.avgExecutionTimeMs = newAvgTime;

        // Persist to DB
        try {
            await db.execute(
                `UPDATE composed_functions
                 SET usage_count = ?, success_rate = ?, avg_execution_time_ms = ?, updated_at = ?
                 WHERE id = ?`,
                [newUsageCount, newSuccessRate, newAvgTime, new Date().toISOString(), functionId]
            );
        } catch (error: any) {
            logger.error("Failed to persist function metrics", { error: error.message });
        }

        logger.info("Function metrics updated", {
            functionId,
            usageCount: newUsageCount,
            successRate: newSuccessRate,
        });
    }
}

export const executionSandbox = new ExecutionSandbox();
