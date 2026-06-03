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

export interface DashboardMetrics {
    email_count: number;
    unresolved_alerts_count: number;
    entities_count: number;
    event_count: number;
    timestamp: string;
}

export interface AuditLog {
    id: string;
    action: string;
    performed_by: string;
    object_type: string;
    object_id: string;
    changes: any;
    created_at: string;
}

export interface Alert {
    id: string;
    alert_type: string;
    message: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    status: "UNRESOLVED" | "RESOLVED" | "SNOOZED" | "ACKNOWLEDGED";
    created_at: string;
    entity_id?: string;
    rule_id?: string;
}

export interface Mailbox {
    id: string;
    provider_type: string;
    connection_status: string;
    last_sync_time: string;
    error_state?: string;
    scope_state?: string;
}

export interface RawEmail {
    id: string;
    mailbox_id: string;
    thread_id: string;
    sender: string;
    subject?: string;
    body?: string;
    received_at: string;
    normalized_metadata?: any;
}

export interface SystemHealth {
    status: string;
    db: string;
    redis: string;
    worker: string;
    ai_provider: string;
}

export interface DLQItem {
    id: string;
    mailbox_id: string;
    provider_message_id: string;
    fail_reason: string;
    retry_count: number;
    created_at: string;
    status: string;
}

