import pino from "pino";

// Production-grade structured logging
const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport:
        process.env.NODE_ENV === "development"
            ? {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname",
                },
            }
            : undefined,
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

export interface Span {
    spanId: string;
    name: string;
    startTime: number;
    metadata: Record<string, any>;
    end(result: { success: boolean; error?: string;[key: string]: any }): void;
}

export class Logger {
    private component: string;
    private activeSpans: Map<string, Span> = new Map();

    constructor(component: string) {
        this.component = component;
    }

    info(message: string, metadata?: Record<string, any>): void {
        logger.info({ component: this.component, ...metadata }, message);
    }

    warn(message: string, metadata?: Record<string, any>): void {
        logger.warn({ component: this.component, ...metadata }, message);
    }

    error(message: string, metadata?: Record<string, any>): void {
        logger.error({ component: this.component, ...metadata }, message);
    }

    debug(message: string, metadata?: Record<string, any>): void {
        logger.debug({ component: this.component, ...metadata }, message);
    }

    /**
     * Start a distributed trace span
     */
    startSpan(name: string, metadata: Record<string, any> = {}): Span {
        const spanId = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const startTime = Date.now();

        const span: Span = {
            spanId,
            name,
            startTime,
            metadata,
            end: (result) => {
                const duration = Date.now() - startTime;

                this.info(`Span completed: ${name}`, {
                    spanId,
                    durationMs: duration,
                    ...metadata,
                    ...result,
                });

                this.activeSpans.delete(spanId);

                // Send to tracing backend (optional)
                if (process.env.ENABLE_TRACING === "true") {
                    this.sendToTracing({
                        spanId,
                        name,
                        component: this.component,
                        startTime,
                        endTime: Date.now(),
                        duration,
                        ...metadata,
                        ...result,
                    });
                }
            },
        };

        this.activeSpans.set(spanId, span);
        this.debug(`Span started: ${name}`, { spanId, ...metadata });

        return span;
    }

    /**
     * Send trace data to external service (e.g., Jaeger, Datadog)
     */
    private async sendToTracing(data: any): Promise<void> {
        try {
            if (typeof window === "undefined" || !process.env.TRACING_ENDPOINT) return;
            // Example: Send to custom tracing endpoint
            await fetch(process.env.TRACING_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
        } catch (error) {
            // Silent fail - don't break app if tracing fails
            logger.debug({ error }, "Failed to send trace");
        }
    }
}

export function createLogger(component: string): Logger {
    return new Logger(component);
}

// Metrics collection
export class MetricsCollector {
    private counters: Map<string, number> = new Map();
    private histograms: Map<string, number[]> = new Map();

    increment(metric: string, value: number = 1): void {
        const current = this.counters.get(metric) || 0;
        this.counters.set(metric, current + value);
    }

    recordValue(metric: string, value: number): void {
        const values = this.histograms.get(metric) || [];
        values.push(value);

        // Keep last 1000 values
        if (values.length > 1000) {
            values.shift();
        }

        this.histograms.set(metric, values);
    }

    getMetrics(): Record<string, any> {
        const metricsMap: Record<string, any> = {};

        // Counters
        this.counters.forEach((value, key) => {
            metricsMap[key] = value;
        });

        // Histograms (p50, p95, p99)
        this.histograms.forEach((values, key) => {
            const sorted = [...values].sort((a, b) => a - b);
            const len = sorted.length;

            metricsMap[`${key}_p50`] = sorted[Math.floor(len * 0.5)];
            metricsMap[`${key}_p95`] = sorted[Math.floor(len * 0.95)];
            metricsMap[`${key}_p99`] = sorted[Math.floor(len * 0.99)];
            metricsMap[`${key}_count`] = len;
        });

        return metricsMap;
    }

    reset(): void {
        this.counters.clear();
        this.histograms.clear();
    }
}

export const metrics = new MetricsCollector();
