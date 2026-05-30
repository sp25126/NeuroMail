// Shared Types & Contracts for Neuromail
export interface UserSession {
    userId: string;
    email: string;
    role: "admin" | "operator" | "user";
    tenantId: string;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertPayload {
    id: string;
    title: string;
    message: string;
    severity: AlertSeverity;
    timestamp: string;
    resolved: boolean;
}

export const ALERT_SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];

export const HEALTH_STATUS = {
    OK: "ok",
    ERROR: "error",
};
