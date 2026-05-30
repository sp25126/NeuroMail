export interface HealthStatus {
    status: string;
    env: string;
    version: string;
}

export interface ReadinessStatus {
    ready: boolean;
    dependencies: {
        database: string;
    };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiClient {
    private static async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`API Request failed: HTTP ${response.status} - ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Checks process health status.
     */
    static async getHealth(): Promise<HealthStatus> {
        return this.request<HealthStatus>("/health");
    }

    /**
     * Checks database dependency readiness.
     */
    static async getReadiness(): Promise<ReadinessStatus> {
        const res = await this.request<any>("/ready");
        return {
            ready: res.ready === true || res.status === "ready",
            dependencies: {
                database: res.db || (res.dependencies && res.dependencies.database) || "unknown"
            }
        };
    }
}
