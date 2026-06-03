-- Phase 2 Canonical Schema for Neuromail Freight Module
-- Overwrites basic module tables with comprehensive, production-ready schema definitions

CREATE TABLE IF NOT EXISTS freight_mailboxes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    provider_type TEXT CHECK(provider_type IN ('GMAIL', 'OUTLOOK')) NOT NULL,
    connection_status TEXT CHECK(connection_status IN ('CONNECTED', 'DISCONNECTED', 'EXPIRED')) NOT NULL,
    last_sync_time TEXT,
    mailbox_config TEXT, -- JSON config string
    encrypted_token TEXT, -- Encrypted credentials or refresh references
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_emails (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    mailbox_id TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    sender TEXT,
    subject TEXT,
    body_preview TEXT,
    processing_status TEXT CHECK(processing_status IN ('PENDING', 'PROCESSED', 'FAILED', 'QUARANTINED')) DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    FOREIGN KEY(mailbox_id) REFERENCES freight_mailboxes(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, mailbox_id, provider_message_id)
);

CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    current_status TEXT CHECK(current_status IN ('IN_TRANSIT', 'ARRIVED_PORT', 'AVAILABLE_PICKUP', 'DELIVERED', 'CANCELLED', 'UNKNOWN')) DEFAULT 'UNKNOWN',
    latest_eta TEXT,
    origin TEXT,
    destination TEXT,
    last_free_day TEXT,
    current_provider TEXT,
    risk_flags TEXT, -- JSON config string
    last_synced_time TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_identifiers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    identifier_type TEXT CHECK(identifier_type IN ('REFERENCE', 'BILL_OF_LADING', 'BOOKING_NUMBER', 'CONTAINER_NUMBER', 'TRACKING_ID')) NOT NULL,
    normalized_value TEXT NOT NULL,
    original_value TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, identifier_type, normalized_value)
);

CREATE TABLE IF NOT EXISTS shipment_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    source_provider TEXT,
    source_event_key TEXT,
    normalized_milestone TEXT NOT NULL,
    raw_payload TEXT, -- JSON raw carrier event payload
    event_time TEXT NOT NULL,
    recorded_time TEXT NOT NULL,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    alert_type TEXT CHECK(alert_type IN ('PORT_ARRIVAL', 'AVAILABLE_PICKUP', 'DELAY', 'APPROACHING_LFD', 'NO_UPDATE')) NOT NULL,
    severity TEXT CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL')) NOT NULL,
    status TEXT CHECK(status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FAILED')) DEFAULT 'ACTIVE',
    dedupe_key TEXT NOT NULL,
    trigger_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS report_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    time_window TEXT,
    generation_status TEXT CHECK(generation_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')) DEFAULT 'PENDING',
    requested_by TEXT NOT NULL,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_files (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    file_storage_ref TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES report_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS freight_settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    ingestion_cadence TEXT,
    sync_cadence TEXT,
    report_options TEXT, -- JSON options
    alert_toggles TEXT, -- JSON config
    parsing_preferences TEXT, -- JSON config
    feature_flags TEXT, -- JSON config
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_mailboxes_tenant ON freight_mailboxes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_raw_emails_tenant_mailbox ON raw_emails(tenant_id, mailbox_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_identifiers_lookup ON shipment_identifiers(tenant_id, identifier_type, normalized_value);
CREATE INDEX IF NOT EXISTS idx_identifiers_shipment ON shipment_identifiers(shipment_id);
CREATE INDEX IF NOT EXISTS idx_events_lookup ON shipment_events(tenant_id, shipment_id, event_time);
CREATE INDEX IF NOT EXISTS idx_alerts_lookup ON alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_report_jobs_lookup ON report_jobs(tenant_id, generation_status);
CREATE INDEX IF NOT EXISTS idx_report_files_job ON report_files(job_id);