export interface Report {
    id: string;
    name: string;
    description?: string;
    time_range_start: string;
    time_range_end: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    created_at: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiClient {
    private static tenantId: string | null = null;
    private static userId: string | null = null;

    /**
     * Updates the global authentication context for API requests.
     */
    static setAuth(tenantId: string, userId: string) {
        this.tenantId = tenantId;
        this.userId = userId;
    }

    public static async request<T>(path: string, options?: RequestInit): Promise<T> {
        if (!this.tenantId || !this.userId) {
            // During initial load or before sync, we might not have these yet
            // Return empty or throw depending on path
            if (path === "/health" || path === "/ready") {
                // Public paths allowed
            } else {
                console.warn(`[ApiClient] Request to ${path} without auth context. Returning fallback empty response.`);
                if (path.includes("/emails") || path.includes("/alerts") || path.includes("/reports") || path.includes("/quarantine") || path.includes("/shipments")) {
                    return [] as any;
                }
                return {} as any;
            }
        }
        
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(this.tenantId && { "x-tenant-id": this.tenantId }),
                ...(this.userId && { "X-User-ID": this.userId }),
                "X-User-Role": "admin", // Standard for developer local setup
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
     * Gmail connection helpers
     */
    static async getGmailAuthUrl(): Promise<{ authorization_url: string }> {
        return this.request<{ authorization_url: string }>("/api/trackflow/mailboxes/gmail/auth-url");
    }

    static async disconnectGmail(): Promise<{ status: string }> {
        return this.request<{ status: string }>("/api/trackflow/mailboxes/gmail/disconnect", { method: "POST" });
    }

    static async testGmailConnection(): Promise<any> {
        return this.request<any>("/api/trackflow/mailboxes/gmail/test", { method: "POST" });
    }

    static async getOutlookAuthUrl(): Promise<{ authorization_url: string }> {
        return this.request<{ authorization_url: string }>("/api/trackflow/mailboxes/outlook/auth-url");
    }

    static async disconnectOutlook(): Promise<{ status: string }> {
        return this.request<{ status: string }>("/api/trackflow/mailboxes/outlook/disconnect", { method: "POST" });
    }

    static async testOutlookConnection(): Promise<any> {
        return this.request<any>("/api/trackflow/mailboxes/outlook/test", { method: "POST" });
    }

    static async getMailboxConnections(): Promise<any[]> {
        // We'll need an endpoint to list connections, or just use test for now
        // Let's add a list endpoint to the backend later if needed, but test returns the status of active one
        return this.request<any[]>("/api/trackflow/mailboxes");
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

    /**
     * Fetches dashboard metrics for the current tenant.
     */
    static async getDashboardMetrics(): Promise<DashboardMetrics> {
        return this.request<DashboardMetrics>("/dashboard/metrics");
    }

    /**
     * Fetches recent audit logs.
     */
    static async getAuditLogs(): Promise<AuditLog[]> {
        return this.request<AuditLog[]>("/audit_logs");
    }

    /**
     * Fetches all alerts for the current tenant.
     */
    static async getAlerts(): Promise<Alert[]> {
        return this.request<Alert[]>("/alerts");
    }

    /**
     * Fetches all mailboxes for the current tenant.
     */
    static async getMailboxes(): Promise<Mailbox[]> {
        return this.request<Mailbox[]>("/mailboxes");
    }

    /**
     * Fetches all raw emails for the current tenant.
     */
    static async getEmails(): Promise<RawEmail[]> {
        return this.request<RawEmail[]>("/emails");
    }

    /**
     * Searches for objects (emails, alerts, entities) using the backend search service.
     */
    static async search(query: string): Promise<{ emails: RawEmail[], alerts: Alert[] }> {
        return this.request<{ emails: RawEmail[], alerts: Alert[] }>(`/search?query=${encodeURIComponent(query)}`);
    }

    /**
     * Fetches all emails in a thread.
     */
    static async getThread(mailboxId: string, threadId: string): Promise<RawEmail[]> {
        return this.request<RawEmail[]>(`/emails/thread/${threadId}?mailbox_id=${mailboxId}`);
    }

    /**
     * Fetches detailed system health.
     */
    static async getSystemHealth(): Promise<SystemHealth> {
        return this.request<SystemHealth>("/ready");
    }

    /**
     * Fetches Dead Letter Queue items.
     */
    static async getDLQ(): Promise<DLQItem[]> {
        return this.request<DLQItem[]>("/dlq");
    }

    /**
     * Replays a job from DLQ.
     */
    static async replayDLQ(id: string): Promise<{ status: string }> {
        return this.request<{ status: string }>(`/dlq/${id}/replay`, { method: "POST" });
    }

    /**
     * Registers a new mailbox directly with an access token (for real sync).
     */
    static async registerMailbox(payload: { provider_type: string, email: string, access_token: string, refresh_token?: string, tenant_id?: string, user_id?: string }): Promise<any> {
        return this.request<any>("/mailboxes/register", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    static async getTrackingProviders(): Promise<any[]> {
        return this.request<any[]>("/trackflow/providers");
    }

    static async connectTrackingProvider(payload: { provider_type: string, credentials: Record<string, string>, region?: string }): Promise<any> {
        return this.request<any>("/trackflow/providers/connect", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    static async testTrackingProvider(providerType: string): Promise<any> {
        return this.request<any>(`/trackflow/providers/${providerType}/test`, { method: "POST" });
    }

    static async syncTrackingProvider(providerType: string): Promise<any> {
        return this.request<any>(`/trackflow/providers/${providerType}/sync`, { method: "POST" });
    }

    static async disconnectTrackingProvider(providerType: string): Promise<any> {
        return this.request<any>(`/trackflow/providers/${providerType}`, { method: "DELETE" });
    }

    /**
     * Generates an AI response draft for an email.
     */
    static async generateDraft(emailId: string, mode: string = "professional"): Promise<any> {
        return this.request<any>(`/emails/${emailId}/draft?mode=${mode}`, { method: "POST" });
    }

    /**
     * Approves and dispatches an AI response draft.
     */
    static async approveDraft(reviewItemId: string): Promise<any> {
        return this.request<any>(`/review/${reviewItemId}/approve`, { method: "POST" });
    }

    /**
     * Fetches context-aware quick suggestions for an email.
     */
    static async getQuickSuggestions(emailId: string): Promise<string[]> {
        return this.request<string[]>(`/emails/${emailId}/suggestions`, { method: "POST" });
    }

    /**
     * Fetches all reports for the current tenant.
     */
    static async getReports(): Promise<Report[]> {
        return this.request<Report[]>("/reports");
    }

    /**
     * Fetch freight dashboard summary.
     */
    static async getFreightDashboardSummary(): Promise<any> {
        return this.request<any>("/freight/dashboard/summary");
    }

    /**
     * Fetch freight dashboard shipments.
     */
    static async getFreightDashboardShipments(params?: {
        carrier?: string;
        port?: string;
        status?: string;
        is_arrived?: boolean;
        is_delayed?: boolean;
        no_update_breached?: boolean;
    }): Promise<any[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) queryParams.append(key, String(value));
            });
        }
        const qs = queryParams.toString();
        return this.request<any[]>(`/freight/dashboard/shipments${qs ? `?${qs}` : ""}`);
    }

    /**
     * Fetch freight dashboard alerts.
     */
    static async getFreightDashboardAlerts(params?: {
        severity?: string;
        status?: string;
        rule_type?: string;
        shipment_id?: string;
    }): Promise<any[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) queryParams.append(key, String(value));
            });
        }
        const qs = queryParams.toString();
        return this.request<any[]>(`/freight/dashboard/alerts${qs ? `?${qs}` : ""}`);
    }

    /**
     * Fetch quarantined items.
     */
    static async getFreightDashboardQuarantine(): Promise<any[]> {
        return this.request<any[]>("/freight/dashboard/quarantine");
    }

    /**
     * Fetch past report runs.
     */
    static async getFreightDashboardReports(): Promise<any[]> {
        return this.request<any[]>("/freight/dashboard/reports");
    }

    /**
     * Fetch freight shipment detail.
     */
    static async getFreightDashboardShipmentDetail(id: string): Promise<any> {
        return this.request<any>(`/freight/dashboard/shipments/${id}`);
    }

    /**
     * Fetch report schedules.
     */
    static async getFreightReportSchedules(): Promise<any[]> {
        return this.request<any[]>("/freight/reports/schedules");
    }

    /**
     * Create report schedule.
     */
    static async createFreightReportSchedule(payload: any): Promise<any> {
        return this.request<any>("/freight/reports/schedules", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    /**
     * Update report schedule.
     */
    static async updateFreightReportSchedule(id: string, payload: any): Promise<any> {
        return this.request<any>(`/freight/reports/schedules/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    }

    /**
     * Delete report schedule.
     */
    static async deleteFreightReportSchedule(id: string): Promise<void> {
        await this.request<void>(`/freight/reports/schedules/${id}`, {
            method: "DELETE"
        });
    }

    /**
     * Fetch tenant freight config.
     */
    static async getFreightConfig(): Promise<any> {
        return this.request<any>("/freight/config");
    }

    /**
     * Update tenant freight config.
     */
    static async updateFreightConfig(payload: any): Promise<any> {
        return this.request<any>("/freight/config", {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    }

    /**
     * Send message to copilot.
     */
    static async freightCopilotChat(message: string): Promise<any> {
        return this.request<any>("/freight/copilot/chat", {
            method: "POST",
            body: JSON.stringify({ message })
        });
    }

    /**
     * Fetch demo readiness score.
     */
    static async getFreightDemoReadiness(): Promise<any> {
        return this.request<any>("/freight/demo/readiness");
    }

    /**
     * Fetch demo walkthrough checklist.
     */
    static async getFreightDemoChecklist(): Promise<any> {
        return this.request<any>("/freight/demo/checklist");
    }

    // --- Phase 4 Enterprise Hardening APIs ---

    /**
     * Fetch onboarding status.
     */
    static async getFreightOnboarding(): Promise<any> {
        return this.request<any>("/freight/onboarding");
    }

    /**
     * Connect mailbox onboarding step.
     */
    static async connectMailboxOnboarding(): Promise<any> {
        return this.request<any>("/freight/onboarding/connect-mailbox", { method: "POST" });
    }

    /**
     * Validate ingestion onboarding step.
     */
    static async validateIngestionOnboarding(): Promise<any> {
        return this.request<any>("/freight/onboarding/validate-ingestion", { method: "POST" });
    }

    /**
     * Validate sync onboarding step.
     */
    static async validateSyncOnboarding(): Promise<any> {
        return this.request<any>("/freight/onboarding/validate-sync", { method: "POST" });
    }

    /**
     * Complete onboarding workflow.
     */
    static async completeOnboarding(): Promise<any> {
        return this.request<any>("/freight/onboarding/complete", { method: "POST" });
    }

    static async completeOnboardingStep(step: string): Promise<any> {
        return this.request<any>(`/freight/onboarding/steps/${step}`, { method: "POST" });
    }

    /**
     * Settings
     * Fetch provider connections.
     */
    static async getFreightProviders(): Promise<any[]> {
        return this.request<any[]>("/freight/providers");
    }

    /**
     * Connect a provider.
     */
    static async connectFreightProvider(provider: string, connectionMetadata?: any): Promise<any> {
        return this.request<any>(`/freight/providers/${provider}/connect`, {
            method: "POST",
            body: connectionMetadata ? JSON.stringify({ connection_metadata: connectionMetadata }) : undefined
        });
    }

    /**
     * Disconnect a provider.
     */
    static async disconnectFreightProvider(provider: string): Promise<any> {
        return this.request<any>(`/freight/providers/${provider}/disconnect`, { method: "POST" });
    }

    /**
     * Rotate credentials for a provider.
     */
    static async rotateFreightProvider(provider: string, connectionMetadata: any): Promise<any> {
        return this.request<any>(`/freight/providers/${provider}/rotate`, {
            method: "POST",
            body: JSON.stringify({ connection_metadata: connectionMetadata })
        });
    }

    /**
     * Test connection for a provider.
     */
    static async testFreightProvider(provider: string): Promise<any> {
        return this.request<any>(`/freight/providers/${provider}/test`, { method: "POST" });
    }

    /**
     * Get operations health status.
     */
    static async getFreightAdminHealth(): Promise<any> {
        return this.request<any>("/freight/admin/health");
    }

    /**
     * Fetch health of dependencies.
     */
    static async getHealthDependencies(): Promise<any> {
        return this.request<any>("/freight/health/dependencies");
    }

    /**
     * Fetch queue depths.
     */
    static async getAdminJobs(): Promise<any> {
        return this.request<any>("/freight/admin/jobs");
    }

    /**
     * Fetch job failures.
     */
    static async getAdminFailures(): Promise<any[]> {
        return this.request<any[]>("/freight/admin/failures");
    }

    /**
     * Fetch provider connection health from admin side.
     */
    static async getAdminProviders(): Promise<any[]> {
        return this.request<any[]>("/freight/admin/providers");
    }

    /**
     * Fetch health of a specific tenant.
     */
    static async getTenantHealth(tenantId: string): Promise<any> {
        return this.request<any>(`/freight/admin/tenants/${tenantId}/health`);
    }

    /**
     * Fetch audit logs.
     */
    static async getAdminAuditLogs(): Promise<any[]> {
        return this.request<any[]>("/freight/admin/audit-logs");
    }

    /**
     * Fetch pending approvals.
     */
    static async getAdminApprovals(): Promise<any[]> {
        return this.request<any[]>("/freight/admin/approvals");
    }

    /**
     * Resolve pending approval (approve/reject).
     */
    static async resolveApproval(id: string, action: "approved" | "rejected"): Promise<any> {
        return this.request<any>(`/freight/admin/approvals/${id}/resolve?action=${action}`, { method: "POST" });
    }

    /**
     * Replay a quarantined raw email.
     */
    static async replayQuarantine(rawEmailId: string): Promise<any> {
        return this.request<any>(`/freight/admin/quarantine/${rawEmailId}/replay`, { method: "POST" });
    }

    /**
     * Resync a specific shipment.
     */
    static async resyncShipment(id: string): Promise<any> {
        return this.request<any>(`/freight/admin/shipments/${id}/resync`, { method: "POST" });
    }

    /**
     * Resync all shipments of a target tenant.
     */
    static async fullResyncTenant(targetTenantId: string): Promise<any> {
        return this.request<any>(`/freight/admin/tenants/${targetTenantId}/full-resync`, { method: "POST" });
    }

    /**
     * Disable a specific carrier.
     */
    static async disableCarrier(carrier: string): Promise<any> {
        return this.request<any>(`/freight/admin/carriers/${carrier}/disable`, { method: "POST" });
    }

    /**
     * Pause notifications for a tenant.
     */
    static async pauseNotifications(targetTenantId: string): Promise<any> {
        return this.request<any>(`/freight/admin/tenants/${targetTenantId}/pause-notifications`, { method: "POST" });
    }

    /**
     * Retry a failed report run.
     */
    static async retryReportRun(id: string): Promise<any> {
        return this.request<any>(`/freight/admin/report-runs/${id}/retry`, { method: "POST" });
    }
}
