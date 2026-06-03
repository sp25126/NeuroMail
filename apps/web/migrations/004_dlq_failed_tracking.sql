CREATE TABLE IF NOT EXISTS dlq_failed_tracking (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    error_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    last_attempted_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON dlq_failed_tracking(tenant_id);
